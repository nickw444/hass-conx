#!/usr/bin/env python3
"""Capability-free UID-0 provider-shaped probe; emits safe observations only."""

import json
import os
import pathlib
import re
import stat
import subprocess
import tempfile


PROBE_DIR = pathlib.Path(os.environ.get("PROBE_DIR", "/data/spike-008"))
BACKEND_PID = int(os.environ.get("BACKEND_PID", "0"))
BACKEND_SECRET = pathlib.Path("/home/backend/.hass-conx-spike-008-backend-synthetic-secret")
BACKEND_UID = PROBE_DIR / "backend-uid"
RESULT = PROBE_DIR / "provider-probe.json"
WORKSPACE = PROBE_DIR / "provider-workspace"
MARKER = pathlib.Path("/config/.hass-conx-spike-008-marker")
FILESYSTEM_TEST_DIR = pathlib.Path(
    os.environ.get("FILESYSTEM_TEST_DIR", "/config/.hass-conx-spike-008-root-fs-test")
)
CONFIG_TARGETS = ("/config/configuration.yaml", "/config/.storage")
CAPABILITY_FIELDS = (
    "CapInh",
    "CapPrm",
    "CapEff",
    "CapBnd",
    "CapAmb",
    "NoNewPrivs",
    "Seccomp",
    "Seccomp_filters",
)
USER_NAMESPACE_SYSCTLS = (
    "/proc/sys/user/max_user_namespaces",
    "/proc/sys/kernel/unprivileged_userns_clone",
)
SYNTHETIC_MARKER = b"synthetic-backend-secret-not-a-secret"


def atomic_json(path: pathlib.Path, value: object) -> None:
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


def read_backend_secret() -> bool:
    try:
        with open(BACKEND_SECRET, "rb") as stream:
            return SYNTHETIC_MARKER in stream.read()
    except (OSError, ValueError):
        return False


def inspect_backend_environment() -> str:
    try:
        with open(f"/proc/{BACKEND_PID}/environ", "rb") as stream:
            data = stream.read()
    except PermissionError:
        return "denied"
    except OSError:
        return "unavailable"
    return "visible" if b"HASS_CONX_BACKEND_SYNTHETIC_SECRET=" in data else "not_visible"


def bubblewrap(command: list[str]) -> dict:
    try:
        result = subprocess.run(
            ["/usr/bin/bwrap", *command],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            check=False,
            timeout=5,
            text=True,
        )
        observation = {"status": "pass" if result.returncode == 0 else "fail", "exit_code": result.returncode}
        if result.returncode != 0:
            stderr = (result.stderr or "").lower()
            if (
                "no permissions to create new namespace" in stderr
                or "cannot create user namespace" in stderr
                or "user namespace" in stderr
                or "unshare" in stderr
            ):
                observation["reason"] = "user_namespace_denied"
            elif "can't mount proc" in stderr or "mount proc" in stderr:
                observation["reason"] = "proc_mount_denied"
            elif "pivot_root" in stderr or "pivot root" in stderr:
                observation["reason"] = "pivot_root_denied"
            elif "operation not permitted" in stderr:
                observation["reason"] = "operation_not_permitted"
            elif "permission denied" in stderr:
                observation["reason"] = "permission_denied"
            elif "invalid argument" in stderr:
                observation["reason"] = "invalid_argument"
            elif "no such file" in stderr:
                observation["reason"] = "missing_runtime_path"
            else:
                observation["reason"] = "unclassified_failure"
        return observation
    except (OSError, subprocess.SubprocessError) as error:
        return {"status": "error", "error_class": type(error).__name__}


def bwrap_base() -> list[str]:
    return [
        "--unshare-all",
        "--die-with-parent",
        "--ro-bind", "/", "/",
        "--dev", "/dev",
        "--proc", "/proc",
        "--tmpfs", "/tmp",
        "--setenv", "PATH", "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
        "--setenv", "HOME", "/tmp",
    ]


