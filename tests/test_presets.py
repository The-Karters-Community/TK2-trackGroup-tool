import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from trackgroups.profile import Profile, encode_length
from trackgroups.presets import apply, export, read, validate_pack, view, verify_edit_base
from trackgroups.transaction import commit, digest
from test_transaction import FakeSteam


def fixture():
    p = {'iPresetID': 100, 'bUsingModdedVersion':True,
         'iCharacterSkinMaterialID':1,'iVehicleMaterialID':2,'iWheelMaterialID':3,
         'iCharacterSkinMaterialID_Modded':-2147483648,'iVehicleMaterialID_Modded':2,'iWheelMaterialID_Modded':3,
         'stickersData':[{'iStickerMaterialID':4,'iStickerMaterialID_SettingsPacked':-1,
                         'iStickerMaterialID_Modded':4,'iStickerMaterialID_Modded_SettingsPacked':-1} for _ in range(20)],
         'futureNativeField': {'keep':42}}
    p['stickersData'][0]['futureStickerField'] = 6
    data = {'private':{'account':9876543210987654321}, 'progress':1.234,
            'QuickCreationPreset':{'iPresetID':101}, 'lastLocalChoosedPresetsIds':[-1],
            'ItemsGroupDefinedContainers':[
                {'GroupDefinition':{'UniqueID':'builtin','Name':'All Presets','Type':1,'SubType':4,'Index':0,'IsDefault':True}},
                {'GroupDefinition':{'UniqueID':'tracks','Name':'My tracks','Type':0,'SubType':0,'Index':1,'IsDefault':False},'groupItems':[]},
                {'GroupDefinition':{'UniqueID':'11111111-1111-1111-1111-111111111111','Name':'Sönic','Type':1,'SubType':4,'Index':1,'IsDefault':False},
                 'groupItems':[{'configID':-1,'modHashID':'','iPresetID':100}]}]}
    strings = [json.dumps([p]), 'exact separator', json.dumps(data)]
    return b''.join(encode_length(len(s.encode()))+s.encode() for s in strings)


