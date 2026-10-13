# plugin-ops-store

Shared **SQLite** state for DSH 运维插件（frp 出网租约、通知、kv、审计）。

## 原则

| 放 SQLite | 放 `~/.env` / `~/.config/plugin-frp/credentials.env` |
|-----------|--------------------------------------------------|
| sticky 远程端口租约 | `FRP_SERVER_ADDR`（用户提供，源码永不写死） |
| frpc 在线检测结果 | `FRP_TOKEN` |
| 运维通知队列 | dashboard 密码 |
| 插件共享 kv / 审计 | |

默认库路径：

- 服务器有写权限：`/var/lib/plugin-ops/ops.sqlite`
- 否则：`~/.local/state/dsh-ops/ops.sqlite`
- 覆盖：`PLUGIN_OPS_DB=/path/ops.sqlite`

## 安装

与其它 ops 插件并列：

```bash
dsh plugin --profile web add github:tingaidehua/plugin-ops-store
# 或 /opt/agent-plugins/plugin-ops-store
```

其它插件通过 sibling 路径导入：

```js
import { importOpsStore } from '../plugin-ops-store/lib/resolve.js'
const store = await importOpsStore(import.meta.url)
const { allocLease, notifyPush } = store
```

或设置 `PLUGIN_OPS_STORE_DIR`。

## 工具（underscore 名，兼容 DeepSeek）

- `ops_db_status` / `ops_kv_get` / `ops_kv_set`
- `ops_frp_alloc` / `ops_frp_leases` / `ops_frp_release` / `ops_frp_sync_online` / `ops_frp_events`
- `ops_notify_push` / `ops_notify_list` / `ops_notify_ack`

## 引擎

Node `node:sqlite`（需 Node ^22.19 或 >=24），无原生编译依赖。
