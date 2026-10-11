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
            with patch.object(catalog, 'DATA', data), patch.object(catalog, 'fetch', return_value=b'{"version":2}'):
                with self.assertRaises(ValueError): catalog.refresh()
            self.assertEqual(cache.read_text(), 'original')


class InstallTests(unittest.TestCase):
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