class PresetTests(unittest.TestCase):
    def test_rebase_accepts_unrelated_progress_but_refuses_changed_target(self):
        p = Profile(fixture())
        base = view(p)['presets'][0]
        change = {'mode':'preset', 'presetId':100, 'data':base['data']}
        p.data['progress'] = 999
        verify_edit_base(p, change, base)
        changed = copy.deepcopy(base['data'])
        changed['iVehicleMaterialID_Modded'] = 17
        after = Profile(apply(p, {**change, 'data':changed})[0])
        with self.assertRaisesRegex(ValueError, 'changed in the game'):
            verify_edit_base(after, change, base)
        with self.assertRaises(ValueError):
            verify_edit_base(p, change, None)
        with self.assertRaises(ValueError):
            verify_edit_base(p, {'mode':'delete','presetId':100}, base)

    def test_group_removal_preserves_every_preset_and_other_save_records(self):
        p = Profile(apply(Profile(fixture()), {'mode':'duplicate', 'presetId':100})[0])
        group = view(p)['groups'][0]
        raw, _ = apply(p, {'mode':'group','groupId':group['id'],'name':group['name'],'members':[102]})
        q = Profile(raw)
        self.assertEqual(q.spans[:2], p.spans[:2])
        self.assertEqual(read(q), read(p))
        self.assertEqual(view(q)['groups'][0]['members'], [102])
        self.assertEqual(q.data['private'], p.data['private'])
        verify_edit_base(p, {'mode':'group','groupId':group['id']}, group)
        with self.assertRaises(ValueError):
            verify_edit_base(q, {'mode':'group','groupId':group['id']}, group)

    def test_noop_export_has_no_private_or_native_extensions(self):
        p = Profile(fixture()); pack = export(p, [], [view(p)['groups'][0]['id']])
        self.assertEqual(p.unchanged(), fixture())
        self.assertNotIn('private', json.dumps(pack)); self.assertNotIn('future', json.dumps(pack))
        self.assertEqual(pack['groups'][0]['name'], 'Sönic')

    def test_duplicate_reserves_quick_creation_id_and_preserves_other_records(self):
        p = Profile(fixture()); raw,_ = apply(p, {'mode':'duplicate','presetId':100})
        after=Profile(raw); self.assertEqual([v['iPresetID'] for v in read(after)], [100,102])
        self.assertEqual(after.spans[1:], p.spans[1:])
        self.assertEqual(read(after)[1]['futureNativeField'], {'keep':42})

    def test_import_remaps_collision_and_shares_one_preset_between_groups(self):
        p=Profile(fixture()); pack=export(p,[100],[])
        pack['presets'][0]['data']['iVehicleMaterialID']=8
        for digit in ['2','3']:
            pack['groups'].append({'id':f'{digit*8}-{digit*4}-{digit*4}-{digit*4}-{digit*12}', 'name':digit, 'presets':['preset:100']})
        raw,_=apply(p,{'mode':'import','pack':pack})
        after=Profile(raw); self.assertEqual(len(read(after)),2)
        self.assertEqual([g['members'] for g in view(after)['groups']][-2:], [[102],[102]])
        self.assertEqual(after.data['private'],p.data['private'])
        self.assertEqual(after.groups[0:2],p.groups[0:2]); self.assertEqual(after.spans[1],p.spans[1])
        with self.assertRaisesRegex(ValueError,'Confirm'): apply(after,{'mode':'import','pack':pack})
        repeated,_=apply(after,{'mode':'import','pack':pack,'confirmUpdate':True})
        self.assertEqual(repeated,raw)

    def test_edit_keeps_unknown_sticker_fields_and_third_record(self):
        p=Profile(fixture()); value=view(p)['presets'][0]['data']; value['stickersData'][0]['iStickerMaterialID_SettingsPacked']=-2147483648
        raw,_=apply(p,{'mode':'preset','presetId':100,'data':value})
        after=Profile(raw); self.assertEqual(after.spans[1:],p.spans[1:]); self.assertEqual(read(after)[0]['stickersData'][0]['futureStickerField'],6)

    def test_distinct_identical_presets_remain_distinct_and_repeat_is_noop(self):
        p=Profile(fixture()); raw,_=apply(p,{'mode':'duplicate','presetId':100}); q=Profile(raw)
        identity=view(q)['groups'][0]['id']
        q=Profile(apply(q,{'mode':'group','groupId':identity,'name':'Sonic','members':[102,100]})[0])
        pack=export(q,[],[identity])
        after,_=apply(p,{'mode':'import','pack':pack,'confirmUpdate':True})
        state=view(Profile(after)); self.assertEqual(len(state['presets']),2);self.assertEqual(state['groups'][0]['members'],[102,100])
        repeated,_=apply(Profile(after),{'mode':'import','pack':pack,'confirmUpdate':True});self.assertEqual(repeated,after)

    def test_malformed_private_unknown_and_missing_member_rejected(self):
        p=Profile(fixture()); pack=export(p,[100],[])
        for mutate in [lambda p:p.update(credentials='secret'),lambda p:p['presets'][0]['data'].update(account=1),lambda p:p['presets'][0]['data'].update(iWheelMaterialID=True),lambda p:p['presets'][0]['data']['stickersData'].pop()]:
            bad=copy.deepcopy(pack); mutate(bad)
            with self.assertRaises(ValueError): validate_pack(bad)
        pack['groups']=[{'id':'22222222-2222-2222-2222-222222222222','name':'Test','presets':['missing']}]
        with self.assertRaises(ValueError):validate_pack(pack)

    def test_order_and_group_membership(self):
        p=Profile(apply(Profile(fixture()),{'mode':'duplicate','presetId':100})[0])
        raw,_=apply(p,{'mode':'order','order':[102,100]})
        self.assertEqual([p['iPresetID'] for p in read(Profile(raw))],[102,100])
        raw,_=apply(Profile(raw),{'mode':'group','groupId':view(p)['groups'][0]['id'],'name':'新しい','members':[102,100]})
        self.assertEqual(view(Profile(raw))['groups'][0]['members'],[102,100])
        with self.assertRaises(ValueError):apply(p,{'mode':'order','order':[100,100]})

    def test_protected_group_and_last_preset_cannot_be_removed(self):
        p=Profile(fixture())
        with self.assertRaises(ValueError):apply(p,{'mode':'delete-group','groupId':'builtin'})
        with self.assertRaises(ValueError):apply(p,{'mode':'delete','presetId':100})

    def test_group_order_preserves_native_positions_and_track_groups(self):
        p=Profile(fixture()); original=view(p)['groups'][0]['id']; second='22222222-2222-2222-2222-222222222222'
        raw,_=apply(p,{'mode':'group','groupId':second,'name':'Second','members':[100]})
        q=Profile(raw); after=Profile(apply(q,{'mode':'group-order','order':[second,original]})[0])
        self.assertEqual([g['id'] for g in view(after)['groups']],[second,original])
        self.assertEqual(after.spans[:2],q.spans[:2]);self.assertEqual(after.groups[:2],q.groups[:2])

    def test_local_inventory_excludes_tracks_and_never_reads_credentials(self):
        from trackgroups.preset_assets import local_packages
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); mod=root/'Mods/Test'; (mod/'StandaloneWindows64').mkdir(parents=True)
            catalog=mod/'StandaloneWindows64/catalog_config.json'
            catalog.write_text(json.dumps({'m_InternalIds':['Assets/Workshop_Content/Characters/Sonic/Object.prefab']}))
            (mod/'UploadPasswordNotShared.txt').write_text('DO NOT EXPORT')
            result=local_packages(root); self.assertEqual(result,[{'name':'Test','kinds':['characters']}]);self.assertNotIn('DO NOT EXPORT',str(result))
            catalog.write_text(json.dumps({'m_InternalIds':['Assets/Workshop_Content/Tracks/Test/Track.unity']}))
            self.assertEqual(local_packages(root),[])

    def test_cloud_transaction_rolls_back_both_records_on_failed_write(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); file=root/'1009PTK_PlayerData_v19tpp0_bt0'; before=fixture();file.write_bytes(before); steam=FakeSteam(before)
            args=dict(preset=True,backups=root/'backups',running=lambda:False)
            with patch('trackgroups.transaction.atomic_bytes',side_effect=OSError('locked')):
                with self.assertRaisesRegex(ValueError,'original save'):commit(steam,file,{'mode':'duplicate','presetId':100},digest(before),'account',**args)
            self.assertEqual(steam.data,before);self.assertEqual(file.read_bytes(),before)
            commit(steam,file,{'mode':'duplicate','presetId':100},digest(before),'account',**args)
            self.assertEqual(steam.data,file.read_bytes()); self.assertEqual(len(read(Profile(steam.data))),2)


