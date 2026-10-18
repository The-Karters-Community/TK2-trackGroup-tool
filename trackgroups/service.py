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
        self.profiles = sorted(p.name for p in PROFILE_DIR.glob("*PTK_PlayerData_v*tpp*_bt*") if p.is_file() and SAVE_NAME.fullmatch(p.name))
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
            history = getattr(self, '_library_review_history', {})
            history[self.local_hash] = self._library_fingerprint(profile)
            while len(history) > 8: history.pop(next(iter(history)))
            self._library_review_history = history
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

    @staticmethod
    def _library_fingerprint(profile):
        from .transaction import library_state
        return digest(json.dumps(library_state(profile), sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode())

    def _same_reviewed_library(self, expected_hash, profile):
        return getattr(self, '_library_review_history', {}).get(expected_hash) == self._library_fingerprint(profile)

    def supported_game(self):
        """Validate the installation, independent of patch/version labels."""
        p = Path(self.game)
        if not (p / 'TheKarters2.exe').is_file() or not (p / 'TheKarters2_Data/Plugins/x86_64/steam_api64.dll').is_file():
            raise ValueError('Select the installed The Karters 2 folder containing TheKarters2.exe and its Steam library.')

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
            return {'message':result.get('warning') or 'Quick Setup saved.', 'menuRefreshed':result.get('menuRefreshed',False), 'backup':str(backup)}
        finally:
            with self.lock:self.quick_saving=False

    @staticmethod
    def _lobby_workshop_id(value):
        if isinstance(value,str) and value.isascii() and value.isdigit() and 0<len(value)<=20 and value[0]!='0' and 0<int(value)<2**64:
            return value
        return None

    def _lobby_appearance(self):
        appearance=getattr(self,'appearance',None)
        return copy.deepcopy(appearance.snapshot([])) if appearance else {'items':{}}

    def _lobby_part_sources(self,entry,appearance):
        """Exact local source paths win; native sources are game-resolved package IDs."""
        from types import SimpleNamespace
        from .models import effective_ids
        result={}
        resolved=effective_ids(SimpleNamespace(lock=self.lock,items=appearance.get('items',{})),entry['data'])
        fields={'characters':'iCharacterSkinMaterialID','vehicles':'iVehicleMaterialID','wheels':'iWheelMaterialID'}
        for kind,field in fields.items():
            requested=entry['data'][field+'_Modded']
            modded=entry['data'].get('bUsingModdedVersion') is True
            identity=resolved[kind]
            items=appearance.get('items',{}).get(kind,{})
            item=items.get(str(identity));requested_item=items.get(str(requested)) if modded else item
            fallback=modded and identity!=requested
            view='modded' if modded and not fallback else 'original'
            raw=entry.get('workshop',{}).get(kind,{})
            native=self._lobby_workshop_id(raw.get('id')) if modded and isinstance(raw,dict) else None
            # An explicitly local/official package cannot acquire a Workshop
            # origin from a matching number in a remote record.
            workshop=self._lobby_workshop_id(requested_item.get('workshopId')) if requested_item else native
            result[kind]={'item':item,'workshopId':workshop,'native':raw,'configId':identity,'requestedConfigId':requested,'view':view,'fallback':fallback}
        return result

    def _lobby_workshop_details(self,ids):
        """Bound public metadata queries; roster polls never query Steam every time."""
        ids=sorted({value for value in ids if self._lobby_workshop_id(value)})[:96]
        scope=(self.game,self.account)
        now=time.monotonic()
        with self.lock:
            cache=getattr(self,'_lobby_workshop_cache',None)
            if not cache or cache['scope']!=scope:
                cache={'scope':scope,'entries':{}};self._lobby_workshop_cache=cache
            missing=[value for value in ids if now>=cache['entries'].get(value,{}).get('until',0)]
        if missing and self.account:
            try:
                reply=Worker(self.game).request('details',{'ids':missing},timeout=35)
                if reply.get('account')!=self.account:raise ValueError('The Steam account changed. Refresh Steam.')
                with self.lock:
                    if (self.game,self.account)==scope:
                        for value in missing:
                            cache['entries'][value]={'until':time.monotonic()+120,'info':copy.deepcopy(reply.get('items',{}).get(value,{})), 'status':copy.deepcopy(reply.get('status',{}).get(value,{}))}
                        for value in sorted(cache['entries'],key=lambda value:cache['entries'][value].get('until',0)):
                            if len(cache['entries'])<=512:break
                            if value not in ids:cache['entries'].pop(value,None)
            except Exception:
                # Native room data stays useful if Steam metadata is temporarily
                # unavailable. Actions recheck provenance and account themselves.
                with self.lock:
                    for value in missing:
                        previous=cache['entries'].get(value,{})
                        cache['entries'][value]={**previous,'until':time.monotonic()+30}
        with self.lock:
            return {value:copy.deepcopy(cache['entries'].get(value,{})) for value in ids}

    def _lobby_public_parts(self,entry,appearance,details):
        parts={}
        has_index=bool(appearance.get('items'))
        for kind,source in self._lobby_part_sources(entry,appearance).items():
            item=source['item'];workshop=source['workshopId']
            metadata=details.get(workshop,{})
            info=metadata.get('info',{});status=metadata.get('status',{})
            available=info.get('available') is True and info.get('kind')!='track'
            installed=bool(item) if has_index else True
            native=source['native']
            temporary=isinstance(native,dict) and native.get('temporary') is True
            subscribed=bool(status.get('subscribed')) and not temporary
            if not workshop:
                reason='Included with the game.' if item and item.get('source')=='official' else ('This appearance is installed locally and has no verified Workshop page.' if item else 'The Workshop source for this appearance could not be resolved.')
            elif not available:reason='Workshop details are unavailable. Refresh the lobby or try again shortly.'
            elif subscribed:reason='Permanently subscribed on Steam.'
            elif source['fallback']:reason='The game is showing the original appearance. Subscribe and download this package to use the selected mod.'
            elif not installed:reason='Subscribe and download this Workshop package to use its exact appearance.'
            else:reason='Keep this Workshop item permanently subscribed on Steam.'
            part={'installed':installed,'canCopy':installed and not entry.get('local',False),'subscribed':subscribed,
                  'canSubscribe':bool(workshop and available and self.account and not subscribed),'reason':reason,
                  'label':item.get('label','') if item else info.get('title',''), 'localOnly':bool(item and item.get('localOnly')),
                  'configId':source['configId'],'requestedConfigId':source['requestedConfigId'],'view':source['view'],'fallback':source['fallback'],'checking':bool(appearance.get('loading'))}
            if workshop and available:
                part['workshopId']=workshop
                if isinstance(info.get('previewUrl'),str) and info['previewUrl'].startswith('https://'):
                    part['previewUrl']=info['previewUrl'];part['previewKind']='package'
                if temporary:part['temporary']=True
            parts[kind]=part
        return parts

    def lobby_state(self):
        """Read the current game room only; player identities remain server-side."""
        from .native_quick import available, request
        if not self.profile: return {'status':'unavailable','message':'Choose a game profile in Settings.','players':[]}
        if not game_running(): return {'status':'offline','message':'Open the game and join a race lobby to browse player setups.','players':[]}
        if not available(self.game): return {'status':'unavailable','message':'Lobby browsing is unavailable. Check the game folder in Settings.','players':[]}
        with self.lock:
            if getattr(self,'quick_saving',False): return {'status':'busy','message':'Finishing the current save…','players':[]}
            cached=getattr(self,'_lobby_cache',None)
            if cached and time.monotonic()-cached['time']<2 and cached['profile']==self.profile: return copy.deepcopy(cached['public'])
        game,profile=self.game,self.profile
        result=request(game,profile,operation=2)
        if (self.game,self.profile)!=(game,profile): raise ValueError('The selected profile changed. Refresh the lobby.')
        appearance=self._lobby_appearance()
        sources=[self._lobby_part_sources(entry,appearance) for entry in result.get('players',[])]
        details=self._lobby_workshop_details([part['workshopId'] for source in sources for part in source.values() if part['workshopId']])
        saved=getattr(self,'preset_state',{}).get('presets',[])
        try:
            from .presets import view
            saved=view(Profile((PROFILE_DIR/self.profile).read_bytes()))['presets']
        except (OSError,ValueError,KeyError,TypeError):pass
        players=[];private={}
        for entry in result.get('players',[]):
            old=getattr(self,'_lobby_cache',None) or {}
            key=next((key for key,value in old.get('private',{}).items() if all(value.get(field)==entry.get(field) for field in ('identity','player','local','ai'))),uuid.uuid4().hex) if old.get('profile')==self.profile else uuid.uuid4().hex
            private[key]=entry
            parts=self._lobby_public_parts(entry,appearance,details)
            usable=not entry.get('local',False) and all(part['installed'] for part in parts.values())
            # Allowlist public player fields. Native networking identifiers and
            # future native result fields never leak into the browser response.
            saved_match=next((preset for preset in saved if preset['data']==entry['data']),None)
            can_edit_cpu=entry.get('canEditCpu') is True and entry.get('ai') is True and bool(result.get('inLobby')) and not result.get('inRace') and (not result.get('online') or result.get('host') is True)
            player={k:copy.deepcopy(entry[k]) for k in ('player','id','data','name','local','ai') if k in entry}|{'key':key,'canCopy':usable,'canSave':usable and not saved_match,'alreadySaved':bool(saved_match),'savedPresetId':saved_match['id'] if saved_match else None,'parts':parts,'canEdit':entry.get('canEdit') is True,'canEditCpu':can_edit_cpu}
            local_player=entry.get('localPlayer',entry.get('localPlayerTarget'))
            if entry.get('canEdit') is True and type(local_player)is int and 0<=local_player<6:player['localPlayerTarget']=local_player
            players.append(player)
        in_room=result.get('inLobby') or result.get('inRace')
        public={'status':'ready' if in_room else 'not-in-lobby','online':result.get('online',False),'host':result.get('host') is True,'inRace':bool(result.get('inRace')),'players':players,
                'message':'' if in_room else 'Join a race lobby in the game. Its current players will appear here.'}
        if isinstance(result.get('warning'),str) and result['warning']: public['warning']=result['warning']
        if isinstance(result.get('settings'),dict):
            public['settings']={k:v for k,v in result['settings'].items() if k in ('autoDownloadTracks','autoDownloadPresets','keepAutoDownloaded','automaticDownloads','automaticSubscriptions','keepSubscriptions','allowDownloads','allowSubscriptions') and type(v)is bool}
        with self.lock:self._lobby_cache={'time':time.monotonic(),'profile':self.profile,'private':private,'public':public}
        return copy.deepcopy(public)

    def copy_lobby_preset(self,body):
        """Ask the game to allocate/save one copy; never write its live save file."""
        self.supported_game()
        if not isinstance(body,dict) or set(body)-{'key','mode','player','part'} or not isinstance(body.get('key'),str): raise ValueError('Choose a player from the current lobby.')
        mode=body.get('mode','save');part=body.get('part');player=body.get('player',0)
        if mode not in ('quick','save') or (mode=='save' and ('part'in body or 'player'in body)) or (mode=='quick' and (type(player)is not int or not 0<=player<6 or part not in (None,'characters','vehicles','wheels'))): raise ValueError('Choose Copy preset, Save preset, or one appearance part.')
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
            if mode=='quick':
                fresh=request(self.game,self.profile,operation=2)
                current=next((entry for entry in fresh.get('players',[]) if entry.get('identity')==selected.get('identity') and entry.get('player')==selected.get('player') and entry.get('id')==selected.get('id')),None)
                if not current or cosmetic(current.get('data'),strict=True)!=target:raise ValueError('This racer left or changed their setup. Refresh players before copying.')
                slot=next((entry for entry in view(Profile((PROFILE_DIR/self.profile).read_bytes()))['quickSetups'] if entry['player']==player),None)
                if not slot:raise ValueError('This local player has no initialized Quick Setup. Open Quick Setup for that player in the game first.')
                if part:
                    field={'characters':'iCharacterSkinMaterialID','vehicles':'iVehicleMaterialID','wheels':'iWheelMaterialID'}[part]
                    combined=copy.deepcopy(slot['data'])
                    for key in (field,field+'_Modded'):combined[key]=target[key]
                    target=combined
                change={'mode':'quick','player':player,'presetId':slot['id'],'data':target}
                # Transfer the existing operation guard atomically into the
                # verified live-save path. RLock prevents another request from
                # entering between releasing and reacquiring the save guard.
                with self.lock:
                    self.quick_saving=False
                    result=self.save_live_quick({'profile':self.profile,'change':change,'baseline':{'id':slot['id'],'data':slot['data']}})
                    if getattr(self,'_lobby_cache',None):self._lobby_cache['time']=0
                noun={'characters':'Character','vehicles':'Vehicle','wheels':'Wheels'}.get(part,'Preset')
                notice=result.get('message','')
                if notice=='Quick Setup saved.':notice=''
                return {**result,'mode':'quick','player':player,'message':f'{noun} copied to local slot {player+1} Quick Setup.'+(' '+notice if notice else '')}
            path=PROFILE_DIR/self.profile;before=path.read_bytes();previous=view(Profile(before))
            existing=next((p for p in previous['presets'] if p['data']==target),None)
            if existing:
                self._lobby_mark_saved(target,existing['id'])
                return {'message':'This exact setup is already in All presets.','presetId':existing['id'],'alreadySaved':True,'mode':'save','key':body['key']}
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
            with self.lock:self.load_local();self._lobby_mark_saved(target,identity)
            return {'message':'Setup saved to All presets.','presetId':identity,'backup':str(backup),'alreadySaved':True,'mode':'save','key':body['key']}
        finally:
            with self.lock:self.quick_saving=False

    def _lobby_mark_saved(self,target,identity):
        with self.lock:
            cached=getattr(self,'_lobby_cache',None)
            if cached and cached.get('profile')==self.profile:
                for entry in cached.get('public',{}).get('players',[]):
                    if entry.get('data')==target:entry.update({'alreadySaved':True,'savedPresetId':identity,'canSave':False})

    def edit_lobby_player(self,body):
        """Apply an authorized CPU appearance through the game's own lobby action."""
        from .presets import cosmetic
        from .native_quick import request
        self.supported_game()
        if not isinstance(body,dict) or set(body)!={'key','data','baseline'} or not isinstance(body['key'],str):raise ValueError('Choose an editable CPU from the current lobby.')
        target=cosmetic(body['data'],strict=True);baseline=body['baseline']
        if not isinstance(baseline,dict) or set(baseline)!={'id','data'} or type(baseline['id'])is not int:raise ValueError('Reopen this CPU setup before editing.')
        original=cosmetic(baseline['data'],strict=True)
        if not game_running():raise ValueError('The game is no longer running. Reopen the lobby before editing.')
        with self.lock:
            if getattr(self,'quick_saving',False) or self.job and self.job.get('state')=='running':raise ValueError('Finish the current operation before editing a CPU.')
            if not self.account or not self.profile or self.sync_error:raise ValueError('Refresh Steam and resolve the active game profile before editing.')
            cached=getattr(self,'_lobby_cache',None)
            if not cached or cached['profile']!=self.profile or time.monotonic()-cached['time']>30:raise ValueError('The lobby selection expired. Refresh players and reopen this CPU.')
            selected=copy.deepcopy(cached['private'].get(body['key']))
            public=next((entry for entry in cached.get('public',{}).get('players',[]) if entry['key']==body['key']),None)
            if not selected or not selected.get('ai') or not public or public.get('canEditCpu') is not True:raise ValueError('Only an authorized CPU in your local or hosted lobby can be edited. Other online racers cannot be changed.')
            if selected.get('id')!=baseline['id'] or selected.get('data')!=original:raise ValueError('This CPU setup changed. Reopen it before editing; your draft was not applied.')
            self.quick_saving=True
        try:
            try:
                result=request(self.game,self.profile,selected['id'],selected['player'],original,target,operation=8,identity=selected['identity'])
            except Exception as failure:
                fresh=request(self.game,self.profile,operation=2)
                current=next((entry for entry in fresh.get('players',[]) if entry.get('identity')==selected.get('identity') and entry.get('player')==selected.get('player') and entry.get('data')==target),None)
                if not current:raise failure
                result={'current':current['data'],'saved':True}
            if not result.get('saved') or cosmetic(result.get('current'),strict=True)!=target:raise ValueError('The game did not confirm this CPU appearance. Refresh players to review its actual setup.')
            with self.lock:
                cached=getattr(self,'_lobby_cache',None)
                if cached:
                    cached['time']=0
                    if body['key']in cached.get('private',{}):cached['private'][body['key']]['data']=copy.deepcopy(target)
                    for entry in cached.get('public',{}).get('players',[]):
                        if entry.get('key')==body['key']:entry['data']=copy.deepcopy(target)
            return {'message':'CPU setup updated in the lobby. Your saved presets are unchanged.','key':body['key'],'data':target,'mode':'cpu'}
        finally:
            with self.lock:self.quick_saving=False

    def subscribe_lobby_part(self,body):
        """Keep one verified cosmetic package subscribed after leaving a room."""
        self.supported_game()
        if not isinstance(body,dict) or set(body)!={'key','kind'} or not isinstance(body['key'],str) or body['kind'] not in ('characters','vehicles','wheels'):raise ValueError('Choose a Workshop appearance from a current lobby player.')
        if not game_running():raise ValueError('The game is no longer running. Refresh the lobby before subscribing.')
        with self.lock:
            if getattr(self,'quick_saving',False) or self.job and self.job.get('state')=='running':raise ValueError('Finish the current operation before subscribing.')
            if not self.account or not self.profile or self.sync_error:raise ValueError('Refresh Steam before subscribing to lobby content.')
            cached=getattr(self,'_lobby_cache',None)
            if not cached or cached['profile']!=self.profile or time.monotonic()-cached['time']>30:raise ValueError('The lobby selection expired. Refresh its players.')
            selected=copy.deepcopy(cached['private'].get(body['key']))
            if not selected:raise ValueError('This racer is no longer in the current lobby.')
            self.quick_saving=True
        try:
            from .native_quick import request
            fresh=request(self.game,self.profile,operation=2)
            entry=next((entry for entry in fresh.get('players',[]) if entry.get('identity')==selected.get('identity') and entry.get('player')==selected.get('player') and entry.get('id')==selected.get('id') and entry.get('data')==selected.get('data')),None)
            if not entry:raise ValueError('This racer left or changed their setup. Refresh players before subscribing.')
            source=self._lobby_part_sources(entry,self._lobby_appearance())[body['kind']]
            workshop=source['workshopId']
            if not workshop:raise ValueError('This appearance has no verified Workshop source. Local-only mods cannot be subscribed from the lobby.')
            game,account=self.game,self.account
            worker=Worker(game)
            result=worker.request('subscribe-cosmetic',{'id':workshop,'account':account},timeout=125)
            if result.get('account')!=account or not result.get('subscribed'):raise ValueError('Steam did not confirm this permanent subscription. Refresh Steam before retrying.')
            for attempt in range(2):
                try:
                    retained=request(game,self.profile,operation=7,payload={'workshopId':workshop})
                    if retained.get('retained')is not True:raise ValueError('The game did not confirm retaining this automatic download.')
                except Exception as exc:
                    raise ValueError('Steam subscribed and downloaded this package, but the game has not finished releasing its temporary download ownership. Wait for its current downloads to finish, then choose Subscribe again. Its current subscription was not removed.') from exc
                confirmed=worker.request('details',{'ids':[workshop]},timeout=35)
                if confirmed.get('account')!=account:raise ValueError('The Steam account changed while confirming this subscription. Refresh Steam before retrying.')
                if confirmed.get('status',{}).get(workshop,{}).get('subscribed'):break
                if attempt:raise ValueError('Steam did not confirm the subscription after releasing automatic download ownership. Refresh Steam and try Subscribe again.')
                # A queued game cleanup may have completed between the first
                # SubscribeItem and ownership transfer. Re-subscribe once after
                # transfer, then independently verify ownership and Steam again.
                result=worker.request('subscribe-cosmetic',{'id':workshop,'account':account},timeout=125)
                if result.get('account')!=account or not result.get('subscribed'):raise ValueError('Steam could not confirm this subscription after releasing automatic download ownership.')
            with self.lock:
                if (self.game,self.account)!=(game,account):raise ValueError('The Steam selection changed during subscription. Refresh Steam.')
                if hasattr(self,'appearance'):self.appearance.refresh(self.game)
                if getattr(self,'_lobby_cache',None):self._lobby_cache['time']=0
                if getattr(self,'_lobby_workshop_cache',None):self._lobby_workshop_cache['entries'].pop(workshop,None)
            return {'message':'Workshop customization permanently subscribed and downloaded. Your appearance library is refreshing.','workshopId':workshop,'subscribed':True}
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
            self.previews[key] = {'group':change, 'mode':mode, 'hash':digest(local), 'libraryHash':self._library_fingerprint(p), 'time':time.monotonic(), 'profile':self.profile, 'account':self.account}
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
                if not self.profile or not self.account or self.sync_error: raise ValueError('Refresh Steam and resolve the profile status first.')
                local = (PROFILE_DIR / self.profile).read_bytes()
                if digest(local) != body['expectedHash']:
                    with self.lock: self.load_local()
                    if not self._same_reviewed_library(body['expectedHash'], Profile(local)):
                        verify_edit_base(Profile(local), body['change'], body.get('baseline'))
                apply(Profile(local), body['change'])
                result = Worker(self.game).request('presets', {'group':body['change'], 'expectedHash':digest(local), 'account':self.account, 'profile':self.profile}, self.progress, self.cancel.is_set)
                with self.lock: self.load_local()
                result['message'] = 'Presets saved.'
            elif action == 'edit':
                self.supported_game()
                if not self.account or self.sync_error: raise ValueError('Refresh Steam and resolve the profile status first.')
                local = (PROFILE_DIR / self.profile).read_bytes()
                if digest(local) != body['expectedHash'] and not self._same_reviewed_library(body['expectedHash'], Profile(local)): raise ValueError('The group library changed while editing. Refresh and review it again.')
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
                current = (PROFILE_DIR / self.profile).read_bytes()
                if digest(current) != preview['hash']:
                    if preview.get('libraryHash') != self._library_fingerprint(Profile(current)):
                        raise ValueError('The group library changed since preview. Preview it again.')
                    preview['hash'] = digest(current)
                result = Worker(self.game).request(preview['mode'], {"group": preview["group"], "expectedHash": preview["hash"],
                    "account": preview["account"], "profile": preview["profile"], "allowUpdate": True}, self.progress, self.cancel.is_set)
                with self.lock: self.load_local()
                for track in preview["group"].get("tracks", []):
                    if track["kind"] == "workshop": self.track_status[track["workshopId"]] = {"subscribed": True, "ready": True}
                result["message"] = "Group " + result["outcome"] + "."
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
