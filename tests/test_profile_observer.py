from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from trackgroups.service import Service
from trackgroups.profile import Profile
from trackgroups.presets import apply
from test_presets import fixture


class ObserverTests(unittest.TestCase):
    def test_external_edit_and_partial_write_preserve_last_valid_snapshot(self):
        with tempfile.TemporaryDirectory() as directory, patch('trackgroups.service.PROFILE_DIR', Path(directory)), patch('trackgroups.preset_assets.local_packages', return_value=[]):
            service = Service.__new__(Service)
            service.profile, service.game, service.job = 'test', '', None
            service.previews = {'old':True}
            path = Path(directory) / 'test'
            path.write_bytes(fixture())
            service.load_local()
            before = service.local_hash
            raw, _ = apply(Profile(fixture()), {'mode':'duplicate', 'presetId':100})
            path.write_bytes(raw)
            with patch('trackgroups.service.time.monotonic', side_effect=[0, 1]):
                service.observe_profile()
                self.assertEqual(len(service.preset_state['presets']), 1)
                service.observe_profile()
            self.assertEqual(len(service.preset_state['presets']), 2)
            self.assertNotEqual(service.local_hash, before)
            self.assertEqual(service.previews, {})
            good_hash = service.local_hash
            path.write_bytes(b'partial')
            with patch('trackgroups.service.time.monotonic', side_effect=[2, 3]):
                service.observe_profile(); service.observe_profile()
            self.assertEqual(service.local_hash, good_hash)
            self.assertEqual(len(service.preset_state['presets']), 2)
            path.write_bytes(fixture())
            with patch('trackgroups.service.time.monotonic', side_effect=[4, 5]):
                service.observe_profile(); service.observe_profile()
            self.assertEqual(service.local_hash, before)
