"""Desktop application state and import previews. Steam work runs outside request handlers."""
import base64
import copy
import json
from pathlib import Path
import threading
import time
import uuid
import shutil

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
        from .library_preferences import load
        self.library_preferences = load()
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
        self.preset_state = {'presets': [], 'groups': [], 'error': ''}
        self.local_hash = ''
        self.library_loading = False
        self.library_cancel = threading.Event()
        self.library_thread = None
        self._workshop_stamp = None
        self._library_retry_at = 0
        from .appearance import Appearance
        self.appearance = Appearance(DATA/'appearance', PROFILE_DIR)
        self.appearance.refresh(self.game)
        self.load_local()

    def load_local(self, *, external=False):
        if not self.profile:
            self.local_hash = ''
            self.local_groups = []
            self.preset_state = {'presets': [], 'groups': [], 'error': 'Select a game profile in Settings.'}
            return
        try:
            path = PROFILE_DIR / self.profile
            before = path.stat()
            raw = path.read_bytes()
            after = path.stat()
            if (before.st_mtime_ns, before.st_size) != (after.st_mtime_ns, after.st_size):
                return False
            profile = Profile(raw)
            groups = profile.custom_groups()
            from .presets import view
            from .preset_assets import local_packages
            presets = {**view(profile), 'localPackages':local_packages(self.game), 'error': ''}
            self.local_groups, self.preset_state = groups, presets
            self.local_hash = digest(raw)
            self._profile_stamp = (self.profile, after.st_mtime_ns, after.st_size)
            self._pending_profile = None
            if external: self.previews.clear()
            return True
        except (OSError, ValueError, KeyError, TypeError) as exc:
            # A game save may briefly be truncated or replaced. Keep the last
            # valid snapshot and retry; never expose half-written profile data.
            if external: return False
            self.local_groups = []
            self.preset_state = {'presets': [], 'groups': [], 'error': str(exc)}
            self.sync_error = "Could not read this profile: " + str(exc)

    def observe_profile(self):
        """Debounced read-only observation, driven by the existing state poll."""
        if not self.profile or self.job and self.job.get('state') == 'running': return
        try:
            info = (PROFILE_DIR / self.profile).stat()
        except OSError:
            return
        stamp = (self.profile, info.st_mtime_ns, info.st_size)
        if stamp == getattr(self, '_profile_stamp', None): return
        pending = getattr(self, '_pending_profile', None)
        if not pending or pending[0] != stamp:
            self._pending_profile = (stamp, time.monotonic())
        elif time.monotonic() - pending[1] >= .35:
            self.load_local(external=True)

    def supported_game(self):
        p = Path(self.game)
        info = p / "build-info.txt"
        if not info.is_file() or "Version: 0.1.4.18\n" not in info.read_text(encoding="utf-8").replace("\r\n", "\n"):
            raise ValueError("This tool currently supports game build 0.1.4.18. Select that installation in Settings.")

    def settings(self, body):
        if getattr(self,"quick_saving",False) or self.job and self.job["state"] == "running": raise ValueError("Wait for the current operation before changing settings.")
        profile = body.get("profile", self.profile)
        if profile and profile not in self.profiles: raise ValueError("Choose a detected profile.")
        self.game = str(body.get("game", self.game)).strip()
        self.profile = profile
        write_json(DATA / "preferences.json", {"game": self.game, "profile": profile})
        self.account = ""; self.items = {}; self.previews.clear()
        self.sync_error = "Connect Steam to verify this selection."
        self.load_local()
        self.appearance.refresh(self.game)
        return {"message": "Settings saved."}

    def summary(self, group):
        local = next((g for g in self.local_groups if g["GroupDefinition"]["UniqueID"] == group["id"]), None)
        state = "not-imported"
        if local:
            state = "installed" if local["groupItems"] == native_items(group) and local["GroupDefinition"]["Name"] == group["name"] else "update-available"
        return {**group, "importState": state}

    def state(self):
        self.appearance.observe(self.game)
        self.observe_workshop()
        # The public state deliberately excludes save contents and full Steam account IDs.
        with self.lock:
            self.observe_profile()
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
                group['previewImages'] = [self.dependencies.items.get(t.get('workshopId'), {}).get('previewUrl') for t in group['tracks']]
            for group in local:
                workshop = [t for t in group['tracks'] if t['kind'] == 'workshop']
                group['missingTracks'] = sum(not self.track_status.get(t.get('workshopId'), {}).get('ready', False) or not self.track_status.get(t.get('workshopId'), {}).get('subscribed', False) for t in workshop) if self.account else None
                group['unresolvedTracks'] = sum(not t.get('workshopId') for t in workshop)
            from .track_library import library, summary
            from .native_quick import available
            return {"nativeQuickSaveAvailable":available(self.game), "quickSaving":getattr(self,"quick_saving",False), "version": VERSION, "libraryPreferences":getattr(self,'library_preferences',{'favorites':[],'activity':{}}), "update":self.updates.snapshot(),
                "tracks":library(self.items, self.track_status), "trackSummary":summary(self.items, self.track_status, local), "libraryLoading":self.library_loading,
                "groups": reviewed, "localGroups": local,
                "presetState": copy.deepcopy({**self.preset_state, 'profileHash':getattr(self, 'local_hash', ''), 'appearance':self.appearance.snapshot(self.preset_state.get('presets',[]) + self.preset_state.get('quickSetups', []))}), "profileHash": getattr(self, 'local_hash', ''),
                "settings": {"game": self.game, "profile": self.profile, "profiles": self.profiles,
                    "profileDirectory": str(PROFILE_DIR), "dataDirectory": str(DATA)},
                "steamConnected": bool(self.account), "cloudEnabled": self.cloud_enabled, "trackStatus": copy.deepcopy(self.track_status),
                "gameRunning": game_running(), "syncError": self.sync_error, "job": copy.deepcopy(self.job)}

    def observe_workshop(self):
        if time.monotonic() < self._library_retry_at: return
        try:
            info = (Path(self.game).parent.parent/'workshop/appworkshop_2269950.acf').stat()
            stamp = (info.st_mtime_ns, info.st_size)
        except OSError: return
        if self._workshop_stamp is None:
            self._workshop_stamp = stamp; return
        if stamp == self._workshop_stamp or self.library_loading or not self.account or self.job and self.job.get('state') == 'running': return
        previous = self._workshop_stamp
        self._workshop_stamp = stamp
        self.library_loading = True
        game, account = self.game, self.account
        def refresh():
            try:
                result = Worker(game).request('library-snapshot', {'ids':list(self.dependencies.items)}, lambda value:None, self.library_cancel.is_set)
                with self.lock:
                    if result['account'] != account or self.game != game or self.account != account: return
                    self.items, self.track_status = result['items'], result['status']
                    self.dependencies.remember(result['items'])
                self.appearance.refresh(self.game)
            except (OSError, ValueError):
                self._workshop_stamp = previous
                self._library_retry_at = time.monotonic() + 10
            finally: self.library_loading = False
        self.library_thread = threading.Thread(target=refresh, daemon=True)
        self.library_thread.start()

    def start_job(self, action, body):
        with self.lock:
            if getattr(self,"quick_saving",False) or self.job and self.job["state"] == "running": raise ValueError("An operation is already running.")
            if action not in ("refresh", "catalog", "preview", "create", "rename", "edit", "repair", "update", "check-update", "import", "presets"): raise ValueError("Unknown operation.")
            self.cancel.clear()
            self.job = {"id": str(uuid.uuid4()), "action": action, "state": "running", "message": "Starting…", "phase": "starting"}
            threading.Thread(target=self.perform, args=(action, body), daemon=False).start()
            return {"message": "Operation started."}

    def save_live_quick(self, body):
        """Edit one live Quick Setup, letting the game own serialization and Cloud."""
        self.supported_game()
        if not game_running(): raise ValueError('The game is not running. Use the regular save flow.')
        if not isinstance(body,dict): raise ValueError('Invalid Quick Setup request.')
        with self.lock:
            if getattr(self,'quick_saving',False) or self.job and self.job.get('state')=='running': raise ValueError('A save or Steam operation is already running.')
            if not self.profile or not self.account or not self.cloud_enabled or self.sync_error: raise ValueError('Refresh Steam and resolve the active profile and Cloud status before saving.')
            self.quick_saving=True
        try:
            from .native_quick import request
            from .presets import verify_edit_base,cosmetic,view
            from .profile import SAVE_NAME
            change=body.get('change');baseline=body.get('baseline')
            if body.get('profile')!=self.profile or not SAVE_NAME.fullmatch(self.profile): raise ValueError('The selected profile changed. Reopen Quick Setup.')
            if not isinstance(change,dict) or change.get('mode')!='quick' or type(change.get('player'))is not int or not 0<=change['player']<6 or type(change.get('presetId'))is not int: raise ValueError('Choose one existing local-player Quick Setup.')
            target=cosmetic(change.get('data'),strict=True)
            path=PROFILE_DIR/self.profile;before=path.read_bytes();profile=Profile(before)
            verify_edit_base(profile,change,baseline)
            worker=Worker(self.game)
            def cloud_matches(raw):
                remote=worker.request('read-save',{'profile':self.profile,'account':self.account},timeout=20)
                return remote.get('account')==self.account and remote.get('cloudEnabled') and remote.get('saveHash')==digest(raw)
            if not cloud_matches(before) or path.read_bytes()!=before: raise ValueError('Local and Steam saves changed or disagree. Refresh Steam before saving; nothing was changed.')
            folder=DATA/'backups/live-quick';folder.mkdir(parents=True,exist_ok=True)
            backup=folder/f"{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:8]}-{self.profile}.bak"
            backup.write_bytes(before)
            def current():
                raw=path.read_bytes();slot=next((p for p in view(Profile(raw))['quickSetups'] if p['player']==change['player'] and p['id']==change['presetId']),None)
                return raw,slot
            error=None
            try: result=request(self.game,self.profile,change['presetId'],change['player'],baseline['data'],target)
            except Exception as exc: error=exc;result={}
            deadline=time.monotonic()+5;verified=False
            while time.monotonic()<deadline:
                try:
                    raw,slot=current()
                    if slot and slot['data']==target:
                        if cloud_matches(raw) and path.read_bytes()==raw: verified=True;break
                    elif error: raise error
                except (OSError,ValueError) as exc:
                    if error: raise ValueError(f'{error} Safety copy: {backup}') from exc
                time.sleep(.15)
            if not verified:
                # Restore only this target through the game. Never replace the whole
                # running profile with a stale backup that could discard progress.
                restored=False
                try:
                    request(self.game,self.profile,change['presetId'],change['player'],target,baseline['data'])
                    raw,slot=current();restored=bool(slot and slot['data']==baseline['data'] and cloud_matches(raw))
                except Exception: pass
                outcome='Original Quick Setup restored.' if restored else 'Save persistence is uncertain. Reopen Quick Setup and retain this safety copy.'
                raise ValueError(f'{outcome} Safety copy: {backup}')
            with self.lock:self.load_local()
            return {'message':'Quick Setup saved by the running game. Local and Steam copies verified.'+(' '+result['warning'] if result.get('warning') else ''), 'menuRefreshed':result.get('menuRefreshed',False), 'backup':str(backup)}
        finally:
            with self.lock:self.quick_saving=False

    def lobby_state(self):
        """Read the current game room only; player identities remain server-side."""
        from .native_quick import available, request
        if not self.profile: return {'status':'unavailable','message':'Choose a game profile in Settings.','players':[]}
        if not game_running(): return {'status':'offline','message':'Open the game and join a race lobby to browse player setups.','players':[]}
        if not available(self.game): return {'status':'unavailable','message':'Lobby browsing needs the supported game build 0.1.4.18 and native bridge.','players':[]}
        with self.lock:
            if getattr(self,'quick_saving',False): return {'status':'busy','message':'Finishing the current save…','players':[]}
            cached=getattr(self,'_lobby_cache',None)
            if cached and time.monotonic()-cached['time']<2 and cached['profile']==self.profile: return copy.deepcopy(cached['public'])
        game,profile=self.game,self.profile
        result=request(game,profile,operation=2)
        if (self.game,self.profile)!=(game,profile): raise ValueError('The selected profile changed. Refresh the lobby.')
        players=[];private={}
        for entry in result.get('players',[]):
            old=getattr(self,'_lobby_cache',None) or {}
            key=next((key for key,value in old.get('private',{}).items() if value==entry),uuid.uuid4().hex) if old.get('profile')==self.profile else uuid.uuid4().hex
            private[key]=entry
            players.append({k:v for k,v in entry.items() if k!='identity'}|{'key':key,'canCopy':not entry['local']})
        public={'status':'ready' if result.get('inLobby') else 'not-in-lobby','online':result.get('online',False),'players':players,
                'message':'' if result.get('inLobby') else 'Join a race lobby in the game. Its current players will appear here.'}
        with self.lock:self._lobby_cache={'time':time.monotonic(),'profile':self.profile,'private':private,'public':public}
        return copy.deepcopy(public)

    def copy_lobby_preset(self,body):
        """Ask the game to allocate/save one copy; never write its live save file."""
        self.supported_game()
        if not isinstance(body,dict) or set(body)!={'key'} or not isinstance(body['key'],str): raise ValueError('Choose a player from the current lobby.')
        if not game_running(): raise ValueError('The game is no longer running. Join a lobby before copying.')
        with self.lock:
            if getattr(self,'quick_saving',False) or self.job and self.job.get('state')=='running': raise ValueError('Finish the current operation before copying.')
            if not self.account or not self.profile or not self.cloud_enabled or self.sync_error: raise ValueError('Refresh Steam before copying a lobby preset.')
            cached=getattr(self,'_lobby_cache',None)
            if not cached or cached['profile']!=self.profile or time.monotonic()-cached['time']>30: raise ValueError('The lobby selection expired. Refresh its players.')
            selected=cached['private'].get(body['key'])
            if not selected or selected['local']: raise ValueError('Choose another player’s setup.')
            self.quick_saving=True
        try:
            from .native_quick import request
            from .presets import cosmetic,view
            target=cosmetic(selected['data'],strict=True)
            path=PROFILE_DIR/self.profile;before=path.read_bytes();previous=view(Profile(before))
            existing=next((p for p in previous['presets'] if p['data']==target),None)
            if existing:return {'message':'This exact setup is already in All presets.','presetId':existing['id'],'alreadySaved':True}
            worker=Worker(self.game)
            def synced(raw):
                remote=worker.request('read-save',{'profile':self.profile,'account':self.account},timeout=20)
                return remote.get('account')==self.account and remote.get('cloudEnabled') and remote.get('saveHash')==digest(raw)
            if not synced(before) or path.read_bytes()!=before: raise ValueError('Local and Steam saves changed or disagree. Refresh Steam; nothing was copied.')
            folder=DATA/'backups/lobby';folder.mkdir(parents=True,exist_ok=True)
            backup=folder/f"{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:8]}-{self.profile}.bak";backup.write_bytes(before)
            failure=None
            try: result=request(self.game,self.profile,selected['id'],selected['player'],target,None,operation=3,identity=selected['identity'])
            except Exception as exc: failure=exc;result={}
            identity=result.get('presetId');verified=False;deadline=time.monotonic()+5
            while time.monotonic()<deadline:
                try:
                    raw=path.read_bytes();state=view(Profile(raw))
                    if failure and identity is None:
                        recovered=next((p for p in state['presets'] if p['data']==target and p['id'] not in {p['id'] for p in previous['presets']}),None)
                        if recovered:identity=recovered['id']
                    created=next((p for p in state['presets'] if p['id']==identity),None)
                    if created and created['data']==target and all(p in state['presets'] for p in previous['presets']) and state['groups']==previous['groups'] and synced(raw) and path.read_bytes()==raw:
                        verified=True;break
                except (OSError,ValueError,KeyError,TypeError): pass
                time.sleep(.15)
            if not verified:
                # Only delete the newly allocated exact copy, never overwrite a
                # whole running profile or remove any preset/group that preceded it.
                restored=False
                try:
                    current=view(Profile(path.read_bytes()))
                    if identity not in {p['id'] for p in previous['presets']} and current['groups']==previous['groups'] and any(p['id']==identity and p['data']==target for p in current['presets']):
                        request(self.game,self.profile,identity,0,target,None,operation=4)
                        raw=path.read_bytes();restored=view(Profile(raw))['presets']==previous['presets'] and synced(raw)
                except Exception: pass
                outcome='The unverified copy was removed.' if restored else 'Refresh All presets before retrying.'
                raise ValueError(f'The copy could not be verified. {str(failure)+" " if failure else ""}{outcome} Safety copy: {backup}')
            with self.lock:self.load_local();self._lobby_cache=None
            return {'message':'Player setup copied to All presets. Local and Steam copies verified.','presetId':identity,'backup':str(backup)}
        finally:
            with self.lock:self.quick_saving=False

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
            selected = body.get('tracks') if action == 'create' else None
            if selected is not None:
                from .groups import validate
                group = validate({'format':'tk2-track-group', 'version':1, 'revision':1, 'id':str(uuid.uuid4()), 'name':body['name'], 'tracks':selected})
            ids = (parse_items(body['items']) if action == 'create' and selected is None else list(dict.fromkeys(t['workshopId'] for t in group['tracks'] if t['kind'] == 'workshop')))
            self.progress({'message':'Looking up track names and checking Workshop status…'})
            r = Worker(self.game).request('details', {'ids':ids}, self.progress, self.cancel.is_set)
            if r['account'] != self.account: raise ValueError("Steam account changed. Refresh first.")
            if action == 'create' and selected is None: group = create_group(body['name'], ids, r['items'])
            for track in group['tracks']:
                if track['kind'] == 'workshop':
                    detail = r['items'].get(track['workshopId'], {})
                    if not detail.get('available') or detail.get('modId') != track['modId'] or detail.get('kind') == 'cosmetic':
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
        preview = {'token':key, 'mode':mode, 'outcome':outcome, 'group':{**group, 'previewImages':[self.dependencies.items.get(t.get('workshopId'), {}).get('previewUrl') for t in group['tracks']]}, 'destinationName':destination,
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
                self.appearance.refresh(self.game)
                self.progress({"message": "Connecting to Steam and reading public track metadata…"})
                self.dependencies.remember(Dependencies(DATA / "dependencies.json").items, save=False)
                self.dependencies.catalog(catalog.load())
                track_ids = {t['workshopId'] for g in self.groups for t in g['tracks'] if t['kind']=='workshop'}
                r = Worker(self.game).request("snapshot", {"profile": self.profile, "ids": list(self.dependencies.items), 'trackIds':list(track_ids)}, self.progress, self.cancel.is_set)
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
                from .track_library import summary
                local_groups = [{'tracks':self.native_display(g)} for g in self.local_groups]
                result = summary(self.items, self.track_status, local_groups)
            elif action == 'repair':
                result = self.make_preview('preview', {'group':self.export(body['id'])})
                self.previews[result['preview']['token']]['mode'] = 'repair'
                result['preview'].update(mode='repair', outcome='unchanged')
            elif action == 'presets':
                from .presets import apply, verify_edit_base
                self.supported_game()
                if game_running(): raise ValueError('Close The Karters 2 before editing presets.')
                if not self.profile or not self.account or self.sync_error: raise ValueError('Refresh Steam and resolve the profile status first.')
                local = (PROFILE_DIR / self.profile).read_bytes()
                if digest(local) != body['expectedHash']:
                    with self.lock: self.load_local()
                    verify_edit_base(Profile(local), body['change'], body.get('baseline'))
                apply(Profile(local), body['change'])
                result = Worker(self.game).request('presets', {'group':body['change'], 'expectedHash':digest(local), 'account':self.account, 'profile':self.profile}, self.progress, self.cancel.is_set)
                with self.lock: self.load_local()
                result['message'] = 'Presets saved to the local and Steam copies. You can start the game.'
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

    def export_presets(self, body):
        from .presets import export
        if not self.profile: raise ValueError('Select a profile first.')
        return export(Profile((PROFILE_DIR / self.profile).read_bytes()), body.get('ids', []), body.get('groups', []))

    def export_groups(self, identities):
        from .groups import validate
        if not isinstance(identities, list) or not 1 <= len(identities) <= 256 or any(not isinstance(i,str) for i in identities) or len(set(identities)) != len(identities):
            raise ValueError('Select 1-256 distinct track groups.')
        with self.lock:
            reviewed = {g['id']:g for g in self.groups}
            result = []
            for identity in identities:
                if identity in reviewed:
                    group = {k:v for k,v in reviewed[identity].items() if k in ('format','version','id','revision','name','description','tracks')}
                    result.append(validate(group))
                else: result.append(self.export(identity))
            return {'format':'tk2-track-groups', 'version':1, 'groups':result}
