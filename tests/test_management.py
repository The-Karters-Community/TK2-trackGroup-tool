import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from trackgroups.dependencies import Dependencies
from trackgroups.profile import Profile
from trackgroups.runtime import write_json
from trackgroups import worker
from test_profile import profile, group


class ManagementTests(unittest.TestCase):
    def test_official_metadata_matches_supplied_images_and_preserves_native_ids(self):
        from trackgroups.groups import OFFICIAL_TRACKS, export_native
        from trackgroups.runtime import ROOT
        self.assertEqual(len(OFFICIAL_TRACKS), 16)
        self.assertEqual(OFFICIAL_TRACKS['267992']['title'], 'Gauntlet Run')
        self.assertEqual(OFFICIAL_TRACKS['898342']['title'], 'Scuba Diving')
        for key, metadata in OFFICIAL_TRACKS.items():
            self.assertTrue((ROOT / 'ui/public' / metadata['image'].lstrip('/')).is_file())
            native = {'GroupDefinition': {'UniqueID': group()['id'], 'Name':'Official', 'IsDefault':False, 'Type':0, 'SubType':0}, 'groupItems':[{'configID':int(key), 'modHashID':'', 'iPresetID':77}]}
            exported = export_native(native, {})
            self.assertEqual(exported['tracks'][0]['title'], metadata['title'])
            self.assertEqual(exported['tracks'][0]['configId'], int(key))

    def test_dependency_id_survives_unsubscribe_restart_and_unavailable_metadata(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'dependencies.json'
            registry = Dependencies(path)
            registry.remember({'123':{'available':True, 'modId':'lego', 'title':'LEGO track', 'account':'private', 'credentials':'private'}})
            registry.remember({'123':{'available':False}})
            restored = Dependencies(path)
            self.assertEqual(restored.mapping()['lego']['workshopId'], '123')
            self.assertNotIn('private', path.read_text())
            self.assertEqual(set(restored.items['123']), {'workshopId', 'modId', 'title', 'available'})
            restored.catalog([{'tracks':[{'kind':'workshop', 'workshopId':'123', 'modId':'lego', 'title':'Old title'}]}])
            self.assertEqual(restored.items['123']['title'], 'LEGO track')

    def test_refresh_queries_known_unsubscribed_tracks_and_reports_missing_status(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            write_json(root / 'request.json', {'game':'fixture', 'action':'snapshot', 'ids':['123', '456']})
            queried = []
            class Steam:
                account = 'fixture'
                def __init__(self, _): pass
                def close(self): pass
                def subscribed(self): return ['456']
                def storage_call(self, *_): return True
                def details(self, ids, *_): queried.extend(ids); return {item:{'available':True} for item in ids}
                def item_status(self, item): return {'subscribed':item == '456', 'ready':item == '456'}
                def installed(self, item): return True
            with patch.object(worker, 'Steam', Steam): worker.run(root)
            result = json.loads((root / 'result.json').read_text())
            self.assertEqual(queried, ['456', '123'])
            self.assertFalse(result['status']['123']['subscribed'])

    def test_steam_installed_flag_does_not_hide_missing_content_files(self):
        class Steam:
            def item_status(self, _): return {'ready':True, 'subscribed':True}
            def installed(self, _): raise ValueError('Content removed')
        status = worker.installation_status(Steam(), '123')
        self.assertFalse(status['ready'])
        self.assertTrue(status['subscribed'])
        self.assertIn('missing', status['problem'])

    def test_order_edit_preserves_full_native_items_presets_records_and_other_fields(self):
        raw, _ = Profile(profile()).import_group(group())
        before = Profile(raw)
        before.groups[0]['groupItems'][1]['iPresetID'] = 77
        before = Profile(before.serialize(before.data))
        after, outcome = before.edit_group(group()['id'], 'New 雪 name', [1, 0])
        expected = copy.deepcopy(before.data)
        expected['ItemsGroupDefinedContainers'][0]['groupItems'].reverse()
        expected['ItemsGroupDefinedContainers'][0]['GroupDefinition']['Name'] = 'New 雪 name'
        self.assertEqual(Profile(after).data, expected)
        self.assertEqual(Profile(after).spans[:2], before.spans[:2])
        self.assertEqual(outcome, 'updated')
        self.assertEqual(before.edit_group(group()['id'], group()['name'], [0, 1]), (before.original, 'unchanged'))
        for order in ([0, 0], [0], [1, 2], [True, 0], '01'):
            with self.subTest(order=order), self.assertRaises(ValueError): before.edit_group(group()['id'], 'Name', order)

    def test_repair_downloads_dependencies_without_ever_writing_profile(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); name = '1009PTK_PlayerData_v19tpp0_bt0'; raw = profile(); (root / name).write_bytes(raw)
            from trackgroups.transaction import digest
            g = group(); g['tracks'] = g['tracks'][1:]
            write_json(root / 'request.json', {'game':'fixture', 'action':'repair', 'group':g, 'profile':name, 'account':'fixture', 'expectedHash':digest(raw)})
            class Steam:
                account = 'fixture'
                def __init__(self, _): self.dll = self; self.ready = False
                def close(self): pass
                def storage_call(self, *_): return True
                def read_save(self, _): return raw
                def details(self, ids, *_): return {ids[0]:{'available':True, 'modId':'example'}}
                def item_status(self, _): return {'subscribed':self.ready, 'ready':self.ready}
                def subscribe(self, *_): self.ready = True
                def installed(self, _): return True
                def SteamAPI_RunCallbacks(self): pass
            with patch.object(worker, 'Steam', Steam), patch('trackgroups.runtime.PROFILE_DIR', root), patch('trackgroups.runtime.game_running', return_value=False), patch('trackgroups.transaction.commit') as commit:
                worker.run(root)
            result = json.loads((root / 'result.json').read_text())
            self.assertEqual(result['outcome'], 'repaired')
            self.assertEqual((root / name).read_bytes(), raw)
            commit.assert_not_called()
