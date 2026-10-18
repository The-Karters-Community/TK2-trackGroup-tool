import base64
import copy
from io import BytesIO
from pathlib import Path
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from PIL import Image
from trackgroups.setup_pictures import picture
from trackgroups.presets import view
from trackgroups.profile import Profile
from test_presets import fixture


class SetupPicturesTests(unittest.TestCase):
    def test_cached_png_survives_a_new_cache_instance_and_invalidates_changed_assets_or_cosmetics(self):
        with tempfile.TemporaryDirectory() as temp:
            appearance = SimpleNamespace(folder=Path(temp), lock=threading.Lock(), revision='assets-one')
            body = {'revision':appearance.revision, 'data':view(Profile(fixture()))['presets'][0]['data']}
            image = BytesIO(); Image.new('RGBA', (8,8), (20,40,60,255)).save(image, 'PNG')
            url = 'data:image/png;base64,' + base64.b64encode(image.getvalue()).decode()
            self.assertIsNone(picture(appearance, body)['image'])
            self.assertTrue(picture(appearance, {**body, 'image':url})['saved'])
            reloaded = SimpleNamespace(**vars(appearance))
            self.assertEqual(picture(reloaded, body)['image'], url)
            changed = copy.deepcopy(body); changed['data']['iVehicleMaterialID'] += 1
            self.assertIsNone(picture(reloaded, changed)['image'])
            reloaded.revision = 'assets-two'
            self.assertIsNone(picture(reloaded, body)['image'])
            self.assertIsNone(picture(reloaded, {**body, 'revision':'assets-two'})['image'])
            self.assertEqual(len(list((Path(temp)/'setup-pictures').glob('*.png'))), 1)

    def test_rejects_non_png_and_prunes_a_bounded_cache(self):
        with tempfile.TemporaryDirectory() as temp:
            a = SimpleNamespace(folder=Path(temp), lock=threading.Lock(), revision='assets')
            body = {'revision':'assets', 'data':view(Profile(fixture()))['presets'][0]['data']}
            with self.assertRaises(ValueError): picture(a, {**body, 'image':'data:image/png;base64,bm90IGEgcG5n'})
            buf = BytesIO(); Image.new('RGBA', (8,8)).save(buf, 'PNG')
            image = 'data:image/png;base64,'+base64.b64encode(buf.getvalue()).decode()
            with patch('trackgroups.setup_pictures.LIMIT', len(buf.getvalue())+1):
                picture(a, {**body, 'image':image})
                changed = copy.deepcopy(body); changed['data']['iVehicleMaterialID'] += 1
                picture(a, {**changed, 'image':image})
            self.assertEqual(len(list((Path(temp)/'setup-pictures').glob('*.png'))), 1)
            self.assertIsNone(picture(a, body)['image'])
