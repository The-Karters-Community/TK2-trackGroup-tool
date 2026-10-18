"""Short-lived Steam worker. Desktop process never loads the game's native DLL."""
import base64
import hashlib
import json
from pathlib import Path
import re
import time

from .runtime import write_json
from .steam import Steam


def installation_status(steam, item, *, track=True):
    status = steam.item_status(item)
    if status['ready'] and track:
        try:
            if not steam.installed(item): status['ready'] = False
        except (OSError, ValueError):
            status['ready'] = False
            status['problem'] = 'Downloaded track files are missing or incomplete.'
    return status


def content_kind(steam, item):
    from .content import installed_kind
    try: return installed_kind(steam.install_directory(item)) if hasattr(steam, 'install_directory') else 'unknown'
    except (OSError, ValueError): return 'unknown'


def run(folder):
    folder = Path(folder)
    steam = None
    try:
        request = json.loads((folder / "request.json").read_text(encoding="utf-8"))
        steam = Steam(request["game"])
        action = request["action"]
        cancelled = lambda: (folder / "cancel").exists()
        progress = lambda value: write_json(folder / "progress.json", value)
        if action in ("snapshot", "library-snapshot"):
            subscriptions = steam.subscribed()
            ids = list(dict.fromkeys(subscriptions + request.get('ids', [])))
            details = steam.details(ids, lambda: (folder / "cancel").exists())
            statuses = {}
            for item in ids:
                kind = content_kind(steam, item)
                if item in request.get('trackIds', []): kind = 'track'
                if item in details: details[item]['kind'] = kind
                statuses[item] = installation_status(steam, item, track=kind=='track')
            result = {"account": steam.account, "items": details,
                "cloudEnabled": bool(steam.storage_call("IsCloudEnabledForAccount") and steam.storage_call("IsCloudEnabledForApp")),
                "status": statuses}
            if action == 'snapshot' and request.get("profile"):
                data = steam.read_save(request["profile"])
                result["save"] = base64.b64encode(data).decode()
                result["saveHash"] = hashlib.sha256(data).hexdigest()
        elif action == "read-save":
            from .profile import SAVE_NAME
            name=request.get('profile')
            if not isinstance(name,str) or not SAVE_NAME.fullmatch(name):raise ValueError('Invalid profile name.')
            if request.get('account') and request['account']!=steam.account:raise ValueError('The Steam account changed.')
            data=steam.read_save(name)
            result={'account':steam.account,'saveHash':hashlib.sha256(data).hexdigest(),
                    'cloudEnabled':bool(steam.storage_call('IsCloudEnabledForAccount') and steam.storage_call('IsCloudEnabledForApp'))}
        elif action == "details":
            details = steam.details(request['ids'], cancelled)
            for item,info in details.items(): info['kind'] = content_kind(steam,item)
            result = {"account": steam.account, "items": details,
                "status": {item: installation_status(steam, item) for item in request["ids"]}}
        elif action == "subscribe-proof":
            # Idempotent diagnostic for an ALREADY subscribed item only.
            if request["id"] not in steam.subscribed():
                raise ValueError("Diagnostic will only re-subscribe an already subscribed item.")
            steam.subscribe(request["id"])
            result = {"subscribed": steam.item_status(request["id"])["subscribed"]}
        elif action == 'subscribe-cosmetic':
            item = request.get('id')
            if not isinstance(item, str) or not re.fullmatch(r'[1-9][0-9]{0,19}', item) or int(item) >= 2**64:
                raise ValueError('Choose a valid Workshop customization item.')
            if steam.account != request.get('account'):
                raise ValueError('The Steam account changed. Refresh before subscribing.')
            if cancelled(): raise ValueError('Subscription cancelled before starting.')
            details = steam.details([item], cancelled)
            info = details.get(item, {})
            if not info.get('available'):
                raise ValueError('This Workshop item is unavailable.')
            if content_kind(steam, item) == 'track':
                raise ValueError('This Workshop item contains a track, not customization content.')
            subscribed = []
            progress({'phase':'subscribing', 'message':'Permanently subscribing to ' + info.get('title', 'Workshop customization'), 'completed':0, 'total':1})
            # Explicit user choice, even if temporarily subscribed by the game.
            # Never unsubscribe automatically on cancellation or failure.
            steam.subscribe(item, cancelled)
            subscribed.append(item)
            status = installation_status(steam, item, track=False)
            if not status['ready'] and not steam.ugc_call('DownloadItem', int(item), True):
                raise ValueError('Steam could not start downloading this customization.')
            deadline = time.monotonic() + 90
            while True:
                if cancelled(): raise ValueError('Subscription cancelled. The Workshop subscription remains.')
                if steam.account != request['account']: raise ValueError('The Steam account changed during download.')
                steam.dll.SteamAPI_RunCallbacks()
                status = installation_status(steam, item, track=False)
                progress({'phase':'downloading', 'message':'Downloading customization content', 'completed':int(bool(status['ready'])),
                          'total':1, 'items':{item:{**status,'title':info.get('title','Workshop customization')}}, 'newSubscriptions':subscribed})
                if status['ready']:
                    if not status.get('subscribed'):
                        raise ValueError('Steam did not confirm the permanent Workshop subscription.')
                    if content_kind(steam, item) != 'cosmetic':
                        raise ValueError('The downloaded item could not be verified as customization content. Its subscription remains.')
                    break
                if time.monotonic() >= deadline:
                    raise ValueError('Customization download is still pending. Let Steam finish; its subscription remains.')
                time.sleep(.25)
            info['kind'] = 'cosmetic'
            result = {'account':steam.account, 'items':{item:info}, 'status':{item:status}, 'subscribed':True, 'newSubscriptions':subscribed}
        elif action == "save-proof":
            data = steam.read_save(request["profile"])
            # Explicit diagnostic: rewrite identical bytes, then verify no content changed.
            steam.write_save(request["profile"], data)
            result = {"unchanged": steam.read_save(request["profile"]) == data}
        elif action in ("rename", "edit", "presets"):
            from .transaction import commit
            from .runtime import PROFILE_DIR, game_running
            from .profile import SAVE_NAME
            if not SAVE_NAME.fullmatch(request['profile']): raise ValueError("Invalid profile selection.")
            if not steam.storage_call("IsCloudEnabledForAccount") or not steam.storage_call("IsCloudEnabledForApp"):
                raise ValueError("Enable Steam Cloud before renaming, so both save copies stay synchronized.")
            if cancelled(): raise ValueError("Rename cancelled before writing the profile.")
            progress({'phase':'saving', 'message':'Verifying and saving your library changes.'})
            result = commit(steam, PROFILE_DIR / request['profile'], request['group'], request['expectedHash'], request['account'], rename=action == 'rename', edit=action == 'edit', preset=action == 'presets', **({'game':request['game']} if game_running() else {}))
        elif action in ("install", "repair"):
            from .groups import validate
            from .transaction import commit, digest, require_recovered, library_state
            from .runtime import PROFILE_DIR, game_running
            from .profile import SAVE_NAME, Profile
            group = validate(request["group"])
            name = request["profile"]
            if not SAVE_NAME.fullmatch(name): raise ValueError("Invalid profile selection.")
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
                if any(content_kind(steam,item)=='cosmetic' for item in ids):
                    raise ValueError('A selected Workshop item contains cosmetics, not a track. No group was saved.')
                for item, status in statuses.items(): status['title'] = details[item].get('title', 'Workshop track ' + item)
                done = sum(s["ready"] for s in statuses.values())
                progress({"phase": "downloading", "message": f"Workshop tracks ready: {done}/{len(ids)}", "completed": done,
                          "total": len(ids), "items": statuses, "newSubscriptions": subscribed})
                if done == len(ids): break
                if time.monotonic() > deadline:
                    raise ValueError("Downloads are still pending. The group was not written. Let Steam finish, then retry; subscriptions remain.")
                time.sleep(.5)
            if cancelled(): raise ValueError("Import cancelled before writing the profile.")
            progress({"phase": "saving", "message": "Verifying and saving the group.", "completed": len(ids), "total": len(ids)})
            if action == 'repair':
                if steam.account != request['account']:
                    raise ValueError('Steam account changed during repair. Refresh Steam. Subscriptions remain.')
                result = {'outcome':'repaired', 'backup':None}
            else:
                expected = request['expectedHash']
                if game_running():
                    current = (PROFILE_DIR / name).read_bytes()
                    if library_state(Profile(current)) != library_state(Profile(local)):
                        raise ValueError('The game library changed during download. Refresh and review the group again. Subscriptions remain.')
                    # A race can advance progress while Steam downloads. Only
                    # rebase when both libraries still match the reviewed save.
                    expected = digest(current)
                result = commit(steam, PROFILE_DIR / name, group, expected, request["account"], request.get("allowUpdate", False), **({'game':request['game']} if game_running() else {}))
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
