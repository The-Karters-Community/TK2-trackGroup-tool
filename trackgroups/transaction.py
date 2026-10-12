"""Profile-only transaction with retained recovery evidence; no Steam cache editing."""
import hashlib
import json
import os
from pathlib import Path
import tempfile
import time

from .profile import Profile, SAVE_NAME
from .runtime import DATA, game_running, write_json


def digest(data):
    return hashlib.sha256(data).hexdigest()


def require_recovered(backups, path):
    for file in Path(backups).glob("*/transaction.json"):
        journal = json.loads(file.read_text(encoding="utf-8"))
        if journal.get("profile") == str(path) and journal.get("state") in ("prepared", "recovery-required"):
            raise ValueError("An earlier save transaction needs recovery. Keep the game closed. See docs/RECOVERY.md. Diagnostics: " + str(file.parent))


def atomic_bytes(path, data):
    descriptor, temp = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp): os.unlink(temp)


def commit(steam, path, group, expected_hash, account, allow_update=False, *, rename=False, backups=None, running=game_running):
    path = Path(path)
    if not SAVE_NAME.fullmatch(path.name):
        raise ValueError("Unsupported profile filename.")
    if running(): raise ValueError("Close The Karters 2 before importing.")
    require_recovered(backups or DATA / "backups", path)
    if steam.account != account:
        raise ValueError("Steam account changed since preview. Refresh and preview again.")
    before = path.read_bytes()
    if digest(before) != expected_hash:
        raise ValueError("Profile changed since preview. Refresh and review the group again.")
    if steam.read_save(path.name) != before:
        raise ValueError("Local and Steam saves disagree. Open the game to resolve Steam sync, close it, then refresh.")
    after, outcome = Profile(before).rename_group(group['id'], group['name']) if rename else Profile(before).import_group(group, allow_update=allow_update)
    if after == before: return {"outcome": "unchanged", "backup": None}
    folder = (backups or DATA / "backups") / str(time.time_ns())
    folder.mkdir(parents=True)
    (folder / "original.save").write_bytes(before)
    journal = {"profile": str(path), "originalHash": digest(before), "importedHash": digest(after),
        "groupId": group["id"], "state": "prepared"}
    write_json(folder / "transaction.json", journal)
    cloud_attempted = False
    local_attempted = False
    try:
        if running() or path.read_bytes() != before or steam.read_save(path.name) != before:
            raise ValueError("Game or profile changed during import. Close the game and preview again.")
        # Cloud is the game loader's primary source. Attempt it first, retain local original.
        cloud_attempted = True
        steam.write_save(path.name, after)
        if running() or path.read_bytes() != before:
            raise ValueError("Game or local save changed during import; recovering the Steam copy.")
        local_attempted = True
        atomic_bytes(path, after)
        if path.read_bytes() != after or steam.read_save(path.name) != after:
            raise ValueError("Imported profile did not verify in both locations.")
        journal["state"] = "committed"
        write_json(folder / "transaction.json", journal)
        return {"outcome": outcome, "backup": str(folder)}
    except Exception as failure:
        recovery_errors = []
        # Never overwrite concurrent game progress with the previous whole save.
        if cloud_attempted:
            try:
                current = steam.read_save(path.name)
                if current not in (before, after):
                    raise ValueError("Steam save changed externally; automatic recovery stopped.")
                if current != before: steam.write_save(path.name, before)
            except Exception as exc: recovery_errors.append(str(exc))
        if local_attempted:
            try:
                current = path.read_bytes()
                if current not in (before, after):
                    raise ValueError("Local save changed externally; automatic recovery stopped.")
                if current != before: atomic_bytes(path, before)
            except Exception as exc: recovery_errors.append(str(exc))
        journal.update(state="recovery-required" if recovery_errors else "rolled-back", error=str(failure), recoveryErrors=recovery_errors)
        write_json(folder / "transaction.json", journal)
        if recovery_errors:
            raise ValueError(f"Import failed and recovery needs attention. Do not start the game. Backup and diagnostics: {folder}. " + "; ".join(recovery_errors)) from failure
        raise ValueError(f"Import failed; original save retained/restored. {failure}. Backup: {folder}") from failure
