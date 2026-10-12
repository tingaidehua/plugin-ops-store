import { storeStatus, kvGet, kvSet, audit, openDb, dbPath } from './lib/db.js'
import {
  listLeases,
  allocLease,
  releaseLease,
  recentFrpEvents,
  syncOnlineFromPorts,
} from './lib/frp.js'
import { notifyPush, notifyList, notifyAck, notifyAckAll } from './lib/notify.js'
import { registerJsonTool } from './lib/register-json-tool.js'

export { storeStatus, openDb, dbPath, kvGet, kvSet, audit }
export * from './lib/frp.js'
export * from './lib/notify.js'
export { importOpsStore, candidateStoreRoots } from './lib/resolve.js'

export const name = 'plugin-ops-store'
export const inject = ['tools']

export function apply(ctx) {
  openDb()

  registerJsonTool(ctx, {
    name: 'ops_db_status',
    description: 'Show shared dsh-ops SQLite path and table counts. Secrets are never stored in DB.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    execute: async () => storeStatus(),
  })

  registerJsonTool(ctx, {
    name: 'ops_kv_get',
    description: 'Get a shared ops kv value (namespace+key). Do not store secrets.',
    parameters: {
      type: 'object',
      properties: {
        namespace: { type: 'string' },
        key: { type: 'string' },
      },
      required: ['namespace', 'key'],
      additionalProperties: false,
    },
    execute: async ({ namespace, key }) => ({ ok: true, value: kvGet(namespace, key) }),
  })

  registerJsonTool(ctx, {
    name: 'ops_kv_set',
    description: 'Set a shared ops kv value. Never store tokens/passwords.',
    parameters: {
      type: 'object',
      properties: {
        namespace: { type: 'string' },
        key: { type: 'string' },
        value: { type: 'string' },
      },
      required: ['namespace', 'key', 'value'],
      additionalProperties: false,
    },
    execute: async ({ namespace, key, value }) => {
      kvSet(namespace, key, value)
      audit('plugin-ops-store', 'kv_set', `${namespace}/${key}`)
      return { ok: true }
    },
  })

  registerJsonTool(ctx, {
    name: 'ops_frp_leases',
    description: 'List sticky frp egress leases from shared SQLite.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'active|released|optional filter' },
      },
      additionalProperties: false,
    },
    execute: async ({ status } = {}) => ({ ok: true, leases: listLeases({ status }) }),
  })

  registerJsonTool(ctx, {
    name: 'ops_frp_alloc',
    description: 'Allocate or reuse sticky remote port for clientId+localPort (e.g. 22). Remembers across reconnects.',
    parameters: {
      type: 'object',
      properties: {
        clientId: { type: 'string' },
        localPort: { type: 'number' },
        localIp: { type: 'string' },
        serverAddr: { type: 'string', description: 'Optional label only; never hardcode in source' },
        reuse: { type: 'boolean' },
      },
      required: ['clientId', 'localPort'],
      additionalProperties: false,
    },
    execute: async (args) => allocLease(args),
  })

  registerJsonTool(ctx, {
    name: 'ops_frp_release',
    description: 'Release a lease (keeps remotePort sticky unless forgetPort=true).',
    parameters: {
      type: 'object',
      properties: {
        clientId: { type: 'string' },
        localPort: { type: 'number' },
        forgetPort: { type: 'boolean' },
      },
      required: ['clientId', 'localPort'],
      additionalProperties: false,
    },
    execute: async (args) => releaseLease(args.clientId, args.localPort, { forgetPort: !!args.forgetPort }),
  })

  registerJsonTool(ctx, {
    name: 'ops_frp_events',
    description: 'Recent frp lease events from shared SQLite.',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'number' } },
      additionalProperties: false,
    },
    execute: async ({ limit = 50 } = {}) => ({ ok: true, events: recentFrpEvents(limit) }),
  })

  registerJsonTool(ctx, {
    name: 'ops_frp_sync_online',
    description: 'Mark leases online/offline from a list of listening remote ports (frps detection).',
    parameters: {
      type: 'object',
      properties: {
        ports: { type: 'array', items: { type: 'number' } },
      },
      required: ['ports'],
      additionalProperties: false,
    },
    execute: async ({ ports }) => syncOnlineFromPorts(ports || []),
  })

  registerJsonTool(ctx, {
    name: 'ops_notify_push',
    description: 'Push an ops notification into shared SQLite (for dsh-notify / UI board).',
    parameters: {
      type: 'object',
      properties: {
        level: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string' },
        source: { type: 'string' },
      },
      required: ['title'],
      additionalProperties: false,
    },
    execute: async (args) => notifyPush(args),
  })

  registerJsonTool(ctx, {
    name: 'ops_notify_list',
    description: 'List ops notifications from shared SQLite.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
        unackedOnly: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    execute: async (args) => ({ ok: true, items: notifyList(args) }),
  })

  registerJsonTool(ctx, {
    name: 'ops_notify_ack',
    description: 'Ack one notification by id, or ackAll=true.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        ackAll: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    execute: async ({ id, ackAll } = {}) => (ackAll ? notifyAckAll() : notifyAck(id)),
  })

  console.log('[plugin-ops-store] sqlite ready at', dbPath())
}