class QuickSetupTests(unittest.TestCase):
    def test_quick_setup_edits_only_its_native_object_and_reserves_dynamic_id(self):
        profile = Profile(fixture())
        quick = copy.deepcopy(read(profile)[0]); quick['iPresetID'] = 338088
        profile.data['QuickCreationPreset'] = quick
        profile = Profile(profile.serialize(profile.data))
        state = view(profile); baseline = state['quickSetup']
        self.assertEqual(baseline['id'],338088)
        changed = copy.deepcopy(baseline['data']); changed['iVehicleMaterialID_Modded'] = 7
        change = {'mode':'quick','presetId':338088,'data':changed}
        verify_edit_base(profile,change,baseline)
        after = Profile(apply(profile,change)[0])
        self.assertEqual(after.spans[:2],profile.spans[:2])
        self.assertEqual(after.data['QuickCreationPreset']['iVehicleMaterialID_Modded'],7)
        self.assertEqual(after.data['QuickCreationPreset']['futureNativeField'],{'keep':42})
        with self.assertRaises(ValueError): verify_edit_base(after,change,baseline)
        duplicated = Profile(apply(after,{'mode':'save-quick-preset'})[0])
        self.assertEqual(len(read(duplicated)),2)
        self.assertEqual(duplicated.data,after.data)
        self.assertNotEqual(read(duplicated)[1]['iPresetID'],338088)


    def test_player_slot_wins_over_stale_legacy_quick_and_preserves_other_players(self):
        profile=Profile(fixture()); base=copy.deepcopy(read(profile)[0])
        legacy={**copy.deepcopy(base),'iPresetID':338088}
        first={**copy.deepcopy(legacy),'iCharacterSkinMaterialID_Modded':-1279875073}
        second={**copy.deepcopy(base),'iPresetID':606594}
        profile.data['QuickCreationPreset']=legacy
        profile.data['QuickCreationPresets']=[{'BQuickPresetInitialized':True,'QuickPreset':first}, {'BQuickPresetInitialized':True,'QuickPreset':second}]
        profile=Profile(profile.serialize(profile.data))
        state=view(profile)
        self.assertEqual(state['quickSetup']['data']['iCharacterSkinMaterialID_Modded'],-1279875073)
        self.assertEqual([p['player'] for p in state['quickSetups']],[0,1])
        change={'mode':'quick','player':1,'presetId':606594,'data':{**state['quickSetups'][1]['data'],'iVehicleMaterialID_Modded':88}}
        after=Profile(apply(profile,change)[0])
        self.assertEqual(after.data['QuickCreationPreset'],legacy)
        self.assertEqual(after.data['QuickCreationPresets'][0]['QuickPreset'],first)
        self.assertEqual(after.data['QuickCreationPresets'][1]['QuickPreset']['iVehicleMaterialID_Modded'],88)
        self.assertEqual(after.spans[:2],profile.spans[:2])
