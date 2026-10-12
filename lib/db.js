import { DatabaseSync } from 'node:sqlite'
import { defaultDbPath, ensureParent } from './paths.js'

let _db = null
let _path = null

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kv (
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (namespace, key)
);

CREATE TABLE IF NOT EXISTS frp_leases (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  local_ip TEXT NOT NULL DEFAULT '127.0.0.1',
  local_port INTEGER NOT NULL,
  remote_port INTEGER NOT NULL,
  proxy_name TEXT NOT NULL,
  server_addr TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  last_success_at TEXT,
  last_seen_online INTEGER NOT NULL DEFAULT 0,
  meta_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (client_id, local_port)
);

CREATE INDEX IF NOT EXISTS idx_frp_leases_remote ON frp_leases(remote_port);
CREATE INDEX IF NOT EXISTS idx_frp_leases_status ON frp_leases(status);

CREATE TABLE IF NOT EXISTS frp_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lease_id TEXT,
  event TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_frp_events_created ON frp_events(created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  level TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  source TEXT,
  acked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_acked ON notifications(acked);

CREATE TABLE IF NOT EXISTS ops_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);
`

export function openDb(dbPath = defaultDbPath()) {
  if (_db && _path === dbPath) return _db
  if (_db) {
    try { _db.close() } catch { /* ignore */ }
    _db = null
  }
  ensureParent(dbPath)
  const db = new DatabaseSync(dbPath)
  db.exec(SCHEMA)
  db.prepare(
    `INSERT INTO schema_meta(key, value) VALUES('version', '1')
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
  ).run()
  _db = db
  _path = dbPath
  return db
}

export function dbPath() {
  return _path || defaultDbPath()
}

export function nowIso() {
  return new Date().toISOString()
}

export function kvGet(namespace, key) {
  const db = openDb()
  const row = db.prepare(
    'SELECT value FROM kv WHERE namespace = ? AND key = ?',
  ).get(namespace, key)
  return row ? row.value : null
}

export function kvSet(namespace, key, value) {
  const db = openDb()
  db.prepare(
    `INSERT INTO kv(namespace, key, value, updated_at) VALUES(?,?,?,?)
     ON CONFLICT(namespace, key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
  ).run(namespace, key, String(value), nowIso())
}

export function audit(plugin, action, detail = null) {
  const db = openDb()
  db.prepare(
    'INSERT INTO ops_audit(plugin, action, detail, created_at) VALUES(?,?,?,?)',
  ).run(plugin, action, detail == null ? null : String(detail), nowIso())
}

export function storeStatus() {
  const db = openDb()
  const counts = {
    frp_leases: db.prepare('SELECT COUNT(*) AS c FROM frp_leases').get().c,
    frp_leases_active: db.prepare("SELECT COUNT(*) AS c FROM frp_leases WHERE status='active'").get().c,
    notifications_unacked: db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE acked=0').get().c,
    ops_audit: db.prepare('SELECT COUNT(*) AS c FROM ops_audit').get().c,
  }
  return {
    ok: true,
    dbPath: dbPath(),
    schemaVersion: kvGet('schema', 'version') || db.prepare("SELECT value FROM schema_meta WHERE key='version'").get()?.value,
    counts,
    note: 'Secrets (FRP_TOKEN etc.) stay in ~/.env / credentials.env — never in SQLite.',
  }
}