def sandbox_probes() -> dict:
    namespace = bubblewrap([*bwrap_base(), "/usr/bin/id"])
    if namespace["status"] != "pass":
        blocked = {"status": "blocked_by_namespace_startup"}
        return {
            "namespace_startup": namespace,
            "read_only_workspace": blocked,
            "workspace_write": {**blocked, "host_marker_present": False},
        }
    read_only = bubblewrap([
        *bwrap_base(),
        "/bin/sh", "-c", "test ! -w /config",
    ])
    workspace_result = {"status": "error", "error_class": "not_run"}
    try:
        WORKSPACE.mkdir(parents=True, exist_ok=True)
        os.chmod(WORKSPACE, 0o777)
        marker = WORKSPACE / "workspace-write-marker"
        workspace_result = bubblewrap([
            *bwrap_base(),
            "--dir", "/workspace",
            "--bind", str(WORKSPACE), "/workspace",
            "/bin/sh", "-c", "touch /workspace/workspace-write-marker",
        ])
        workspace_result["host_marker_present"] = marker.exists()
        if marker.exists():
            marker.unlink()
    except OSError as error:
        workspace_result = {"status": "error", "error_class": type(error).__name__}
    try:
        WORKSPACE.rmdir()
    except OSError:
        pass
    return {"namespace_startup": namespace, "read_only_workspace": read_only, "workspace_write": workspace_result}


def capability_observations() -> dict:
    """Read fixed /proc status fields without exposing process environment."""
    values = {field: "unavailable" for field in CAPABILITY_FIELDS}
    try:
        with open("/proc/self/status", encoding="utf-8") as stream:
            for line in stream:
                field, separator, value = line.partition(":")
                if separator and field in values:
                    values[field] = value.strip()
    except OSError as error:
        return {"status": "error", "error_class": type(error).__name__}
    return {"status": "ok", "fields": values}


def user_namespace_sysctl_observations() -> dict:
    """Read only the fixed numeric user-namespace sysctl values."""
    observations = {}
    for path in USER_NAMESPACE_SYSCTLS:
        try:
            value = pathlib.Path(path).read_text(encoding="utf-8").strip()
            if not re.fullmatch(r"[+-]?\d+", value):
                observations[path] = {"status": "invalid_value"}
            else:
                observations[path] = {"status": "present", "value": value}
        except FileNotFoundError:
            observations[path] = {"status": "absent"}
        except OSError as error:
            observations[path] = {"status": "error", "error_class": type(error).__name__}
    return observations


