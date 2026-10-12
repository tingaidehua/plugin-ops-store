import crypto from 'node:crypto'
import { openDb, nowIso, audit } from './db.js'

const PORT_START = Number(process.env.FRP_ALLOW_START || 60000)
const PORT_END = Number(process.env.FRP_ALLOW_END || 60100)

function newId() {
  return crypto.randomUUID()
}

export function listLeases({ status } = {}) {
  const db = openDb()
  if (status) {
    return db.prepare('SELECT * FROM frp_leases WHERE status = ? ORDER BY updated_at DESC').all(status)
  }
  return db.prepare('SELECT * FROM frp_leases ORDER BY updated_at DESC').all()
}

export function getLease(clientId, localPort) {
  const db = openDb()
  return db.prepare(
    'SELECT * FROM frp_leases WHERE client_id = ? AND local_port = ?',
  ).get(clientId, Number(localPort)) || null
}

export function getLeaseByRemote(remotePort) {
  const db = openDb()
  return db.prepare(
    "SELECT * FROM frp_leases WHERE remote_port = ? AND status = 'active'",
  ).get(Number(remotePort)) || null
}

function usedRemotePorts(db) {
  return new Set(
    db.prepare("SELECT remote_port FROM frp_leases WHERE status != 'released'").all()
      .map((r) => r.remote_port),
  )
}

/** Pick a random free remote port in allow range, avoiding active leases (+ optional listening set). */
export function pickRemotePort(listeningPorts = []) {
  const db = openDb()
  const used = usedRemotePorts(db)
  for (const p of listeningPorts) used.add(Number(p))
  const candidates = []
  for (let p = PORT_START; p <= PORT_END; p++) {
    if (!used.has(p)) candidates.push(p)
  }
  if (!candidates.length) {
    return { ok: false, error: `no free ports in ${PORT_START}-${PORT_END}` }
  }
  const remotePort = candidates[Math.floor(Math.random() * candidates.length)]
  return { ok: true, remotePort, range: `${PORT_START}-${PORT_END}` }
}

/**
 * Allocate or reuse a sticky lease for (clientId, localPort).
 * Sticky: same client+localPort always gets the same remotePort until released.
 */
export function allocLease({
  clientId,
  localPort,
  localIp = '127.0.0.1',
  serverAddr = null,
  proxyName = null,
  listeningPorts = [],
  reuse = true,
} = {}) {
  if (!clientId) return { ok: false, error: 'clientId required' }
  if (!localPort) return { ok: false, error: 'localPort required' }
  const db = openDb()
  const existing = getLease(clientId, localPort)
  if (existing && reuse && existing.status !== 'released') {
    db.prepare(
      `UPDATE frp_leases SET status='active', updated_at=?, server_addr=COALESCE(?, server_addr),
       last_success_at=COALESCE(last_success_at, ?) WHERE id=?`,
    ).run(nowIso(), serverAddr, nowIso(), existing.id)
    addFrpEvent(existing.id, 'reuse', JSON.stringify({ remotePort: existing.remote_port }))
    audit('plugin-ops-store', 'frp_alloc_reuse', existing.id)
    return { ok: true, action: 'reused', lease: getLease(clientId, localPort) }
  }

  const pick = pickRemotePort(listeningPorts)
  if (!pick.ok) return pick
  const id = existing?.id || newId()
  const name = proxyName || `plugin-frp-${String(clientId).slice(0, 24)}-${localPort}-${pick.remotePort}`
  const ts = nowIso()
  db.prepare(
    `INSERT INTO frp_leases(id, client_id, local_ip, local_port, remote_port, proxy_name, server_addr, status, last_success_at, created_at, updated_at)
     VALUES(?,?,?,?,?,?,?,'active',?,?,?)
     ON CONFLICT(client_id, local_port) DO UPDATE SET
       remote_port=excluded.remote_port,
       proxy_name=excluded.proxy_name,
       server_addr=COALESCE(excluded.server_addr, frp_leases.server_addr),
       status='active',
       updated_at=excluded.updated_at`,
  ).run(
    id,
    clientId,
    localIp,
    Number(localPort),
    pick.remotePort,
    name,
    serverAddr,
    ts,
    ts,
    ts,
  )
  const lease = getLease(clientId, localPort)
  addFrpEvent(lease.id, 'alloc', JSON.stringify({ remotePort: lease.remote_port }))
  audit('plugin-ops-store', 'frp_alloc', lease.id)
  return { ok: true, action: existing ? 'reallocated' : 'allocated', lease }
}

export function markLeaseSuccess(leaseId) {
  const db = openDb()
  db.prepare(
    `UPDATE frp_leases SET last_success_at=?, last_seen_online=1, status='active', updated_at=? WHERE id=?`,
  ).run(nowIso(), nowIso(), leaseId)
  addFrpEvent(leaseId, 'success', null)
}

export function markLeaseOnline(leaseId, online) {
  const db = openDb()
  db.prepare(
    `UPDATE frp_leases SET last_seen_online=?, updated_at=? WHERE id=?`,
  ).run(online ? 1 : 0, nowIso(), leaseId)
  addFrpEvent(leaseId, online ? 'online' : 'offline', null)
}

export function releaseLease(clientId, localPort, { forgetPort = false } = {}) {
  const lease = getLease(clientId, localPort)
  if (!lease) return { ok: false, error: 'lease not found' }
  const db = openDb()
  if (forgetPort) {
    db.prepare('DELETE FROM frp_leases WHERE id=?').run(lease.id)
    addFrpEvent(lease.id, 'forget', null)
    audit('plugin-ops-store', 'frp_forget', lease.id)
    return { ok: true, action: 'forgotten', lease }
  }
  db.prepare(
    `UPDATE frp_leases SET status='released', last_seen_online=0, updated_at=? WHERE id=?`,
  ).run(nowIso(), lease.id)
  addFrpEvent(lease.id, 'release', null)
  audit('plugin-ops-store', 'frp_release', lease.id)
  return { ok: true, action: 'released', lease: getLease(clientId, localPort) }
}

export function addFrpEvent(leaseId, event, detail = null) {
  const db = openDb()
  db.prepare(
    'INSERT INTO frp_events(lease_id, event, detail, created_at) VALUES(?,?,?,?)',
  ).run(leaseId || null, event, detail, nowIso())
}

export function recentFrpEvents(limit = 50) {
  const db = openDb()
  return db.prepare(
    'SELECT * FROM frp_events ORDER BY id DESC LIMIT ?',
  ).all(Number(limit))
}

/** Sync online flags from a list of listening remote ports (from frps ss/journal). */
export function syncOnlineFromPorts(listeningRemotePorts = []) {
  const db = openDb()
  const set = new Set(listeningRemotePorts.map(Number))
  const active = db.prepare("SELECT id, remote_port FROM frp_leases WHERE status='active'").all()
  let online = 0
  let offline = 0
  for (const row of active) {
    const isOn = set.has(Number(row.remote_port))
    db.prepare('UPDATE frp_leases SET last_seen_online=?, updated_at=? WHERE id=?')
      .run(isOn ? 1 : 0, nowIso(), row.id)
    if (isOn) online++
    else offline++
  }
  return { ok: true, online, offline, listening: [...set] }
}
