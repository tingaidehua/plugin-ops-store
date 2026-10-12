#!/usr/bin/env node
import { storeStatus, kvGet, kvSet, audit } from '../lib/db.js'
import {
  listLeases, allocLease, releaseLease, recentFrpEvents, syncOnlineFromPorts,
} from '../lib/frp.js'
import { notifyPush, notifyList, notifyAck, notifyAckAll } from '../lib/notify.js'

const tools = {
  ops_db_status: () => storeStatus(),
  ops_kv_get: (a) => ({ ok: true, value: kvGet(a.namespace, a.key) }),
  ops_kv_set: (a) => { kvSet(a.namespace, a.key, a.value); audit('plugin-ops-store', 'kv_set', `${a.namespace}/${a.key}`); return { ok: true } },
  ops_frp_leases: (a) => ({ ok: true, leases: listLeases(a || {}) }),
  ops_frp_alloc: (a) => allocLease(a || {}),
  ops_frp_release: (a) => releaseLease(a.clientId, a.localPort, { forgetPort: !!a.forgetPort }),
  ops_frp_events: (a) => ({ ok: true, events: recentFrpEvents(a?.limit || 50) }),
  ops_frp_sync_online: (a) => syncOnlineFromPorts(a?.ports || []),
  ops_notify_push: (a) => notifyPush(a || {}),
  ops_notify_list: (a) => ({ ok: true, items: notifyList(a || {}) }),
  ops_notify_ack: (a) => (a?.ackAll ? notifyAckAll() : notifyAck(a?.id)),
}

const name = process.argv[2]
const raw = process.argv[3] || '{}'
if (!name || !tools[name]) {
  console.log(JSON.stringify({ ok: false, error: `unknown tool ${name}`, tools: Object.keys(tools) }))
  process.exit(2)
}
const out = await tools[name](JSON.parse(raw))
console.log(JSON.stringify(out))