def marker_status(write_requested: bool) -> str:
    if not write_requested:
        return "present_without_request" if MARKER.exists() else "not_requested"
    temporary = None
    try:
        # Write and fsync a temporary file, then atomically hard-link it to the
        # marker. Linking (rather than replacing) preserves the no-overwrite
        # contract if another process creates the marker concurrently. The
        # temporary name is removed before returning, so the only persistent
        # configuration mutation is the named marker.
        fd, temporary = tempfile.mkstemp(prefix=f".{MARKER.name}.", dir=MARKER.parent)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write("hass-conx spike 008 opt-in marker\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, 0o644)
        try:
            os.link(temporary, MARKER)
        except FileExistsError:
            return "already_present"
        os.unlink(temporary)
        temporary = None
        return "created"
    except FileExistsError:
        return "already_present"
    except OSError as error:
        return f"write_failed_{type(error).__name__}"
    finally:
        if temporary is not None:
            try:
                os.unlink(temporary)
            except FileNotFoundError:
                pass


def synthetic_filesystem_test() -> dict:
    """Exercise only entrypoint-created fixtures under one fixed test tree."""
    direct_target = FILESYSTEM_TEST_DIR / "direct-target"
    rename_source = FILESYSTEM_TEST_DIR / "rename-source"
    rename_target = FILESYSTEM_TEST_DIR / "rename-target"
    delete_target = FILESYSTEM_TEST_DIR / "delete-target"
    create_target = FILESYSTEM_TEST_DIR / "create-target"
    symlink_entry = FILESYSTEM_TEST_DIR / "symlink-entry"
    symlink_target = FILESYSTEM_TEST_DIR / "symlink-target"
    symlink_replacement = FILESYSTEM_TEST_DIR / ".symlink-replacement"
    result = {}

    try:
        direct_target.write_text("direct-after\n", encoding="utf-8")
        result["direct_overwrite"] = {
            "status": "pass" if direct_target.read_text(encoding="utf-8") == "direct-after\n" else "fail",
            "metadata": path_metadata(str(direct_target)),
        }
    except OSError as error:
        result["direct_overwrite"] = {"status": "error", "error_class": type(error).__name__}

    try:
        create_target.write_text("created\n", encoding="utf-8")
        result["create"] = {"status": "pass", "metadata": path_metadata(str(create_target))}
    except OSError as error:
        result["create"] = {"status": "error", "error_class": type(error).__name__}

    try:
        os.replace(rename_source, rename_target)
        result["rename"] = {
            "status": "pass" if rename_target.exists() and not rename_source.exists() else "fail",
            "metadata": path_metadata(str(rename_target)),
        }
    except OSError as error:
        result["rename"] = {"status": "error", "error_class": type(error).__name__}

    try:
        delete_target.unlink()
        result["delete"] = {"status": "pass" if not delete_target.exists() else "fail"}
    except OSError as error:
        result["delete"] = {"status": "error", "error_class": type(error).__name__}

    try:
        target_before = symlink_target.read_text(encoding="utf-8")
        symlink_replacement.write_text("replacement\n", encoding="utf-8")
        os.replace(symlink_replacement, symlink_entry)
        result["atomic_replace_symlink"] = {
            "status": "pass"
            if not symlink_entry.is_symlink()
            and symlink_entry.read_text(encoding="utf-8") == "replacement\n"
            and symlink_target.read_text(encoding="utf-8") == target_before
            else "fail",
            "entry_is_symlink_after": symlink_entry.is_symlink(),
            "target_unchanged": symlink_target.read_text(encoding="utf-8") == target_before,
            "entry_metadata": path_metadata(str(symlink_entry)),
            "target_metadata": path_metadata(str(symlink_target)),
        }
    except OSError as error:
        result["atomic_replace_symlink"] = {"status": "error", "error_class": type(error).__name__}
    finally:
        try:
            symlink_replacement.unlink()
        except FileNotFoundError:
            pass

    return result


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


def main() -> None:
    try:
        backend_uid = int(BACKEND_UID.read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        backend_uid = None
    backend_environment = inspect_backend_environment()
    write_requested = os.environ.get("WRITE_MARKER") == "true"
    result = {
        "role": "provider",
        "uid": os.getuid(),
        "gid": os.getgid(),
        "supplementary_gids": sorted(os.getgroups()),
        "backend_uid": backend_uid,
        "distinct_uids": backend_uid is not None and backend_uid != os.getuid(),
        "backend_secret_readable": read_backend_secret(),
        "backend_process_environment": backend_environment,
        "backend_process_environment_readable": backend_environment == "visible",
        "provider_environment_contains_backend_secret": "HASS_CONX_BACKEND_SYNTHETIC_SECRET" in os.environ,
        "provider_environment_contains_supervisor_token": "SUPERVISOR_TOKEN" in os.environ,
        "provider_home_writable": os.access("/home/provider", os.W_OK),
        "config_path": "/config",
        "config_metadata": path_metadata("/config"),
        "config_target_observations": config_target_observations(),
        "config_readable": os.access("/config", os.R_OK),
        "config_writable": os.access("/config", os.W_OK),
        "synthetic_filesystem_test": synthetic_filesystem_test(),
        "capability_observations": capability_observations(),
        "user_namespace_sysctl_observations": user_namespace_sysctl_observations(),
        "marker_requested": write_requested,
        "marker": marker_status(write_requested),
        "marker_metadata": path_metadata(str(MARKER)),
        "bubblewrap": sandbox_probes(),
    }
    atomic_json(RESULT, result)


if __name__ == "__main__":
    main()
