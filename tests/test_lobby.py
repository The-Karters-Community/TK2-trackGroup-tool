import copy
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from trackgroups.profile import Profile
from trackgroups.presets import view, serialize, apply
from trackgroups.service import Service
from trackgroups.transaction import digest
from test_presets import fixture


class LobbyTests(unittest.TestCase):
    def quick_fixture(self):
        profile=Profile(fixture())
        native=json.loads(profile.records[0])[0]
        data=copy.deepcopy(profile.data)
        data['QuickCreationPresets']=[{'BQuickPresetInitialized':True,'QuickPreset':{**copy.deepcopy(native),'iPresetID':200+player}} for player in range(6)]
        return serialize(profile,json.loads(profile.records[0]),data)

    def service(self):
        s = Service.__new__(Service)
        s.lock = threading.RLock()
        s.profile = "1009PTK_PlayerData_v19tpp0_bt0"
        s.game = "game"
        s.account = "account"
        s.cloud_enabled = True
        s.sync_error = ""
        s.job = None
        s.supported_game = lambda: None
        s.load_local = lambda: None
        return s

    def entry(self):
        data = copy.deepcopy(view(Profile(fixture()))["presets"][0]["data"])
        data["iWheelMaterialID_Modded"] = 987
        return {
            "player": 4,
            "id": 999,
            "data": data,
            "name": "Racer",
            "identity": "private-network-identity",
            "local": False,
            "ai": False,
        }

    def test_main_menu_and_offline_do_not_invent_players(self):
        s = self.service()
        with patch("trackgroups.service.game_running", return_value=False), patch(
            "trackgroups.native_quick.request"
        ) as native:
            self.assertEqual(s.lobby_state()["players"], [])
            native.assert_not_called()
        with patch("trackgroups.service.game_running", return_value=True), patch(
            "trackgroups.native_quick.available", return_value=True
        ), patch(
            "trackgroups.native_quick.request",
            return_value={"inLobby": False, "players": []},
        ):
            self.assertEqual(s.lobby_state()["status"], "not-in-lobby")

    def test_native_identity_stays_private_and_keys_survive_unchanged_refresh(self):
        s = self.service()
        entry = self.entry()
        with patch("trackgroups.service.game_running", return_value=True), patch(
            "trackgroups.native_quick.available", return_value=True
        ), patch(
            "trackgroups.native_quick.request",
            return_value={"inLobby": True, "players": [entry]},
        ):
            first = s.lobby_state()
            self.assertNotIn(entry["identity"], json.dumps(first))
            self.assertNotIn("identity", first["players"][0])
            s._lobby_cache["time"] -= 3
            self.assertEqual(
                s.lobby_state()["players"][0]["key"], first["players"][0]["key"]
            )

    def test_expired_or_local_selection_cannot_write(self):
        s = self.service()
        s._lobby_cache = {
            "time": time.monotonic() - 31,
            "profile": s.profile,
            "private": {"key": self.entry()},
        }
        with patch("trackgroups.service.game_running", return_value=True), patch(
            "trackgroups.native_quick.request"
        ) as native:
            with self.assertRaisesRegex(ValueError, "expired"):
                s.copy_lobby_preset({"key": "key"})
            s._lobby_cache["time"] = time.monotonic()
            s._lobby_cache["private"]["key"]["local"] = True
            with self.assertRaises(ValueError):
                s.copy_lobby_preset({"key": "key"})
            native.assert_not_called()

    def test_copy_uses_game_allocation_and_verifies_local_and_steam_preserving_library(
        self,
    ):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            s = self.service()
            entry = self.entry()
            path = root / s.profile
            original = fixture()
            path.write_bytes(original)
            previous = view(Profile(original))
            s._lobby_cache = {
                "time": time.monotonic(),
                "profile": s.profile,
                "private": {"key": entry},
            }

            def remote(action, body, **kwargs):
                return {
                    "account": s.account,
                    "cloudEnabled": True,
                    "saveHash": digest(path.read_bytes()),
                }

            def native(game, profile, preset_id, player, baseline, desired, **kwargs):
                self.assertEqual(
                    kwargs, {"operation": 3, "identity": entry["identity"]}
                )
                self.assertEqual(baseline, entry["data"])
                self.assertIsNone(desired)
                current = Profile(path.read_bytes())
                presets = json.loads(current.records[0])
                presets.append({"iPresetID": 12345, **baseline})
                path.write_bytes(serialize(current, presets, current.data))
                return {"saved": True, "presetId": 12345}

            with patch("trackgroups.service.PROFILE_DIR", root), patch(
                "trackgroups.service.DATA", root / "data"
            ), patch("trackgroups.service.game_running", return_value=True), patch(
                "trackgroups.service.Worker"
            ) as worker, patch(
                "trackgroups.native_quick.request", side_effect=native
            ):
                worker.return_value.request.side_effect = remote
                result = s.copy_lobby_preset({"key": "key"})
            self.assertFalse(s.quick_saving)
            self.assertEqual(result["presetId"], 12345)
            self.assertEqual(Path(result["backup"]).read_bytes(), original)
            now = view(Profile(path.read_bytes()))
            self.assertEqual(now["presets"][:-1], previous["presets"])
            self.assertEqual(now["groups"], previous["groups"])
            self.assertEqual(now["presets"][-1]["data"], entry["data"])

    def test_cloud_conflict_blocks_native_copy(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            s = self.service()
            path = root / s.profile
            path.write_bytes(fixture())
            s._lobby_cache = {
                "time": time.monotonic(),
                "profile": s.profile,
                "private": {"key": self.entry()},
            }
            with patch("trackgroups.service.PROFILE_DIR", root), patch(
                "trackgroups.service.DATA", root / "data"
            ), patch("trackgroups.service.game_running", return_value=True), patch(
                "trackgroups.service.Worker"
            ) as worker, patch(
                "trackgroups.native_quick.request"
            ) as native:
                worker.return_value.request.return_value = {
                    "account": s.account,
                    "cloudEnabled": True,
                    "saveHash": "wrong",
                }
                with self.assertRaisesRegex(ValueError, "disagree"):
                    s.copy_lobby_preset({"key": "key"})
                native.assert_not_called()
                self.assertEqual(path.read_bytes(), fixture())
                self.assertFalse(s.quick_saving)

    def test_copy_quick_full_and_each_part_uses_verified_live_save_without_library_creation(self):
        for part in (None,'characters','vehicles','wheels'):
            with self.subTest(part=part),tempfile.TemporaryDirectory() as temp:
                root=Path(temp);s=self.service();entry=self.entry();path=root/s.profile
                entry['data']['iCharacterSkinMaterialID']=700
                entry['data']['iCharacterSkinMaterialID_Modded']=701
                entry['data']['iVehicleMaterialID']=800
                entry['data']['iVehicleMaterialID_Modded']=801
                entry['data']['bUsingModdedVersion']=False
                original=self.quick_fixture();path.write_bytes(original)
                previous=view(Profile(original));slot=previous['quickSetups'][3]
                target=copy.deepcopy(entry['data'])
                if part:
                    target=copy.deepcopy(slot['data'])
                    field={'characters':'iCharacterSkinMaterialID','vehicles':'iVehicleMaterialID','wheels':'iWheelMaterialID'}[part]
                    for key in (field,field+'_Modded'):target[key]=entry['data'][key]
                s._lobby_cache={'time':time.monotonic(),'profile':s.profile,'private':{'key':entry}}
                operations=[]
                def native(game,profile,preset_id=0,player=0,baseline=None,desired=None,**kwargs):
                    if kwargs.get('operation')==2:
                        operations.append(2);return {'inRace':True,'players':[copy.deepcopy(entry)]}
                    operations.append(1)
                    self.assertEqual((preset_id,player),(slot['id'],3));self.assertEqual(baseline,slot['data']);self.assertEqual(desired,target)
                    raw,_=apply(Profile(path.read_bytes()),{'mode':'quick','player':3,'presetId':slot['id'],'data':desired})
                    path.write_bytes(raw);return {'saved':True,'menuRefreshed':False}
                def remote(action,body,**kwargs):
                    self.assertEqual(action,'read-save')
                    return {'account':s.account,'cloudEnabled':True,'saveHash':digest(path.read_bytes())}
                with patch('trackgroups.service.PROFILE_DIR',root),patch('trackgroups.service.DATA',root/'data'),patch('trackgroups.service.game_running',return_value=True),patch('trackgroups.service.Worker') as worker,patch('trackgroups.native_quick.request',side_effect=native):
                    worker.return_value.request.side_effect=remote
                    result=s.copy_lobby_preset({'key':'key','mode':'quick','player':3,**({'part':part} if part else {})})
                now=view(Profile(path.read_bytes()))
                self.assertEqual(operations,[2,1]);self.assertEqual(now['presets'],previous['presets']);self.assertEqual(now['groups'],previous['groups'])
                self.assertEqual(Profile(path.read_bytes()).spans[:2],Profile(original).spans[:2])
                self.assertEqual(now['quickSetups'][3]['data'],target)
                self.assertEqual([p for p in now['quickSetups'] if p['player']!=3],[p for p in previous['quickSetups'] if p['player']!=3])
                self.assertEqual(result['mode'],'quick');self.assertFalse(s.quick_saving)

    def test_quick_copy_rechecks_racer_and_rejects_changed_selection_before_any_write(self):
        s=self.service();entry=self.entry();s._lobby_cache={'time':time.monotonic(),'profile':s.profile,'private':{'key':entry}}
        changed=copy.deepcopy(entry);changed['data']['iWheelMaterialID_Modded']+=1
        with patch('trackgroups.service.game_running',return_value=True),patch('trackgroups.native_quick.request',return_value={'players':[changed]}) as native,patch.object(s,'save_live_quick') as save:
            with self.assertRaisesRegex(ValueError,'changed their setup'):s.copy_lobby_preset({'key':'key','mode':'quick','player':0})
            self.assertEqual(native.call_count,1);save.assert_not_called();self.assertFalse(s.quick_saving)

    def test_invalid_copy_modes_or_part_keys_never_call_game(self):
        s=self.service()
        with patch('trackgroups.native_quick.request') as native:
            for body in ({'key':'key','mode':'save','part':'characters'},{'key':'key','mode':'quick','player':True},{'key':'key','mode':'quick','part':'stickers'},{'key':'key','mode':'drop'},{'key':'key','workshopId':'1'}):
                with self.subTest(body=body),self.assertRaises(ValueError):s.copy_lobby_preset(body)
            native.assert_not_called()

    def test_remote_workshop_metadata_is_batched_cached_and_private_fields_are_filtered(self):
        s=self.service();entry=self.entry();entry['workshop']={'characters':{'id':'123','temporary':True}};entry['futurePrivateField']='secret'
        s.appearance=type('Appearance',(),{'snapshot':lambda self,_:{'items':{'characters':{},'vehicles':{'2':{'source':'official','label':'Kart'}},'wheels':{}}}})()
        reply={'inLobby':False,'inRace':True,'players':[entry],'settings':{'automaticDownloads':True,'privateToken':'never-public'}}
        with patch('trackgroups.service.game_running',return_value=True),patch('trackgroups.native_quick.available',return_value=True),patch('trackgroups.native_quick.request',return_value=reply),patch('trackgroups.service.Worker') as worker:
            worker.return_value.request.return_value={'account':s.account,'items':{'123':{'available':True,'title':'Workshop character pack','kind':'unknown','previewUrl':'https://images.steamusercontent.com/example'}},'status':{'123':{'subscribed':True}}}
            first=s.lobby_state();s._lobby_cache['time']-=3;second=s.lobby_state()
            worker.return_value.request.assert_called_once_with('details',{'ids':['123']},timeout=35)
        self.assertEqual(first['status'],'ready');self.assertTrue(first['inRace']);self.assertEqual(first['settings'],{'automaticDownloads':True})
        self.assertNotIn('secret',json.dumps(first));self.assertNotIn(entry['identity'],json.dumps(first))
        part=second['players'][0]['parts']['characters']
        self.assertFalse(part['installed']);self.assertFalse(part['subscribed']);self.assertTrue(part['canSubscribe']);self.assertTrue(part['temporary']);self.assertEqual(part['previewKind'],'package')

    def test_local_only_origin_cannot_be_replaced_with_a_native_numeric_workshop_guess(self):
        s=self.service();entry=self.entry();entry['workshop']={'characters':{'id':'123'}}
        appearance={'items':{'characters':{str(entry['data']['iCharacterSkinMaterialID_Modded']):{'source':'mod','localOnly':True}}}}
        self.assertIsNone(s._lobby_part_sources(entry,appearance)['characters']['workshopId'])

    def test_subscribe_requires_fresh_verified_source_and_keeps_account_bound(self):
        s=self.service();entry=self.entry();entry['workshop']={'characters':{'id':'123'}}
        s._lobby_cache={'time':time.monotonic(),'profile':s.profile,'private':{'key':entry}}
        s.appearance=type('Appearance',(),{'snapshot':lambda self,_:{'items':{}},'refresh':lambda self,game:None})()
        def native(*args,**kwargs):
            return {'retained':True} if kwargs.get('operation')==7 else {'players':[entry]}
        with patch('trackgroups.service.game_running',return_value=True),patch('trackgroups.native_quick.request',side_effect=native) as bridge,patch('trackgroups.service.Worker') as worker:
            worker.return_value.request.side_effect=lambda action,*args,**kwargs:({'account':s.account,'status':{'123':{'subscribed':True}}} if action=='details' else {'account':s.account,'subscribed':True})
            result=s.subscribe_lobby_part({'key':'key','kind':'characters'})
            worker.return_value.request.assert_any_call('subscribe-cosmetic',{'id':'123','account':s.account},timeout=125)
            worker.return_value.request.assert_any_call('details',{'ids':['123']},timeout=35)
            self.assertEqual(bridge.call_args_list[-1].kwargs,{'operation':7,'payload':{'workshopId':'123'}})
        self.assertTrue(result['subscribed']);self.assertFalse(s.quick_saving)

    def test_subscribe_rejects_unknown_or_local_source_without_steam_mutation(self):
        s=self.service();entry=self.entry();s._lobby_cache={'time':time.monotonic(),'profile':s.profile,'private':{'key':entry}}
        with patch('trackgroups.service.game_running',return_value=True),patch('trackgroups.native_quick.request',return_value={'players':[entry]}),patch('trackgroups.service.Worker') as worker:
            with self.assertRaisesRegex(ValueError,'no verified Workshop'):s.subscribe_lobby_part({'key':'key','kind':'characters'})
            worker.assert_not_called();self.assertFalse(s.quick_saving)

    def test_original_and_missing_mod_fallback_use_verified_official_parts(self):
        s=self.service();entry=self.entry()
        items={kind:{str(identity):{'source':'official','label':kind+' official'}} for kind,identity in (('characters',1),('vehicles',2),('wheels',3))}
        for flag in (False,True):
            with self.subTest(modded=flag):
                entry['data'].update({'bUsingModdedVersion':flag,'iCharacterSkinMaterialID_Modded':0,'iVehicleMaterialID_Modded':0,'iWheelMaterialID_Modded':0})
                sources=s._lobby_part_sources(entry,{'items':items})
                parts=s._lobby_public_parts(entry,{'items':items},{})
                self.assertEqual({kind:value['configId'] for kind,value in sources.items()},{'characters':1,'vehicles':2,'wheels':3})
                self.assertTrue(all(part['installed'] for part in parts.values()))
                self.assertTrue(all(part['view']=='original' for part in parts.values()))
                self.assertTrue(all(part['fallback'] is flag for part in parts.values()))

    def test_saved_state_is_derived_from_persisted_cosmetics_and_roster_keys_do_not_churn(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);s=self.service();entry=self.entry()
            entry['data']=view(Profile(fixture()))['presets'][0]['data']
            (root/s.profile).write_bytes(fixture())
            reply={'inLobby':True,'players':[entry]}
            with patch('trackgroups.service.PROFILE_DIR',root),patch('trackgroups.service.game_running',return_value=True),patch('trackgroups.native_quick.available',return_value=True),patch('trackgroups.native_quick.request',side_effect=lambda *args,**kwargs:copy.deepcopy(reply)):
                first=s.lobby_state();key=first['players'][0]['key']
                self.assertTrue(first['players'][0]['alreadySaved']);self.assertFalse(first['players'][0]['canSave'])
                reply['players'][0]['data']['iWheelMaterialID_Modded']=998
                reply['players'][0]['workshop']={'wheels':{'id':'invalid'}}
                s._lobby_cache['time']=0
                second=s.lobby_state()
                self.assertEqual(second['players'][0]['key'],key);self.assertFalse(second['players'][0]['alreadySaved'])

    def test_authorized_cpu_edit_uses_native_lobby_action_without_library_or_cloud_writes(self):
        s=self.service();entry=self.entry();entry['ai']=True;s.cloud_enabled=False
        s._lobby_cache={'time':time.monotonic(),'profile':s.profile,'private':{'key':entry},'public':{'players':[{'key':'key','data':copy.deepcopy(entry['data']),'canEditCpu':True}]}}
        target=copy.deepcopy(entry['data']);target['iWheelMaterialID_Modded']=114
        with patch('trackgroups.service.game_running',return_value=True),patch('trackgroups.native_quick.request',return_value={'saved':True,'current':target}) as native,patch('trackgroups.service.Worker') as worker:
            result=s.edit_lobby_player({'key':'key','data':target,'baseline':{'id':entry['id'],'data':copy.deepcopy(entry['data'])}})
            native.assert_called_once_with(s.game,s.profile,entry['id'],entry['player'],self.entry()['data'],target,operation=8,identity=entry['identity'])
            worker.assert_not_called()
        self.assertEqual(result['mode'],'cpu');self.assertFalse(s.quick_saving);self.assertEqual(s._lobby_cache['private']['key']['data'],target)

    def test_remote_human_edit_or_unverified_cpu_authority_cannot_call_bridge(self):
        for ai in (False,True):
            s=self.service();entry=self.entry();entry['ai']=ai
            s._lobby_cache={'time':time.monotonic(),'profile':s.profile,'private':{'key':entry},'public':{'players':[{'key':'key','canEditCpu':False}]}}
            with patch('trackgroups.service.game_running',return_value=True),patch('trackgroups.native_quick.request') as native:
                with self.assertRaisesRegex(ValueError,'authorized CPU'):s.edit_lobby_player({'key':'key','data':entry['data'],'baseline':{'id':entry['id'],'data':entry['data']}})
                native.assert_not_called()

    def test_retention_failure_never_claims_a_temporary_subscription_is_permanent(self):
        s=self.service();entry=self.entry();entry['workshop']={'characters':{'id':'123','temporary':True}}
        s._lobby_cache={'time':time.monotonic(),'profile':s.profile,'private':{'key':entry}}
        def native(*args,**kwargs):return {'retained':False} if kwargs.get('operation')==7 else {'players':[entry]}
        with patch('trackgroups.service.game_running',return_value=True),patch('trackgroups.native_quick.request',side_effect=native),patch('trackgroups.service.Worker') as worker:
            worker.return_value.request.return_value={'account':s.account,'subscribed':True}
            with self.assertRaisesRegex(ValueError,'temporary download ownership'):s.subscribe_lobby_part({'key':'key','kind':'characters'})
        self.assertFalse(s.quick_saving)

    def test_cleanup_race_re_subscribes_once_after_ownership_transfer_and_rechecks_steam(self):
        s=self.service();entry=self.entry();entry['workshop']={'characters':{'id':'123','temporary':True}}
        s._lobby_cache={'time':time.monotonic(),'profile':s.profile,'private':{'key':entry}}
        checks=[]
        def remote(action,*args,**kwargs):
            if action=='details':
                checks.append(True)
                return {'account':s.account,'status':{'123':{'subscribed':len(checks)>1}}}
            return {'account':s.account,'subscribed':True}
        def native(*args,**kwargs):return {'retained':True} if kwargs.get('operation')==7 else {'players':[entry]}
        with patch('trackgroups.service.game_running',return_value=True),patch('trackgroups.native_quick.request',side_effect=native) as bridge,patch('trackgroups.service.Worker') as worker:
            worker.return_value.request.side_effect=remote
            result=s.subscribe_lobby_part({'key':'key','kind':'characters'})
            self.assertEqual([call.args[0] for call in worker.return_value.request.call_args_list],['subscribe-cosmetic','details','subscribe-cosmetic','details'])
            self.assertEqual([call.kwargs['operation'] for call in bridge.call_args_list],[2,7,7])
        self.assertTrue(result['subscribed']);self.assertFalse(s.quick_saving)
