import json
from pathlib import Path
import tempfile
import threading
import urllib.request
import urllib.error
import unittest
from unittest.mock import patch

from trackgroups.appearance import Appearance, clean_name, mod_variants, model_prefab

PNG = b"\x89PNG\r\n\x1a\nfixture"


class AppearanceTests(unittest.TestCase):
    def test_model_prefab_requires_exact_variant_and_rejects_ambiguous_paths(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            prefab = 'Assets/Workshop_Content/Vehicles/Test Car/Color Variations/Blue/Vehicle Variant.prefab'
            (root / 'catalog_config.json').write_text(json.dumps({'m_InternalIds':[prefab]}))
            self.assertEqual(model_prefab(root, 'vehicles', ['Test Car', 'Blue']), prefab)
            self.assertIsNone(model_prefab(root, 'vehicles', ['Test Car', 'Red']))
            (root / 'catalog_config.json').write_text(json.dumps({'m_InternalIds':[prefab, prefab.replace('Vehicle Variant', 'Other Variant')]}))
            self.assertIsNone(model_prefab(root, 'vehicles', ['Test Car', 'Blue']))

    def test_live_render_cache_matches_exact_unsaved_data_without_touching_game_icons(self):
        from test_presets import fixture
        from trackgroups.presets import view
        from trackgroups.profile import Profile
        import copy
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            icons = root/'profiles/PresetIcons'; icons.mkdir(parents=True)
            game_icon = icons/'Icon_PresetID_100_Modded.png'; game_icon.write_bytes(PNG+b'original')
            art = Appearance(root/'cache', root/'profiles')
            preset = view(Profile(fixture()))['presets'][0]
            draft = copy.deepcopy(preset); draft['data']['iVehicleMaterialID_Modded'] = 88
            art.cache_render({'data':draft['data'], 'view':'modded'}, PNG+b'new')
            old = art.snapshot([preset])['previews']['100']['modded']
            self.assertIn('Icon_PresetID_', old)
            updated = art.snapshot([draft])['previews']['100']['modded']
            self.assertIn('live-', updated)
            key = updated.split('/')[-1].split('?')[0]
            self.assertEqual(art.image(key), PNG+b'new')
            self.assertEqual(game_icon.read_bytes(), PNG+b'original')
            art.cache_render({'data':draft['data'], 'view':'modded', 'rotation':60}, PNG+b'rotated')
            self.assertEqual(art.image(key), PNG+b'new')
            reopened = Appearance(root/'cache', root/'profiles')
            self.assertIn('live-', reopened.snapshot([draft])['previews']['100']['modded'])

    def test_preview_http_requires_token_and_rejects_traversal(self):
        from trackgroups.app import make_server

        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            art = Appearance(root / "cache", root / "profiles")
            file = art.folder / ("a" * 64 + ".png")
            file.write_bytes(PNG)

            class Service:
                appearance = art

            server = make_server(Service())
            thread = threading.Thread(target=server.serve_forever)
            thread.start()

            def request(name, headers={}):
                return urllib.request.urlopen(
                    urllib.request.Request(
                        server.origin + "/api/preset-image/" + name, headers=headers
                    )
                )

            try:
                with self.assertRaises(urllib.error.HTTPError) as error:
                    request(file.name)
                self.assertEqual(error.exception.code, 403)
                with request(file.name, {"X-TK2-Token": server.token}) as response:
                    self.assertEqual(response.headers["Content-Type"], "image/png")
                    self.assertEqual(response.read(), PNG)
                with self.assertRaises(urllib.error.HTTPError) as error:
                    request("%2e%2e/index.json", {"X-TK2-Token": server.token})
                self.assertEqual(error.exception.code, 404)
            finally:
                server.shutdown()
                server.server_close()
                thread.join()

    def test_variant_labels_use_exact_id_and_never_export_private_fields(self):
        data = {
            "characters": [
                {
                    "strCharacterDirName": "ShadowBase",
                    "inGameCharacterInfo": {"m_PathID": 99},
                    "outfits": [
                        {
                            "strOutfitDirName": "DarkOutfit",
                            "materialVariants": [
                                {
                                    "strOutfitMaterialDirName": "RedEyes",
                                    "iGeneratedTargetUniqueConfigID": -12,
                                }
                            ],
                        }
                    ],
                }
            ],
            "strUploadHashedKey": "private",
            "ModAuthor": "private",
        }
        result = list(mod_variants(data, {99: "Mephiles"}))
        self.assertEqual(result[0][0], "characters")
        self.assertEqual(result[0][1]["iGeneratedTargetUniqueConfigID"], -12)
        self.assertEqual(result[0][2], ["Mephiles", "DarkOutfit", "RedEyes"])
        self.assertNotIn("private", str(result))
        self.assertEqual(
            clean_name("NewMephiles_TwilightRed"), "New Mephiles Twilight Red"
        )

    def test_saved_render_is_marked_stale_after_material_changes(self):
        from test_presets import fixture
        from trackgroups.presets import view
        from trackgroups.profile import Profile
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            icons = root / 'profile/PresetIcons'
            icons.mkdir(parents=True)
            (icons / 'Icon_PresetID_100.hash').write_text('1_2_3_-2147483648_2_3_123', encoding='utf-8')
            art = Appearance(root / 'cache', root / 'profile')
            presets = view(Profile(fixture()))['presets']
            self.assertEqual(art.snapshot(presets)['stalePreviews'], [])
            presets[0]['data']['iWheelMaterialID_Modded'] = 88
            self.assertEqual(art.snapshot(presets)['stalePreviews'], [100])

    def test_preview_keys_are_bounded_and_contained(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            images = root / "profile/PresetIcons"
            images.mkdir(parents=True)
            file = images / "Icon_PresetID_100_Modded.png"
            file.write_bytes(PNG)
            art = Appearance(root / "cache", root / "profile")
            state = art.snapshot([{"id": 100}])
            self.assertIn("modded", state["previews"]["100"])
            self.assertEqual(art.image(file.name), PNG)
            for key in (
                "../../secret.png",
                "index.json",
                "Icon_PresetID_100_Modded.png/../secret",
            ):
                with self.assertRaises(ValueError):
                    art.image(key)
            file.write_bytes(b"not png")
            with self.assertRaises(ValueError):
                art.image(file.name)

    def test_small_matching_cache_avoids_bundle_loading(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            art = Appearance(root / "cache", root / "profile")
            import hashlib

            signature = hashlib.sha256(b"[]").hexdigest()
            items = {
                "characters": {
                    "1": {
                        "name": "Bobby",
                        "label": "Bobby",
                        "source": "official",
                        "image": "",
                    }
                },
                "vehicles": {},
                "wheels": {},
                "stickers": {},
            }
            (art.folder / "index.json").write_text(
                json.dumps({"version": 11, "signature": signature, "items": items, "modelRefs": {}})
            )
            with patch.object(art, "sources", return_value=[]):
                art._build("fake-game")
            self.assertEqual(art.snapshot([])["items"], items)
            self.assertFalse(art.loading)
            self.assertEqual(art.warning, "")

    def test_sources_read_only_cosmetic_packages_and_skip_escape(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            game = root / "steamapps/common/Game"
            mod = game / "Mods/Test/StandaloneWindows64"
            mod.mkdir(parents=True)
            (mod / "catalog_config.json").write_text(
                json.dumps(
                    {
                        "m_InternalIds": [
                            "Assets/Workshop_Content/Characters/Test/Variant.prefab"
                        ]
                    }
                )
            )
            (mod / "config.bundle").write_bytes(b"fake")
            (mod.parent / "UploadPasswordNotShared.txt").write_text("private")
            art = Appearance(root / "cache", root / "profiles")
            self.assertEqual(art.sources(game), [(mod / "config.bundle", "Test")])
            (mod / "catalog_config.json").write_text(
                json.dumps(
                    {
                        "m_InternalIds": [
                            "Assets/Workshop_Content/Tracks/Test/Track.unity"
                        ]
                    }
                )
            )
            self.assertEqual(art.sources(game), [])
