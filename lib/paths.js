import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Shared DB path. Override with PLUGIN_OPS_DB. Prefer /var/lib on server, else XDG state. */
export function defaultDbPath() {
  if (process.env.PLUGIN_OPS_DB || process.env.DSH_OPS_DB) {
    return process.env.PLUGIN_OPS_DB || process.env.DSH_OPS_DB
  }
  const varLib = '/var/lib/plugin-ops/ops.sqlite'
  const legacyVar = '/var/lib/dsh-ops/ops.sqlite'
  try {
    if (process.platform !== 'win32') {
      if (fs.existsSync(legacyVar) && !fs.existsSync(varLib)) return legacyVar
      fs.mkdirSync('/var/lib/plugin-ops', { recursive: true, mode: 0o700 })
      return varLib
    }
  } catch {
    /* fall through — no root */
  }
  const state = process.env.XDG_STATE_HOME
    || path.join(os.homedir(), '.local', 'state')
  const dir = path.join(state, 'plugin-ops')
  const legacyDir = path.join(state, 'dsh-ops')
  if (fs.existsSync(path.join(legacyDir, 'ops.sqlite')) && !fs.existsSync(path.join(dir, 'ops.sqlite'))) {
    return path.join(legacyDir, 'ops.sqlite')
  }
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'ops.sqlite')
}

export function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  return filePath
}
