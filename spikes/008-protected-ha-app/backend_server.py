#!/usr/bin/env python3
"""UID-1000 backend and safe read-only diagnostics UI for Spike 008."""

import html
import json
import os
import pathlib
import stat
import tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


PROBE_DIR = pathlib.Path(os.environ.get("PROBE_DIR", "/data/spike-008"))
# Keep this fixture outside the shared /data bind mount. Docker Desktop can
# remap bind-mounted inode ownership, which would make the provider UID appear
# to own its own negative-control fixture.
BACKEND_SECRET = pathlib.Path("/home/backend/.hass-conx-spike-008-backend-synthetic-secret")
BACKEND_PID = PROBE_DIR / "backend.pid"
BACKEND_UID = PROBE_DIR / "backend-uid"
BACKEND_RESULT = PROBE_DIR / "backend-probe.json"
BACKEND_READY = PROBE_DIR / "backend-ready"
PROVIDER_RESULT = PROBE_DIR / "provider-probe.json"
MARKER = pathlib.Path("/config/.hass-conx-spike-008-marker")
CONFIG_TARGETS = ("/config/configuration.yaml", "/config/.storage")
MCP_ENDPOINT = "http://supervisor/core/api/mcp/assist"
SYNTHETIC_SECRET = os.environ.get("HASS_CONX_BACKEND_SYNTHETIC_SECRET", "")
MAX_MCP_RESPONSE_BYTES = 2 * 1024 * 1024


