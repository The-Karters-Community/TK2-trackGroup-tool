import base64
import copy
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
import json
from unittest.mock import patch

from trackgroups import live_preview as preview
from trackgroups.app import make_server
from trackgroups.presets import view
from trackgroups.profile import Profile
from trackgroups.service import Service
from trackgroups.presets import apply
from test_presets import fixture


def request():
    return {'data': view(Profile(fixture()))['presets'][0]['data'], 'view': 'modded', 'rotation': 0}


class PreviewTests(unittest.TestCase):
    def test_rejects_private_fields_invalid_ids_and_unbounded_rotation(self):
        body = request()
        before = copy.deepcopy(body)
        self.assertEqual(preview.validate_request(body), {'operation': 'render', **body})
        self.assertEqual(body, before)
        for changed in ({**body, 'path': 'private'}, {**body, 'rotation': float('nan')},
                        {**body, 'rotation': 181}, {**body, 'rotation': True},
                        {**body, 'view': 'unknown'}, {**body, 'operation': 'save'}):
            with self.subTest(changed=changed):
                with self.assertRaises(ValueError): preview.validate_request(changed)
        body['data']['account'] = 123
        with self.assertRaises(ValueError): preview.validate_request(body)

    def test_live_save_is_single_preset_and_validates_profile_baseline(self):
        state = view(Profile(fixture()))
        preset = state['presets'][0]
        payload = {'operation':'save-preset', 'profile':'1009PTK_PlayerData_v19tpp0_bt0',
                   'presetId':preset['id'], 'baseline':preset, 'data':preset['data']}
        parsed = preview.validate_request(payload)
        self.assertEqual(parsed['operation'], 'save-preset')
        self.assertEqual(parsed['baseline'], preset['data'])
        for changed in ({**payload, 'profile':'../outside'}, {**payload, 'presetId':True},
                        {**payload, 'baseline':{'id':preset['id']+1,'data':preset['data']}},
                        {**payload, 'shell':'anything'}):
            with self.subTest(changed=changed):
                with self.assertRaises(ValueError): preview.validate_request(changed)

    def test_live_save_transport_accepts_only_matching_game_confirmation(self):
        state = view(Profile(fixture()))
        preset = state['presets'][0]
        payload = {'operation':'save-preset', 'profile':'1009PTK_PlayerData_v19tpp0_bt0',
                   'presetId':preset['id'], 'baseline':preset, 'data':preset['data']}
        with patch.object(preview.os, 'name', 'nt'), patch.object(preview, '_exchange', return_value={
                'ready':True,'operation':'save-preset','profile':payload['profile'],'presetId':payload['presetId']}) as exchange:
            result = preview.save_preset(payload)
            self.assertTrue(result['ready'])
            self.assertEqual(exchange.call_args.args[0]['baseline'], preset['data'])
        with patch.object(preview.os, 'name', 'nt'), patch.object(preview, '_exchange', return_value={
                'ready':True,'operation':'render','profile':payload['profile'],'presetId':payload['presetId']}):
            with self.assertRaisesRegex(ValueError, 'mismatched'):
                preview.save_preset(payload)

    def test_busy_offline_and_invalid_images_never_reach_save_apis(self):
        with patch.object(preview.os, 'name', 'nt'), patch.object(preview, '_exchange') as exchange:
            preview.busy.acquire()
            try: self.assertFalse(preview.render(request())['ready'])
            finally: preview.busy.release()
            exchange.assert_not_called()
            exchange.side_effect = OSError('Game closed')
            self.assertEqual(preview.render(request())['message'], 'Game closed')
            exchange.side_effect = None
            exchange.return_value = {'ready': True, 'png': base64.b64encode(b'bad image').decode()}
            with self.assertRaisesRegex(ValueError, 'image'): preview.render(request())
            self.assertFalse(preview.busy.locked())

    def test_install_remove_only_our_dll_and_require_game_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root/'BepInEx/core').mkdir(parents=True)
            (root/'BepInEx/core/BepInEx.Unity.IL2CPP.dll').write_bytes(b'fixture')
            other = root/'BepInEx/plugins/other.dll'
            other.parent.mkdir(); other.write_bytes(b'preserve')
            source = root/'compiled.dll'; source.write_bytes(b'owned source')
            with patch.object(preview, 'companion_source', return_value=source), patch.object(preview, 'game_running', return_value=True):
                with self.assertRaisesRegex(ValueError, 'Close'): preview.install(root)
                with self.assertRaisesRegex(ValueError, 'Close'): preview.remove(root)
            with patch.object(preview, 'companion_source', return_value=source), patch.object(preview, 'game_running', return_value=False):
                preview.install(root)
                self.assertEqual(preview.installation(root).read_bytes(), source.read_bytes())
                preview.remove(root)
                self.assertFalse(preview.installation(root).exists())
                self.assertEqual(other.read_bytes(), b'preserve')

    def test_preview_transport_requires_session_and_same_origin(self):
        server = make_server(object())
        thread = threading.Thread(target=server.serve_forever); thread.start()
        def post(headers):
            req = urllib.request.Request(server.origin+'/api/live-preview', data=b'{"operation":"status"}', headers=headers)
            return urllib.request.urlopen(req)
        try:
            with patch.object(preview, 'render', return_value={'ready':True}) as render:
                for headers in ({}, {'X-TK2-Token':server.token, 'Origin':'https://evil.example'}):
                    with self.assertRaises(urllib.error.HTTPError): post(headers)
                render.assert_not_called()
                with post({'X-TK2-Token':server.token}) as response:
                    self.assertTrue(json.load(response)['ready'])
                render.assert_called_once_with({'operation':'status'})
        finally:
            server.shutdown(); server.server_close(); thread.join()

    def test_live_save_uses_game_bridge_and_keeps_a_safety_copy(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            profiles = root / 'profiles'; profiles.mkdir()
            profile_name = '1009PTK_PlayerData_v19tpp0_bt0'
            path = profiles / profile_name
            original = fixture(); path.write_bytes(original)
            baseline = view(Profile(original))['presets'][0]
            data = copy.deepcopy(baseline['data'])
            data['iWheelMaterialID_Modded'] = 88
            change = {'mode':'preset', 'presetId': baseline['id'], 'data':data}
            service = Service.__new__(Service)
            service.profile = profile_name; service.account = 'steam-account'
            service.cloud_enabled = True; service.sync_error = ''
            service.job = None
            service.lock = threading.RLock(); service.supported_game = lambda: None
            service.load_local = lambda: None
            calls = []
            def game_save(request):
                calls.append(request)
                payload = preview.validate_request(request)
                self.assertEqual(payload['baseline'], baseline['data'])
                self.assertEqual(payload['data'], data)
                updated, _ = apply(Profile(path.read_bytes()), change)
                path.write_bytes(updated)
                return {'ready':True, 'operation':'save-preset', 'profile':profile_name, 'presetId':baseline['id']}
            from trackgroups import service as module
            with patch.object(module, 'PROFILE_DIR', profiles), patch.object(module, 'DATA', root / 'data'), \
                 patch.object(module, 'game_running', return_value=True), patch.object(preview, 'save_preset', side_effect=game_save):
                outcome = service.save_live_preset({'profile':profile_name, 'baseline':baseline, 'change':change})
            self.assertIn('verified', outcome['message'])
            self.assertEqual(len(calls), 1)
            self.assertEqual(calls[0]['baseline'], baseline)
            self.assertEqual(Path(outcome['backup']).read_bytes(), original)
            self.assertEqual(view(Profile(path.read_bytes()))['presets'][0]['data'], data)
