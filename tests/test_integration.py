import base64
import json
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch

from trackgroups import catalog, worker
from trackgroups.app import make_server
from trackgroups.content import verify_installation
from trackgroups.profile import Profile, encode_length
from trackgroups.transaction import digest
from trackgroups.runtime import write_json
from test_profile import group, profile


class CatalogTests(unittest.TestCase):
    def test_bundled_catalog_has_exact_order_and_counts(self):
        values = catalog.read_catalog(Path(__file__).resolve().parents[1] / 'catalog')
        self.assertEqual([len(g['tracks']) for g in values], [16, 24, 18])
        self.assertEqual(values[0]['name'], 'Official 16-Track GP  SR.com')
        self.assertEqual(sum(t['kind'] == 'workshop' for g in values for t in g['tracks']), 42)

    def test_bad_refresh_retains_cache(self):
        with tempfile.TemporaryDirectory() as folder:
            data = Path(folder); cache = data / 'catalog-cache.json'; cache.write_text('original')
            with patch.object(catalog, 'DATA', data), patch.object(catalog, 'resolve_revision', return_value='a' * 40), patch.object(catalog, 'fetch', return_value=b'{"version":2}'):
                with self.assertRaises(ValueError): catalog.refresh()
            self.assertEqual(cache.read_text(), 'original')

    def test_refresh_pins_all_files_to_one_commit(self):
        bundled = Path(__file__).resolve().parents[1] / 'catalog'
        revision = 'a' * 40
        with tempfile.TemporaryDirectory() as folder, patch.object(catalog, 'DATA', Path(folder)), patch.object(catalog, 'resolve_revision', return_value=revision) as resolve, patch.object(catalog, 'fetch', side_effect=lambda name, commit: (bundled / name).read_bytes()) as fetch:
            self.assertEqual(len(catalog.refresh()), 3)
            resolve.assert_called_once_with()
            self.assertEqual(len(fetch.call_args_list), 4)
            self.assertTrue(all(call.args[1] == revision for call in fetch.call_args_list))

    def test_invalid_remote_revision_is_rejected(self):
        with patch.object(catalog, 'download', return_value=b'{"object":{"sha":"../main"}}'):
            with self.assertRaises(ValueError): catalog.resolve_revision()


