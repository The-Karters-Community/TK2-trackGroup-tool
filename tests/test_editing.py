import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from trackgroups import catalog
from trackgroups.drafts import parse_items, create_group
from trackgroups.profile import Profile
from trackgroups.service import Service
from trackgroups.transaction import commit, digest
from test_profile import group, profile


class EditingTests(unittest.TestCase):
    def test_pasted_ids_preserve_order_and_accept_workshop_links(self):
        self.assertEqual(parse_items('3263970719, https://steamcommunity.com/sharedfiles/filedetails/?id=3279611598\n42'), ['3263970719', '3279611598', '42'])
        for text in ('', '1 1', '0', '01', '-1', '18446744073709551616', 'https://example.com/?id=1'):
            with self.subTest(text=text), self.assertRaises(ValueError): parse_items(text)

    def test_created_group_resolves_titles_and_rejects_unavailable_items(self):
        items = {'1':{'available':True, 'modId':'track-one', 'title':'First'}, '2':{'available':True, 'modId':'track-two', 'title':'Second'}}
        result = create_group('My new group', ['2','1'], items)
        self.assertEqual([t['title'] for t in result['tracks']], ['Second', 'First'])
        for metadata in ({}, {'1':{'available':True, 'modId':''}}):
            with self.assertRaises(ValueError): create_group('Name', ['1'], metadata)

    def test_rename_changes_only_name_including_unresolved_tracks_and_presets(self):
        raw, _ = Profile(profile()).import_group(group())
        p = Profile(raw)
        p.data['ItemsGroupDefinedContainers'][0]['groupItems'][1]['iPresetID'] = 7
        p = Profile(p.serialize(p.data))
        after, outcome = p.rename_group(group()['id'], 'New 雪 name')
        self.assertEqual(outcome, 'renamed')
        expected = copy.deepcopy(p.data)
        expected['ItemsGroupDefinedContainers'][0]['GroupDefinition']['Name'] = 'New 雪 name'
        self.assertEqual(Profile(after).data, expected)
        self.assertEqual(Profile(after).spans[:2], p.spans[:2])
        self.assertEqual(p.rename_group(group()['id'], group()['name']), (p.original, 'unchanged'))
        with self.assertRaises(ValueError): p.rename_group(group()['id'], '\n')
        with self.assertRaises(ValueError): p.rename_group('missing', 'New')

    def test_rename_transaction_updates_both_copies_and_preserves_dependencies(self):
        before, _ = Profile(profile()).import_group(group())
        class Steam:
            account = 'test'
            data = before
            def read_save(self, _): return self.data
            def write_save(self, _, value): self.data = value
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); path = root / '1009PTK_PlayerData_v19tpp0_bt0'; path.write_bytes(before)
            steam = Steam()
            result = commit(steam, path, {'id':group()['id'], 'name':'Renamed'}, digest(before), 'test', rename=True, backups=root/'backups', running=lambda:False)
            self.assertEqual(result['outcome'], 'renamed')
            self.assertEqual(steam.data, path.read_bytes())
            self.assertEqual(Profile(steam.data).groups[0]['groupItems'], Profile(before).groups[0]['groupItems'])

    def test_catalog_categories_do_not_enter_portable_exports(self):
        values = catalog.read_catalog(Path(__file__).resolve().parents[1] / 'catalog')
        initial_ids = {'f800601b-b5ee-44dd-b118-27d719220ca9', '67eeba54-c1a1-4795-901e-aab8e80f0174', 'b48feb66-16f1-4d23-94cf-e9b6a9303427'}
        self.assertTrue(all(g['category'] == 'speedrun' for g in values if g['id'] in initial_ids))
        self.assertEqual(catalog.categorized(group())['category'], 'community')
        with self.assertRaises(ValueError): catalog.categorized(group(), 'anything')

    def test_create_preview_is_read_only_and_enriches_names_and_status(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); name = '1009PTK_PlayerData_v19tpp0_bt0'; raw = profile(); (root/name).write_bytes(raw)
            items = {'3263970719':{'available':True,'modId':'example','title':'Cortex Castle','previewUrl':'https://images.steamusercontent.com/test','workshopId':'3263970719'}}
            response = {'account':'test', 'items':items, 'status':{'3263970719':{'subscribed':False,'ready':False}}}
            with patch('trackgroups.service.PROFILE_DIR', root), patch('trackgroups.service.DATA', root), patch('trackgroups.service.discover_games', return_value=[]), patch('trackgroups.service.game_running', return_value=False), patch.object(Service, 'supported_game'), patch('trackgroups.service.Worker') as worker:
                service = Service(); service.account = 'test'; service.sync_error = ''; service.job = {}
                worker.return_value.request.return_value = response
                result = service.make_preview('create', {'name':'New group','items':'3263970719'})['preview']
                self.assertEqual(result['group']['tracks'][0]['title'], 'Cortex Castle')
                self.assertEqual(result['group']['previewImages'], ['https://images.steamusercontent.com/test'])
                self.assertNotIn('previewImages', service.previews[result['token']]['group'])
                self.assertEqual(result['missingSubscriptions'], ['3263970719'])
                self.assertEqual(result['pendingDownloads'], ['3263970719'])
                self.assertEqual((root/name).read_bytes(), raw)
                self.assertEqual(service.items, items)

    def test_rename_preview_needs_no_workshop_lookup_or_download(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); name = '1009PTK_PlayerData_v19tpp0_bt0'; raw, _ = Profile(profile()).import_group(group()); (root/name).write_bytes(raw)
            with patch('trackgroups.service.PROFILE_DIR', root), patch('trackgroups.service.DATA', root), patch('trackgroups.service.discover_games', return_value=[]), patch('trackgroups.service.game_running', return_value=False), patch.object(Service, 'supported_game'), patch('trackgroups.service.Worker') as worker:
                service = Service(); service.account = 'test'; service.sync_error = ''; service.job = {}
                preview = service.make_preview('rename', {'id':group()['id'], 'name':'New name'})['preview']
                self.assertEqual(preview['mode'], 'rename')
                self.assertEqual(preview['pendingDownloads'], [])
                self.assertEqual(preview['group']['tracks'][1]['title'], 'example')
                worker.assert_not_called()
                self.assertEqual((root/name).read_bytes(), raw)
