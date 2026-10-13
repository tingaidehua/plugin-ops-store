"""Hermes overlay for plugin-ops-store."""
from __future__ import annotations
import json, os, subprocess
from pathlib import Path

def _plugin_root() -> Path:
    here = Path(__file__).resolve().parent
    cand = here.parents[1]
    if (cand / "bin" / "invoke.mjs").exists():
        return cand
    env = os.environ.get("PLUGIN_OPS_STORE_ROOT")
    if env and (Path(env) / "bin" / "invoke.mjs").exists():
        return Path(env)
    for p in (
        Path(r"C:\workspace\agent-plugins\plugin-ops-store"),
        Path.home() / "workspace" / "dsh-ops" / "plugin-ops-store",
        Path("/opt/agent-plugins/plugin-ops-store"),
        Path("/opt/plugin-ops/plugin-ops-store"),
    ):
        if (p / "bin" / "invoke.mjs").exists():
            return p
    return cand


PLUGIN_ROOT = _plugin_root()
INVOKE = PLUGIN_ROOT / "bin" / "invoke.mjs"

def _run(tool: str, params: dict | None = None) -> str:
    node = os.environ.get("NODE_BIN", "node")
    r = subprocess.run(
        [node, str(INVOKE), tool, json.dumps(params or {})],
        capture_output=True, text=True, timeout=60, cwd=str(PLUGIN_ROOT),
    )
    return (r.stdout or r.stderr or "").strip() or json.dumps({"ok": False, "error": "empty"})

def register(ctx):
    for name, desc in [
        ("ops_db_status", "Shared SQLite status"),
        ("ops_frp_alloc", "Sticky frp remote port alloc"),
        ("ops_frp_leases", "List frp leases"),
        ("ops_frp_release", "Release/forget lease"),
        ("ops_notify_push", "Push ops notification"),
        ("ops_notify_list", "List notifications"),
        ("ops_notify_ack", "Ack notification"),
    ]:
        ctx.register_tool(
            name=name,
            toolset="plugin-ops-store",
            schema={"name": name, "description": desc, "parameters": {"type": "object", "additionalProperties": True}},
            handler=lambda params, _n=name, **kw: _run(_n, dict(params or {})),
        )