class InstallTests(unittest.TestCase):
    def test_delayed_download_waits_before_commit_and_failed_download_never_commits(self):
        for accepted in (True, False):
            with self.subTest(downloadAccepted=accepted), tempfile.TemporaryDirectory() as folder:
                root = Path(folder); name = '1009PTK_PlayerData_v19tpp0_bt0'; before = profile()
                (root / name).write_bytes(before)
                g = group(); g['tracks'] = g['tracks'][1:]
                write_json(root / 'request.json', {'game':'fixture', 'action':'install', 'group':g,
                    'profile':name, 'account':'test', 'expectedHash':digest(before)})
                calls = []
                class Steam:
                    account = 'test'
                    ticks = 0
                    subscribed = False
                    def __init__(self, game): self.dll = self
                    def close(self): pass
                    def read_save(self, name): return before
                    def storage_call(self, *_): return True
                    def details(self, ids, *_): return {ids[0]: {'available':True, 'modId':'example'}}
                    def item_status(self, item): return {'subscribed':self.subscribed, 'ready':self.ticks >= 2}
                    def subscribe(self, *_): self.subscribed = True; calls.append('subscribe')
                    def ugc_call(self, name, *_): calls.append(name); return accepted
                    def installed(self, item): return self.ticks >= 2
                    def SteamAPI_RunCallbacks(self): self.ticks += 1
                def save(steam, *_):
                    self.assertGreaterEqual(steam.ticks, 2)
                    calls.append('commit')
                    return {'outcome':'added'}
                with patch.object(worker, 'Steam', Steam), patch('trackgroups.runtime.PROFILE_DIR', root), patch('trackgroups.runtime.game_running', return_value=False), patch('trackgroups.transaction.commit', side_effect=save), patch.object(worker.time, 'sleep'):
                    worker.run(root)
                result = json.loads((root / 'result.json').read_text(encoding='utf-8'))
                self.assertEqual((root / name).read_bytes(), before)
                if accepted:
                    self.assertEqual(calls, ['subscribe', 'DownloadItem', 'commit'])
                    self.assertEqual(result['newSubscriptions'], ['3263970719'])
                else:
                    self.assertNotIn('commit', calls)
                    self.assertIn('remain', result['error'])

    def test_steam_unavailable_returns_error_without_save_changes(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); write_json(root / 'request.json', {'game':'fixture', 'action':'snapshot'})
            with patch.object(worker, 'Steam', side_effect=ValueError('Steam unavailable')): worker.run(root)
            self.assertEqual(json.loads((root / 'result.json').read_text(encoding='utf-8'))['error'], 'Steam unavailable')

    def test_worker_reads_unicode_requests_as_utf8(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            write_json(root / 'request.json', {'game': '雪 — Pelit', 'action': 'details', 'ids': []})
            seen = []
            class Steam:
                account = 'test'
                def __init__(self, game): seen.append(game)
                def close(self): pass
                def details(self, ids): return {}
            with patch.object(worker, 'Steam', Steam): worker.run(root)
            self.assertEqual(seen, ['雪 — Pelit'])
            self.assertNotIn('error', json.loads((root / 'result.json').read_text(encoding='utf-8')))

    def test_catalog_checks_item_namespace_scene_and_bundles(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / '2269950' / '123'; root.mkdir(parents=True)
            data = {'m_KeyDataString': base64.b64encode(b'ModInfo Tracks_Example').decode(),
                    'm_InternalIds': ['Assets/Workshop_Content/Tracks/Test/Track.unity', 'file://{DATA_PATH}/a.bundle']}
            (root / 'catalog_config.json').write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError, 'incomplete'): verify_installation(root, '123')
            (root / 'a.bundle').write_bytes(b'fixture')
            self.assertTrue(verify_installation(root, '123'))
            with self.assertRaisesRegex(ValueError, 'different'): verify_installation(root, '124')

    def run_worker(self, error=None, cancelled=False, mismatch=False):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); name = '1009PTK_PlayerData_v19tpp0_bt0'; before = profile()
            p = Profile(before); p.data['ItemsGroupDefinedContainers'] = [{'GroupDefinition': {'Type': 0, 'SubType': 0, 'IsDefault': True}, 'groupItems': [{'configID':44}]}]
            raw = json.dumps(p.data).encode(); before = b''.join(p.spans[:2]) + encode_length(len(raw)) + raw
            (root / name).write_bytes(before)
            (root / 'request.json').write_text(json.dumps({'game': 'fixture', 'action': 'install', 'group': group(),
                'profile': name, 'account': 'test', 'expectedHash': digest(before)}))
            if cancelled: (root / 'cancel').touch()
            class Steam:
                account = 'test'
                def __init__(self, game): pass
                def close(self): pass
                def read_save(self, name): return before
                def storage_call(self, *_): return True
                def details(self, ids, *_): return {ids[0]: {'available': not mismatch, 'modId': 'example'}}
                def item_status(self, item): return {'subscribed': False, 'ready': False}
                def subscribe(self, *_): raise ValueError(error or 'subscription failed')
            with patch.object(worker, 'Steam', Steam), patch('trackgroups.runtime.PROFILE_DIR', root), patch('trackgroups.runtime.game_running', return_value=False):
                worker.run(root)
            self.assertEqual((root / name).read_bytes(), before)
            return json.loads((root / 'result.json').read_text())['error']

    def test_failed_subscription_does_not_write_profile(self):
        self.assertIn('subscription failed', self.run_worker())

    def test_cancelled_import_does_not_write_profile(self):
        self.assertIn('cancelled', self.run_worker(cancelled=True))

    def test_private_deleted_or_mismatched_item_rejected(self):
        self.assertIn('unavailable', self.run_worker(mismatch=True))


class HttpTests(unittest.TestCase):
    def test_session_token_host_and_origin_guards(self):
        class Service:
            def state(self): return {'version': 'test'}
        server = make_server(Service()); thread = threading.Thread(target=server.serve_forever); thread.start()
        def request(headers):
            return urllib.request.urlopen(urllib.request.Request(server.origin + '/api/state', headers=headers))
        try:
            with self.assertRaises(urllib.error.HTTPError): request({})
            with self.assertRaises(urllib.error.HTTPError): request({'Host': 'evil.example', 'X-TK2-Token': server.token})
            with request({'X-TK2-Token': server.token}) as response: self.assertEqual(json.load(response)['version'], 'test')
            req = urllib.request.Request(server.origin + '/api/settings', data=b'{}', headers={'X-TK2-Token': server.token, 'Origin': 'https://evil.example'})
            with self.assertRaises(urllib.error.HTTPError): urllib.request.urlopen(req)
        finally:
            server.shutdown(); server.server_close(); thread.join()
