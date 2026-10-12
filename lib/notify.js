import crypto from 'node:crypto'
import { openDb, nowIso, audit } from './db.js'

export function notifyPush({ level = 'info', title, body = '', source = 'ops' } = {}) {
  if (!title) return { ok: false, error: 'title required' }
  const db = openDb()
  const id = crypto.randomUUID()
  db.prepare(
    `INSERT INTO notifications(id, level, title, body, source, acked, created_at)
     VALUES(?,?,?,?,?,0,?)`,
  ).run(id, level, title, body, source, nowIso())
  audit(source || 'dsh-notify', 'notify_push', id)
  return { ok: true, id }
}

export function notifyList({ limit = 50, unackedOnly = false } = {}) {
  const db = openDb()
  if (unackedOnly) {
    return db.prepare(
      'SELECT * FROM notifications WHERE acked=0 ORDER BY created_at DESC LIMIT ?',
    ).all(Number(limit))
  }
  return db.prepare(
    'SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?',
  ).all(Number(limit))
}

export function notifyAck(id) {
  const db = openDb()
  const r = db.prepare('UPDATE notifications SET acked=1 WHERE id=?').run(id)
  return { ok: r.changes > 0, id }
}

export function notifyAckAll() {
  const db = openDb()
  const r = db.prepare('UPDATE notifications SET acked=1 WHERE acked=0').run()
  return { ok: true, acked: r.changes }
}

export function notifyClear({ ackedOnly = true } = {}) {
  const db = openDb()
  const r = ackedOnly
    ? db.prepare('DELETE FROM notifications WHERE acked=1').run()
    : db.prepare('DELETE FROM notifications').run()
  return { ok: true, removed: r.changes }
}
