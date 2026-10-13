# plugin-ops-store 设计与踩坑

## 为何 SQLite 而不是各插件 JSON

- 多插件并发写 JSON 易丢数据；SQLite WAL 适合 frp 租约 + 通知
- sticky 端口：`(client_id, local_port) → remote_port` 必须跨重启保留
- 内网智能体重连时复用「曾经成功」的端口，避免每次随机导致对端脚本失效

## 密钥隔离

- **禁止**把 `FRP_TOKEN` / 密码写入 SQLite
- DB 里最多记「已配置」类元数据（可用 kv：`frp/credentials_configured=1`）

## 与 plugin-frp 分工

- **store**：分配/记忆/检测在线、通知、审计
- **plugin-frp**：装 frps/frpc、写 toml、systemd 自启、向用户索取 `FRP_SERVER_ADDR`

## 部署

插件必须并列安装在同一机器（如 `/opt/agent-plugins/*`），否则设 `PLUGIN_OPS_STORE_DIR`。
