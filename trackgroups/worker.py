"""Short-lived Steam worker. Desktop process never loads the game's native DLL."""
import base64
import hashlib
import json
from pathlib import Path
import time

from .runtime import write_json
from .steam import Steam


def installation_status(steam, item):
    status = steam.item_status(item)
    if status['ready']:
        try:
            if not steam.installed(item): status['ready'] = False
        except (OSError, ValueError):
            status['ready'] = False
            status['problem'] = 'Downloaded track files are missing or incomplete.'
    return status


def run(folder):
    folder = Path(folder)
    steam = None
    try:
        request = json.loads((folder / "request.json").read_text(encoding="utf-8"))
        steam = Steam(request["game"])
        action = request["action"]
        cancelled = lambda: (folder / "cancel").exists()
        progress = lambda value: write_json(folder / "progress.json", value)
        if action == "snapshot":
            ids = list(dict.fromkeys(steam.subscribed() + request.get('ids', [])))
            details = steam.details(ids, lambda: (folder / "cancel").exists())
            result = {"account": steam.account, "items": details,
                "cloudEnabled": bool(steam.storage_call("IsCloudEnabledForAccount") and steam.storage_call("IsCloudEnabledForApp")),
                "status": {item: installation_status(steam, item) for item in ids}}
            if request.get("profile"):
                data = steam.read_save(request["profile"])
                result["save"] = base64.b64encode(data).decode()
                result["saveHash"] = hashlib.sha256(data).hexdigest()
        elif action == "details":
            result = {"account": steam.account, "items": steam.details(request["ids"], cancelled),
                "status": {item: installation_status(steam, item) for item in request["ids"]}}
        elif action == "subscribe-proof":
            # Idempotent diagnostic for an ALREADY subscribed item only.
            if request["id"] not in steam.subscribed():
                raise ValueError("Diagnostic will only re-subscribe an already subscribed item.")
            steam.subscribe(request["id"])
            result = {"subscribed": steam.item_status(request["id"])["subscribed"]}
        elif action == "save-proof":
            data = steam.read_save(request["profile"])
            # Explicit diagnostic: rewrite identical bytes, then verify no content changed.
            steam.write_save(request["profile"], data)
            result = {"unchanged": steam.read_save(request["profile"]) == data}
        elif action in ("rename", "edit"):
            from .transaction import commit
            from .runtime import PROFILE_DIR
            from .profile import SAVE_NAME
            if not SAVE_NAME.fullmatch(request['profile']): raise ValueError("Invalid profile selection.")
            if not steam.storage_call("IsCloudEnabledForAccount") or not steam.storage_call("IsCloudEnabledForApp"):
                raise ValueError("Enable Steam Cloud before renaming, so both save copies stay synchronized.")
            if cancelled(): raise ValueError("Rename cancelled before writing the profile.")
            progress({'phase':'saving', 'message':'Saving the new group name. Keep the game closed.'})
            result = commit(steam, PROFILE_DIR / request['profile'], request['group'], request['expectedHash'], request['account'], rename=action == 'rename', edit=action == 'edit')
        elif action in ("install", "repair"):
            from .groups import validate
            from .transaction import commit, digest, require_recovered
            from .runtime import PROFILE_DIR, game_running
            from .profile import SAVE_NAME, Profile
            group = validate(request["group"])
            name = request["profile"]
            if not SAVE_NAME.fullmatch(name): raise ValueError("Invalid profile selection.")
            if game_running(): raise ValueError("Close the game before importing.")
            from .runtime import DATA
            require_recovered(DATA / "backups", PROFILE_DIR / name)
            if steam.account != request["account"]: raise ValueError("Steam account changed. Preview again.")
            local = (PROFILE_DIR / name).read_bytes()
            Profile(local).validate_official_tracks(group)
            if digest(local) != request["expectedHash"] or steam.read_save(name) != local:
                raise ValueError("Profile changed or Steam save differs. Refresh before importing.")
            if not steam.storage_call("IsCloudEnabledForAccount") or not steam.storage_call("IsCloudEnabledForApp"):
                raise ValueError("Enable Steam Cloud for the game before importing, so both save copies stay synchronized.")
            ids = list(dict.fromkeys(t["workshopId"] for t in group["tracks"] if t["kind"] == "workshop"))
            progress({"phase": "checking", "message": "Checking Workshop dependencies", "completed": 0, "total": len(ids)})
            details = steam.details(ids, cancelled)
            for track in group["tracks"]:
                if track["kind"] == "workshop":
                    info = details.get(track["workshopId"], {})
                    if not info.get("available") or info.get("modId") != track["modId"]:
                        raise ValueError("Workshop item is unavailable or no longer identifies the expected track: " + track.get("title", track["modId"]))
            subscribed = []
            for item in ids:
                if cancelled(): raise ValueError("Import cancelled. Completed subscriptions remain subscribed.")
                if not steam.item_status(item)["subscribed"]:
                    progress({"phase": "subscribing", "message": "Subscribing to " + details[item].get('title', item), "completed": len(subscribed), "total": len(ids)})
                    steam.subscribe(item, cancelled)
                    subscribed.append(item)
                if not installation_status(steam, item)["ready"]:
                    if not steam.ugc_call("DownloadItem", int(item), True):
                        raise ValueError("Steam could not start download for " + item)
            deadline = time.monotonic() + 600
            while True:
                if cancelled(): raise ValueError("Import cancelled. Completed subscriptions remain subscribed.")
                steam.dll.SteamAPI_RunCallbacks()
                statuses = {item: installation_status(steam, item) for item in ids}
                for item, status in statuses.items(): status['title'] = details[item].get('title', 'Workshop track ' + item)
                done = sum(s["ready"] for s in statuses.values())
                progress({"phase": "downloading", "message": f"Workshop tracks ready: {done}/{len(ids)}", "completed": done,
                          "total": len(ids), "items": statuses, "newSubscriptions": subscribed})
                if done == len(ids): break
                if time.monotonic() > deadline:
                    raise ValueError("Downloads are still pending. The group was not written. Let Steam finish, then retry; subscriptions remain.")
                time.sleep(.5)
            if cancelled(): raise ValueError("Import cancelled before writing the profile.")
            progress({"phase": "saving", "message": "Verifying and saving the group. Please keep the game closed.", "completed": len(ids), "total": len(ids)})
            if action == 'repair':
                if game_running() or (PROFILE_DIR / name).read_bytes() != local or steam.read_save(name) != local:
                    raise ValueError('Profile changed during repair. Refresh Steam. Subscriptions remain.')
                result = {'outcome':'repaired', 'backup':None}
            else:
                result = commit(steam, PROFILE_DIR / name, group, request["expectedHash"], request["account"], request.get("allowUpdate", False))
            result["newSubscriptions"] = subscribed
        else:
            raise ValueError("Unknown Steam worker action.")
        write_json(folder / "result.json", result)
    except Exception as exc:
        completed = locals().get("subscribed", [])
        message = str(exc)
        if completed: message += ". Completed subscriptions remain: " + ", ".join(completed)
        write_json(folder / "result.json", {"error": message, "newSubscriptions": completed})
    finally:
        if steam is not None: steam.close()
