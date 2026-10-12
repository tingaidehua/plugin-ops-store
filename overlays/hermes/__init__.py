"""Hermes overlay for plugin-ops-store."""
from __future__ import annotations
import json, os, subprocess
from pathlib import Path

PLUGIN_ROOT = Path(__file__).resolve().parents[2]
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