def atomic_json(path: pathlib.Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(value, stream, sort_keys=True, separators=(",", ":"))
            stream.write("\n")
        os.chmod(temporary, 0o644)
        os.replace(temporary, path)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def marker_observation(write_requested: bool) -> str:
    if not write_requested:
        return "present_without_request" if MARKER.exists() else "not_requested"
    return "already_present" if MARKER.exists() else "provider_opt_in_pending"


def path_metadata(path: str) -> dict:
    try:
        value = os.stat(path)
        return {
            "uid": value.st_uid,
            "gid": value.st_gid,
            "mode": format(stat.S_IMODE(value.st_mode), "04o"),
        }
    except OSError as error:
        return {"error_class": type(error).__name__}


def config_target_observations() -> dict:
    """Return metadata/access booleans for fixed paths, never their contents."""
    return {
        path: {
            "metadata": path_metadata(path),
            "readable": os.access(path, os.R_OK),
            "writable": os.access(path, os.W_OK),
        }
        for path in CONFIG_TARGETS
    }


def http_probe(method: str, payload: dict, token: str, session_id: str = "") -> tuple:
    body = json.dumps(payload).encode("utf-8")
    headers = {
        "Accept": "application/json, text/event-stream",
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-06-18",
    }
    if session_id:
        headers["Mcp-Session-Id"] = session_id
    request = Request(
        MCP_ENDPOINT,
        data=body,
        method=method,
        headers=headers,
    )
    try:
        with urlopen(request, timeout=5) as response:
            # Read only in memory for protocol parsing, then discard. Never
            # persist or print a response body.
            response_body = response.read(MAX_MCP_RESPONSE_BYTES + 1)
            return response.status, dict(response.headers), response_body
    except HTTPError as error:
        error.read(MAX_MCP_RESPONSE_BYTES + 1)
        return error.code, dict(error.headers), b""
    except (OSError, URLError, TimeoutError) as error:
        return f"error_{type(error).__name__}", {}, b""


def response_object(response_body: bytes) -> dict:
    """Parse JSON or an SSE data line without retaining the response."""
    try:
        parsed = json.loads(response_body.decode("utf-8"))
        return parsed if isinstance(parsed, dict) else {}
    except (UnicodeDecodeError, ValueError):
        pass
    for line in response_body.decode("utf-8", errors="ignore").splitlines():
        if not line.startswith("data:"):
            continue
        try:
            parsed = json.loads(line[5:].strip())
            if isinstance(parsed, dict):
                return parsed
        except ValueError:
            continue
    return {}


def session_header(headers: dict) -> str:
    for key, value in headers.items():
        if key.lower() == "mcp-session-id":
            return str(value)
    return ""


def official_mcp_probe() -> dict:
    token = os.environ.get("SUPERVISOR_TOKEN", "")
    result = {
        "endpoint": MCP_ENDPOINT,
        "supervisor_token_present": bool(token),
        "initialize": {"status": "not_configured"},
        "tools_list": {"status": "not_attempted"},
    }
    if not token:
        return result

    initialize_payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "hass-conx-protected-ha-probe", "version": "0.1.4"},
        },
    }
    status, headers, initialize_body = http_probe("POST", initialize_payload, token)
    if isinstance(status, int) and status in (200, 202):
        initialize_object = response_object(initialize_body)
        session_id = session_header(headers)
        result["initialize"] = {
            "status": "ok",
            "http_status": status,
            "session_header": "present" if session_id else "absent",
            "protocol_version": initialize_object.get("result", {}).get("protocolVersion")
            if isinstance(initialize_object.get("result"), dict)
            else None,
        }
        notify_payload = {"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}}
        notify_status, _, _ = http_probe("POST", notify_payload, token, session_id)
        tools_status, _, tools_body = http_probe(
            "POST",
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
            token,
            session_id,
        )
        tools_object = response_object(tools_body)
        tools = tools_object.get("result", {}).get("tools")
        names = [tool.get("name") for tool in tools if isinstance(tool, dict) and isinstance(tool.get("name"), str)] if isinstance(tools, list) else []
        result["tools_list"] = {
            "status": "ok" if isinstance(tools_status, int) and tools_status in (200, 202) else "http_error",
            "http_status": tools_status,
            "names": names,
            "count": len(names) if isinstance(tools, list) else None,
            "parse": "ok" if isinstance(tools, list) else "unparsed",
            "response_body": "discarded",
        }
        result["initialized_notification"] = {
            "status": "ok" if isinstance(notify_status, int) and notify_status in (200, 202) else "not_confirmed"
        }
    elif isinstance(status, int):
        result["initialize"] = {"status": "http_error", "http_status": status}
        result["tools_list"] = {"status": "not_attempted"}
    else:
        result["initialize"] = {"status": "transport_error", "error_class": str(status).removeprefix("error_")}
    return result


def backend_observation() -> dict:
    write_requested = os.environ.get("WRITE_MARKER") == "true"
    PROBE_DIR.mkdir(parents=True, exist_ok=True)
    # This value is synthetic and exists solely to test DAC/proc isolation.
    with open(BACKEND_SECRET, "w", encoding="utf-8") as stream:
        stream.write(SYNTHETIC_SECRET)
    os.chmod(BACKEND_SECRET, stat.S_IRUSR | stat.S_IWUSR)
    BACKEND_PID.write_text(str(os.getpid()), encoding="utf-8")
    BACKEND_UID.write_text(str(os.getuid()), encoding="utf-8")
    os.chmod(BACKEND_PID, 0o644)
    os.chmod(BACKEND_UID, 0o644)
    result = {
        "role": "backend",
        "uid": os.getuid(),
        "gid": os.getgid(),
        "synthetic_secret_held": bool(SYNTHETIC_SECRET),
        "supervisor_token_present": "SUPERVISOR_TOKEN" in os.environ,
        "config_path": "/config",
        "config_metadata": path_metadata("/config"),
        "config_target_observations": config_target_observations(),
        "config_readable": os.access("/config", os.R_OK),
        "config_writable": os.access("/config", os.W_OK),
        "marker_requested": write_requested,
        "marker": marker_observation(write_requested),
        "official_mcp": official_mcp_probe(),
    }
    atomic_json(BACKEND_RESULT, result)
    BACKEND_READY.write_text("ready\n", encoding="utf-8")
    os.chmod(BACKEND_READY, 0o644)
    return result


def read_json(path: pathlib.Path):
    try:
        with open(path, encoding="utf-8") as stream:
            return json.load(stream)
    except (OSError, ValueError):
        return {"status": "pending"}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, _format, *_args):
        return

    def _allowed(self) -> bool:
        return self.client_address[0] == "172.30.32.2"

    def do_GET(self):  # noqa: N802
        if not self._allowed():
            self.send_response(403)
            self.end_headers()
            return
        if self.path not in ("/", "/result.json"):
            self.send_response(404)
            self.end_headers()
            return
        payload = {"backend": read_json(BACKEND_RESULT), "provider": read_json(PROVIDER_RESULT)}
        if self.path == "/result.json":
            body = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
            content_type = "application/json"
        else:
            safe = html.escape(json.dumps(payload, indent=2, sort_keys=True))
            body = ("<!doctype html><meta charset=utf-8><title>Spike 008</title>"
                    "<h1>Protected HA probe</h1><p>Machine-readable result:</p>"
                    f"<pre>{safe}</pre>").encode("utf-8")
            content_type = "text/html; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    backend_observation()
    server = HTTPServer(("0.0.0.0", 8099), Handler)
    server.serve_forever()
