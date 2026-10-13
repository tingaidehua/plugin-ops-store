import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORE_ROOT = path.resolve(__dirname, '..')

/**
 * Resolve plugin-ops-store root for sibling installs (/opt/agent-plugins/*, workspace/agent-plugins/*).
 * Other plugins should call: const store = await importOpsStore(import.meta.url)
 */
export function candidateStoreRoots(fromPluginRoot) {
  const list = []
  if (process.env.PLUGIN_OPS_STORE_DIR) list.push(process.env.PLUGIN_OPS_STORE_DIR)
  list.push(
    '/opt/agent-plugins/plugin-ops-store',
    path.resolve(fromPluginRoot, '../plugin-ops-store'),
    path.resolve(fromPluginRoot, '../../agent-plugins/plugin-ops-store'),
    STORE_ROOT,
  )
  return [...new Set(list)]
}

export async function importOpsStore(fromImportMetaUrl) {
  const fromPluginRoot = path.resolve(path.dirname(fileURLToPath(fromImportMetaUrl)), '..')
  for (const root of candidateStoreRoots(fromPluginRoot)) {
    const marker = path.join(root, 'package.json')
    const entry = path.join(root, 'index.js')
    if (fs.existsSync(marker) && fs.existsSync(entry)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(marker, 'utf8'))
        if (pkg.name !== 'plugin-ops-store') continue
      } catch {
        continue
      }
      return import(pathToFileURL(entry).href)
    }
  }
  // last resort: require.resolve if installed as dependency
  try {
    const require = createRequire(fromImportMetaUrl)
    const resolved = require.resolve('plugin-ops-store')
    return import(pathToFileURL(resolved).href)
  } catch {
    throw new Error(
      'plugin-ops-store not found. Install sibling at /opt/agent-plugins/plugin-ops-store or set PLUGIN_OPS_STORE_DIR.',
    )
  }
}
