"""Desktop application state and import previews. Steam work runs outside request handlers."""
import base64
import copy
import json
from pathlib import Path
import threading
import time
import uuid

from . import VERSION
from . import catalog
from .groups import export_native, native_items
from .drafts import parse_items, create_group
from .profile import Profile, SAVE_NAME
from .runtime import DATA, PROFILE_DIR, Worker, discover_games, game_running, write_json
from .transaction import digest
from .dependencies import Dependencies
from .updates import Updates


class Service:
    def __init__(self):
        self.lock = threading.RLock()
        self.updates = Updates()
        self.on_update = None
        try: self.preferences = json.loads((DATA / "preferences.json").read_text(encoding="utf-8"))
        except (OSError, ValueError): self.preferences = {}
        games = discover_games()
        self.game = self.preferences.get("game", games[0] if games else "")
        self.profiles = sorted(p.name for p in PROFILE_DIR.glob("*PTK_PlayerData_v19tpp0_bt0") if SAVE_NAME.fullmatch(p.name))
        selected = self.preferences.get("profile", "")
        self.profile = selected if selected in self.profiles else self.profiles[0] if len(self.profiles) == 1 else ""
        self.groups = catalog.load()
        self.dependencies = Dependencies(DATA / 'dependencies.json')
        self.dependencies.catalog(self.groups)
        self.items = {}
        self.track_status = {}
        self.account = ""
        self.cloud_enabled = False
        self.sync_error = "Connect Steam to verify your profile before importing."
        self.job = None
        self.cancel = threading.Event()
        self.previews = {}
        self.local_groups = []
        self.load_local()

    def load_local(self):
        if not self.profile: self.local_groups = []; return
        try:
            raw = (PROFILE_DIR / self.profile).read_bytes()
            self.local_groups = Profile(raw).custom_groups()
            self.local_hash = digest(raw)
        except (OSError, ValueError, KeyError, TypeError) as exc:
            self.local_groups = []
            self.sync_error = "Could not read this profile: " + str(exc)

    def supported_game(self):
        p = Path(self.game)
        info = p / "build-info.txt"
        if not info.is_file() or "Version: 0.1.4.18\n" not in info.read_text(encoding="utf-8").replace("\r\n", "\n"):
            raise ValueError("This tool currently supports game build 0.1.4.18. Select that installation in Settings.")

    def settings(self, body):
        if self.job and self.job["state"] == "running": raise ValueError("Wait for the current operation before changing settings.")
        profile = body.get("profile", self.profile)
        if profile and profile not in self.profiles: raise ValueError("Choose a detected profile.")
        self.game = str(body.get("game", self.game)).strip()
        self.profile = profile
        write_json(DATA / "preferences.json", {"game": self.game, "profile": profile})
        self.account = ""; self.items = {}; self.previews.clear()
        self.sync_error = "Connect Steam to verify this selection."
        self.load_local()
        return {"message": "Settings saved."}

    def summary(self, group):
        local = next((g for g in self.local_groups if g["GroupDefinition"]["UniqueID"] == group["id"]), None)
        state = "not-imported"
        if local:
            state = "installed" if local["groupItems"] == native_items(group) and local["GroupDefinition"]["Name"] == group["name"] else "update-available"
        return {**group, "importState": state}

    def state(self):
        # The public state deliberately excludes save contents and full Steam account IDs.
        with self.lock:
            mapping = self.dependencies.mapping()
            local = []
            for native in self.local_groups:
                d = native["GroupDefinition"]
                try:
                    local.append({**export_native(native, mapping), "exportReady": True})
                except ValueError as exc:
                    local.append({"id": d["UniqueID"], "name": d["Name"], "tracks": self.native_display(native, mapping), "exportReady": False, "reason": str(exc)})
            if self.profile:
                try:
                    snapshot_hash = self.local_hash
                except OSError:
                    snapshot_hash = ''
                for group in local: group['expectedHash'] = snapshot_hash
            reviewed = [self.summary(g) for g in self.groups]
            for group in local + reviewed:
                group['previewImages'] = [self.dependencies.items.get(t.get('workshopId'), {}).get('previewUrl') for t in group['tracks'][:4]]
            for group in local:
                workshop = [t for t in group['tracks'] if t['kind'] == 'workshop']
                group['missingTracks'] = sum(not self.track_status.get(t.get('workshopId'), {}).get('ready', False) or not self.track_status.get(t.get('workshopId'), {}).get('subscribed', False) for t in workshop) if self.account else None
                group['unresolvedTracks'] = sum(not t.get('workshopId') for t in workshop)
            return {"version": VERSION, "update":self.updates.snapshot(),
                "groups": reviewed, "localGroups": local,
                "settings": {"game": self.game, "profile": self.profile, "profiles": self.profiles,
                    "profileDirectory": str(PROFILE_DIR), "dataDirectory": str(DATA)},
                "steamConnected": bool(self.account), "cloudEnabled": self.cloud_enabled, "trackStatus": copy.deepcopy(self.track_status),
                "syncError": self.sync_error, "job": copy.deepcopy(self.job)}

    def start_job(self, action, body):
        with self.lock:
            if self.job and self.job["state"] == "running": raise ValueError("An operation is already running.")
            if action not in ("refresh", "catalog", "preview", "create", "rename", "edit", "repair", "update", "check-update", "import"): raise ValueError("Unknown operation.")
            self.cancel.clear()
            self.job = {"id": str(uuid.uuid4()), "action": action, "state": "running", "message": "Starting…", "phase": "starting"}
            threading.Thread(target=self.perform, args=(action, body), daemon=False).start()
            return {"message": "Operation started."}

    def progress(self, value):
        with self.lock: self.job.update(value)

    def native_display(self, native, mapping=None):
        mapping = mapping if mapping is not None else self.dependencies.mapping()
        tracks = []
        for item in native['groupItems']:
            mod = item['modHashID']
            if mod:
                info = mapping.get(mod, {})
                tracks.append({'kind':'workshop', 'modId':mod, 'title':info.get('title', mod),
                    **({'workshopId':info['workshopId']} if info.get('workshopId') else {})})
            else: tracks.append({'kind':'official', 'configId':item['configID'], 'title':f"Official track {item['configID']}"})
        return tracks

    def make_preview(self, action, body):
        self.supported_game()
        if game_running(): raise ValueError("Close The Karters 2 before changing groups.")
        if not self.profile or not self.account or self.sync_error: raise ValueError("Connect Steam and resolve the profile status first.")
        local = (PROFILE_DIR / self.profile).read_bytes()
        p = Profile(local)
        if action == 'rename':
            identity, name = body['id'], body['name']
            updated, outcome = p.rename_group(identity, name)
            existing = next(g for g in p.custom_groups() if g['GroupDefinition']['UniqueID'] == identity)
            group = {'id':identity, 'name':name, 'tracks':self.native_display(existing)}
            change = {'id':identity, 'name':name}
            status = self.track_status
            ids = []  # A rename never subscribes or changes track references.
        else:
            group = catalog.decode(json.dumps(body['group']).encode()) if action == 'preview' else None
            ids = parse_items(body['items']) if action == 'create' else list(dict.fromkeys(t['workshopId'] for t in group['tracks'] if t['kind'] == 'workshop'))
            self.progress({'message':'Looking up track names and checking Workshop status…'})
            r = Worker(self.game).request('details', {'ids':ids}, self.progress, self.cancel.is_set)
            if r['account'] != self.account: raise ValueError("Steam account changed. Refresh first.")
            if action == 'create': group = create_group(body['name'], ids, r['items'])
            for track in group['tracks']:
                if track['kind'] == 'workshop':
                    detail = r['items'].get(track['workshopId'], {})
                    if not detail.get('available') or detail.get('modId') != track['modId']:
                        raise ValueError("Unavailable or mismatched Workshop track: " + track.get('title', track['modId']))
                    track['title'] = detail.get('title', track.get('title', track['modId']))
            p.validate_official_tracks(group)
            updated, outcome = p.import_group(group, allow_update=True)
            existing = next((g for g in p.custom_groups() if g['GroupDefinition']['UniqueID'] == group['id']), None)
            change = group
            status = r['status']
            with self.lock:
                self.items.update(r['items'])
                self.dependencies.remember(r['items'])
                self.track_status.update(status)
        destination = next(g['GroupDefinition']['Name'] for g in Profile(updated).custom_groups() if g['GroupDefinition']['UniqueID'] == group['id'])
        key = str(uuid.uuid4())
        mode = 'rename' if action == 'rename' else 'install'
        preview = {'token':key, 'mode':mode, 'outcome':outcome, 'group':group, 'destinationName':destination,
            'previousTracks':self.native_display(existing) if existing else [],
            'previousName':existing['GroupDefinition']['Name'] if existing else None,
            'missingSubscriptions':[item for item in ids if not status[item]['subscribed']],
            'pendingDownloads':[item for item in ids if not status[item]['ready']], 'trackStatus':copy.deepcopy(status)}
        with self.lock:
            self.previews[key] = {'group':change, 'mode':mode, 'hash':digest(local), 'time':time.monotonic(), 'profile':self.profile, 'account':self.account}
        return {'message':'Review the group before saving it to My groups.', 'preview':preview}

    def perform(self, action, body):
        update_folder = None
        try:
            if action == 'check-update':
                self.updates.check()
                result = {'message':self.updates.snapshot()['message']}
            elif action == 'update':
                if self.on_update is None: raise ValueError('Updates require the portable desktop window.')
                self.progress({'phase':'downloading', 'message':'Downloading and verifying the app update…'})
                update_folder = self.updates.prepare(self.cancel.is_set)
                result = {'message':'Verified update downloaded. The app will close and reopen.'}
            elif action == "catalog":
                self.progress({"message": "Refreshing reviewed community groups…"})
                values = catalog.refresh(self.cancel.is_set)
                with self.lock:
                    self.groups = values
                    self.dependencies.catalog(values)
                result = {"message": "Community library refreshed."}
            elif action == "refresh":
                self.supported_game()
                self.progress({"message": "Connecting to Steam and reading public track metadata…"})
                r = Worker(self.game).request("snapshot", {"profile": self.profile, "ids": list(self.dependencies.items)}, self.progress, self.cancel.is_set)
                with self.lock:
                    self.account = r["account"]; self.items = r["items"]; self.cloud_enabled = r["cloudEnabled"]
                    self.dependencies.remember(r['items'])
                    self.track_status = r.get("status", {})
                    self.load_local()
                    self.sync_error = "" if self.profile and base64.b64decode(r["save"]) == (PROFILE_DIR / self.profile).read_bytes() else "Local and Steam saves disagree, or no profile is selected. Resolve the sync before importing."
                    if not self.cloud_enabled: self.sync_error = "Enable Steam Cloud for this game before importing."
                    from .transaction import require_recovered
                    try: require_recovered(DATA / "backups", PROFILE_DIR / self.profile)
                    except ValueError as exc:
                        self.sync_error = str(exc)
                        raise
                missing = sum(not s['ready'] or not s['subscribed'] for s in self.track_status.values())
                result = {"message": f"Steam refreshed. {missing} known Workshop tracks need subscription or download." if missing else "Steam refreshed. Known Workshop tracks are installed."}
            elif action == 'repair':
                result = self.make_preview('preview', {'group':self.export(body['id'])})
                self.previews[result['preview']['token']]['mode'] = 'repair'
                result['preview'].update(mode='repair', outcome='unchanged')
            elif action == 'edit':
                self.supported_game()
                if game_running(): raise ValueError('Close The Karters 2 before editing groups.')
                if not self.account or self.sync_error: raise ValueError('Refresh Steam and resolve the profile status first.')
                local = (PROFILE_DIR / self.profile).read_bytes()
                if digest(local) != body['expectedHash']: raise ValueError('Profile changed while editing. Refresh and edit again.')
                change = {k:body[k] for k in ('id', 'name', 'order')}
                Profile(local).edit_group(change['id'], change['name'], change['order'])
                result = Worker(self.game).request('edit', {'group':change, 'expectedHash':digest(local), 'account':self.account, 'profile':self.profile}, self.progress, self.cancel.is_set)
                with self.lock: self.load_local()
                result['message'] = 'Group ' + result['outcome'] + '. Name and racing order saved.'
                result['groupId'] = change['id']
            elif action in ('preview', 'create', 'rename'):
                result = self.make_preview(action, body)
            else:
                token = body["token"]
                with self.lock: preview = self.previews.pop(token, None)
                if not preview or time.monotonic() - preview["time"] > 600:
                    raise ValueError("Import preview expired. Preview again.")
                self.supported_game()
                result = Worker(self.game).request(preview['mode'], {"group": preview["group"], "expectedHash": preview["hash"],
                    "account": preview["account"], "profile": preview["profile"], "allowUpdate": True}, self.progress, self.cancel.is_set)
                with self.lock: self.load_local()
                for track in preview["group"].get("tracks", []):
                    if track["kind"] == "workshop": self.track_status[track["workshopId"]] = {"subscribed": True, "ready": True}
                result["message"] = "Group " + result["outcome"] + ". You can start the game."
                result['groupId'] = preview['group']['id']
            with self.lock: self.job.update(state="completed", result=result, message=result["message"])
            if update_folder: self.on_update(update_folder)
        except Exception as exc:
            with self.lock: self.job.update(state="failed", message=str(exc))

    def export(self, identity):
        with self.lock:
            mapping = self.dependencies.mapping()
            native = next((g for g in self.local_groups if g["GroupDefinition"]["UniqueID"] == identity), None)
            if native is None: raise ValueError("Custom group not found.")
            return export_native(native, mapping)
