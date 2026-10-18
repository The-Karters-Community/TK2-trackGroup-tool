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
            if journal.get('mode') == 'live-library':
                raise ValueError("An earlier live library save needs recovery. Refresh Garage before further library changes. See docs/RECOVERY.md. Diagnostics: " + str(file.parent))
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


def library_state(profile):
    """The only two collections a running-game library transaction may replace."""
    presets = json.loads(profile.records[0])
    if not isinstance(presets, list): raise ValueError('Unsupported preset library.')
    return {'presets': presets, 'groups': profile.groups}


def _live_cloud(steam, account):
    if steam.account != account: raise ValueError('Steam account changed during the live save. Refresh Garage.')
    if not steam.storage_call('IsCloudEnabledForAccount') or not steam.storage_call('IsCloudEnabledForApp'):
        raise ValueError('Enable Steam Cloud before saving, so both save copies stay synchronized.')


def _live_verified(steam, path, account, expected, game):
    from .native_quick import request
    deadline = time.monotonic() + 5
    while True:
        try:
            _live_cloud(steam, account)
            raw = path.read_bytes()
            if library_state(Profile(raw)) == expected and steam.read_save(path.name) == raw and path.read_bytes() == raw:
                memory = request(game, path.name, operation=6)
                if memory.get('library') == expected: return True
        except (ValueError, OSError):
            pass
        if time.monotonic() >= deadline: return False
        time.sleep(.15)


def _library_change(before, after):
    original, desired_profile = Profile(before), Profile(after)
    baseline, desired = library_state(original), library_state(desired_profile)
    # Reuse the ordinary edit/import validators, but do not silently route Quick
    # Setup or another profile field into a collection-only native operation.
    original_other = {k:v for k,v in original.data.items() if k != 'ItemsGroupDefinedContainers'}
    desired_other = {k:v for k,v in desired_profile.data.items() if k != 'ItemsGroupDefinedContainers'}
    if original.records[1] != desired_profile.records[1] or original_other != desired_other:
        raise ValueError('This live operation may only change preset and track-group libraries. Use the Quick Setup save action for player setups.')
    return baseline, desired


def _commit_live(steam, path, before, after, outcome, account, game, folder, journal):
    from .native_quick import request
    baseline, desired = _library_change(before, after)
    journal.update(mode='live-library', baselineLibraryHash=digest(json.dumps(baseline, sort_keys=True, ensure_ascii=False).encode()),
                   desiredLibraryHash=digest(json.dumps(desired, sort_keys=True, ensure_ascii=False).encode()))
    write_json(folder / 'transaction.json', journal)
    failure = None
    result = {}
    attempted = False
    try:
        _live_cloud(steam, account)
        current = path.read_bytes()
        if library_state(Profile(current)) != baseline or steam.read_save(path.name) != current:
            raise ValueError('The game library or Steam save changed before saving. Refresh and review again.')
        # Serialization and persistence belong to the game. Its current Quick
        # Setup, progress and settings are never replaced by this stale file.
        attempted = True
        result = request(game, path.name, operation=5, payload={'baseline':baseline, 'desired':desired})
    except Exception as exc:
        failure = exc
    if not attempted:
        journal.update(state='rolled-back', error=str(failure), recoveryErrors=[])
        write_json(folder / 'transaction.json', journal)
        raise ValueError(f'Live save was not started; the library was not changed. {failure}. Backup: {folder}') from failure
    if _live_verified(steam, path, account, desired, game):
        journal.update(state='committed', verifiedHash=digest(path.read_bytes()))
        if failure: journal['transportWarning'] = str(failure)
        write_json(folder / 'transaction.json', journal)
        return {'outcome':outcome, 'backup':str(folder), 'live':True,
                'menuRefreshed':bool(result.get('menuRefreshed')), 'warning':result.get('warning','')}
    recovery_errors = []
    restored = False
    try:
        _live_cloud(steam, account)
        memory = request(game, path.name, operation=6).get('library')
        if memory == desired:
            try:
                request(game, path.name, operation=5, payload={'baseline':desired, 'desired':baseline})
            except Exception as exc:
                # A lost acknowledgement is not proof the game failed to save.
                journal['rollbackTransportWarning'] = str(exc)
        elif memory != baseline:
            raise ValueError('The library changed externally; automatic recovery stopped.')
        restored = _live_verified(steam, path, account, baseline, game)
        if not restored: raise ValueError('The original library could not be verified in the game, local save and Steam.')
    except Exception as exc:
        recovery_errors.append(str(exc))
    failure = failure or ValueError('The game library did not verify in memory and both save locations.')
    journal.update(state='rolled-back' if restored else 'recovery-required', error=str(failure), recoveryErrors=recovery_errors)
    write_json(folder / 'transaction.json', journal)
    if restored:
        raise ValueError(f'Live save failed; the original library was retained/restored through the game. {failure}. Backup: {folder}') from failure
    raise ValueError(f'Live save persistence is uncertain. Refresh Garage before further library changes. The whole profile was not overwritten. Backup and diagnostics: {folder}. ' + '; '.join(recovery_errors)) from failure


def commit(steam, path, group, expected_hash, account, allow_update=False, *, rename=False, edit=False, preset=False, backups=None, running=game_running, game=None):
    path = Path(path)
    if not SAVE_NAME.fullmatch(path.name):
        raise ValueError("Unsupported profile filename.")
    live = running()
    if live:
        from .native_quick import available
        if not game or not available(game): raise ValueError("Close The Karters 2 or enable the supported native bridge before changing its libraries.")
        _live_cloud(steam, account)
    require_recovered(backups or DATA / "backups", path)
    if steam.account != account:
        raise ValueError("Steam account changed since preview. Refresh and preview again.")
    before = path.read_bytes()
    if digest(before) != expected_hash:
        raise ValueError("Profile changed since preview. Refresh and review the group again.")
    if steam.read_save(path.name) != before:
        raise ValueError("Local and Steam saves disagree. Open the game to resolve Steam sync, close it, then refresh.")
    p = Profile(before)
    if preset:
        from .presets import apply
        after, outcome = apply(p, group)
    elif edit: after, outcome = p.edit_group(group['id'], group['name'], group['order'])
    elif rename: after, outcome = p.rename_group(group['id'], group['name'])
    else: after, outcome = p.import_group(group, allow_update=allow_update)
    if after == before: return {"outcome": "unchanged", "backup": None}
    if live: _library_change(before, after)
    folder = (backups or DATA / "backups") / str(time.time_ns())
    folder.mkdir(parents=True)
    (folder / "original.save").write_bytes(before)
    journal = {"profile": str(path), "originalHash": digest(before), "importedHash": digest(after),
        "groupId": group.get("id", group.get("groupId", "presets")), "state": "prepared"}
    if live: journal['mode'] = 'live-library'
    write_json(folder / "transaction.json", journal)
    if live:
        return _commit_live(steam, path, before, after, outcome, account, game, folder, journal)
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
