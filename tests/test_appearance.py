import json
from pathlib import Path
import tempfile
import threading
import urllib.request
import urllib.error
import unittest
from unittest.mock import patch

from trackgroups.appearance import Appearance, INDEX_VERSION, clean_name, mod_variants, model_prefab, package_origin

PNG = b"\x89PNG\r\n\x1a\nfixture"


class AppearanceTests(unittest.TestCase):
    def test_workshop_provenance_comes_from_installed_steam_path_not_numeric_local_name(self):
        root = Path('installed-library').resolve()
        game = root/'steamapps/common/Game'
        self.assertEqual(package_origin(game, root/'steamapps/workshop/content/2269950/12345/config.bundle'),
                         {'workshopId':'12345', 'localOnly':False})
        self.assertEqual(package_origin(game, game/'Mods/12345/config.bundle'), {'localOnly':True})
        self.assertEqual(package_origin(game, root/'steamapps/workshop/content/2269950/not-an-id/config.bundle'), {'localOnly':True})
    def test_model_prefab_requires_exact_variant_and_rejects_ambiguous_paths(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            prefab = 'Assets/Workshop_Content/Vehicles/Test Car/Color Variations/Blue/Vehicle Variant.prefab'
            (root / 'catalog_config.json').write_text(json.dumps({'m_InternalIds':[prefab]}))
            self.assertEqual(model_prefab(root, 'vehicles', ['Test Car', 'Blue']), prefab)
            self.assertIsNone(model_prefab(root, 'vehicles', ['Test Car', 'Red']))
            (root / 'catalog_config.json').write_text(json.dumps({'m_InternalIds':[prefab, prefab.replace('Vehicle Variant', 'Other Variant')]}))
            self.assertIsNone(model_prefab(root, 'vehicles', ['Test Car', 'Blue']))

    def test_saved_preview_uses_game_icon_and_refreshes_when_game_rewrites_it(self):
        from test_presets import fixture
        from trackgroups.presets import view
        from trackgroups.profile import Profile
        import copy
        import hashlib
        import os
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            icons = root/'profiles/PresetIcons'; icons.mkdir(parents=True)
            game_icon = icons/'Icon_PresetID_100_Modded.png'; game_icon.write_bytes(PNG+b'original')
            art = Appearance(root/'cache', root/'profiles')
            preset = view(Profile(fixture()))['presets'][0]
            draft = copy.deepcopy(preset); draft['data']['iVehicleMaterialID_Modded'] = 88
            # A frame cached by an older companion must never replace the
            # genuine saved game image or make a mismatched hash look fresh.
            payload = json.dumps([draft['data'], 'modded'], sort_keys=True, separators=(',', ':'))
            legacy = art.folder / ('live-' + hashlib.sha256(payload.encode()).hexdigest() + '.png')
            legacy.write_bytes(PNG+b'old companion frame')
            fields = ('iCharacterSkinMaterialID', 'iVehicleMaterialID', 'iWheelMaterialID',
                      'iCharacterSkinMaterialID_Modded', 'iVehicleMaterialID_Modded', 'iWheelMaterialID_Modded')
            marker = icons/'Icon_PresetID_100.hash'
            marker.write_text('_'.join(str(preset['data'][key]) for key in fields), encoding='utf-8')
            state = art.snapshot([preset])
            before = state['previews']['100']['modded']
            self.assertIn('Icon_PresetID_100_Modded.png?v=', before)
            self.assertEqual(state['stalePreviews'], [])
            unsaved = art.snapshot([draft])
            self.assertEqual(unsaved['previews']['100']['modded'], before)
            self.assertEqual(unsaved['stalePreviews'], [100])
            self.assertEqual(unsaved['staleViews'], {'100': ['modded']})
            self.assertEqual(art.image(game_icon.name), PNG+b'original')
            with self.assertRaises(ValueError):
                art.image(legacy.name)

            previous_mtime = game_icon.stat().st_mtime_ns
            game_icon.write_bytes(PNG+b'new game image')
            os.utime(game_icon, ns=(previous_mtime + 1_000_000_000, previous_mtime + 1_000_000_000))
            marker.write_text('_'.join(str(draft['data'][key]) for key in fields), encoding='utf-8')
            refreshed = art.snapshot([draft])
            self.assertNotEqual(refreshed['previews']['100']['modded'], before)
            self.assertEqual(refreshed['stalePreviews'], [])
            self.assertEqual(art.image(game_icon.name), PNG+b'new game image')
            reopened = Appearance(root/'cache', root/'profiles')
            self.assertEqual(reopened.snapshot([draft])['previews'], refreshed['previews'])
            self.assertEqual(legacy.read_bytes(), PNG+b'old companion frame')

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
                json.dumps({"version": INDEX_VERSION, "signature": signature, "items": items, "modelRefs": {}})
            )
            with patch.object(art, "sources", return_value=[]):
                art._build("fake-game")
            self.assertEqual(art.snapshot([])["items"], items)
            self.assertFalse(art.loading)
            self.assertEqual(art.warning, "")

    def test_existing_bundle_write_triggers_refresh_without_catalog_or_directory_change(self):
        import os
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            game = root/'steamapps/common/Game'
            package = game/'Mods/Character/StandaloneWindows64'
            package.mkdir(parents=True)
            bundle = package/'existing.bundle'
            bundle.write_bytes(b'downloading')
            art = Appearance(root/'cache', root/'profile')
            with patch.object(art, 'refresh') as refresh, patch('trackgroups.appearance.time.monotonic', side_effect=[100,103]):
                art.observe(game)
                self.assertEqual(refresh.call_count, 1)
                before = package.stat()
                old = bundle.stat()
                bundle.write_bytes(b'complete bundle')
                os.utime(bundle, ns=(old.st_atime_ns, old.st_mtime_ns+1_000_000_000))
                os.utime(package, ns=(before.st_atime_ns, before.st_mtime_ns))
                art.observe(game)
                self.assertEqual(refresh.call_count, 2)

    def test_failed_package_is_retried_and_never_becomes_a_successful_cached_index(self):
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            file = root/'config.bundle'; file.write_bytes(b'fixture')
            art = Appearance(root/'cache', root/'profile')
            with patch.object(art, 'sources', return_value=[(file, 'custom')]), patch('UnityPy.load', side_effect=OSError('Download in progress')):
                art._build('game')
            partial = json.loads((art.folder/'index.json').read_text(encoding='utf8'))
            self.assertTrue(partial['previewError'])
            self.assertEqual(art.signature, '')
            self.assertIsNotNone(art._retry_at)
            previous_revision = art.snapshot([])['revision']
            tree = {'pixelSerializedData': {'eConfigTypeSerialized': 9},
                    'iMainScriptableObjectConfigIDUnique':1, 'DisplayName':'Recovered character'}
            recovered = SimpleNamespace(type=SimpleNamespace(name='MonoBehaviour'), path_id=1,
                                        read_typetree=lambda:tree)
            with patch.object(art, 'sources', return_value=[(file, 'official')]), patch('UnityPy.load', return_value=SimpleNamespace(objects=[recovered])) as load:
                art._build('game')
                load.assert_called_once()
            self.assertTrue(art.signature)
            self.assertNotEqual(previous_revision, art.snapshot([])['revision'])
            self.assertIn('1', art.items['characters'])
            self.assertIsNone(art._retry_at)
            self.assertEqual(art.warning, '')

    def test_same_game_refresh_queued_during_build_is_not_dropped(self):
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            file = root/'config.bundle'; file.write_bytes(b'fixture')
            art = Appearance(root/'cache', root/'profile')
            art.requested_game = 'same-game'
            def downloading(_):
                art._requested_generation += 1
                return SimpleNamespace(objects=[])
            with patch.object(art, 'sources', return_value=[(file, 'custom')]), patch('UnityPy.load', side_effect=downloading), patch.object(art, 'refresh') as refresh:
                art._build('same-game')
                refresh.assert_called_once_with('same-game')

    def test_model_dependency_write_invalidates_index_even_when_config_source_unchanged(self):
        from types import SimpleNamespace
        import os
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            config = root/'config.bundle'; config.write_bytes(b'config')
            model = root/'large-model.bundle'; model.write_bytes(b'incomplete model')
            art = Appearance(root/'cache', root/'profile')
            with patch.object(art, 'sources', return_value=[(config, 'custom')]), patch('UnityPy.load', return_value=SimpleNamespace(objects=[])) as load:
                art._build('game')
                initial = art.signature
                before = model.stat()
                model.write_bytes(b'complete downloaded model')
                os.utime(model, ns=(before.st_atime_ns, before.st_mtime_ns+1_000_000_000))
                art._build('game')
                self.assertEqual(load.call_count, 2)
                self.assertNotEqual(initial, art.signature)

    def test_missing_cached_thumbnail_rebuilds_instead_of_serving_stale_index(self):
        from types import SimpleNamespace
        import hashlib
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            art = Appearance(root/'cache', root/'profile')
            missing = '/api/preset-image/'+'a'*64+'.png'
            saved = {'version': INDEX_VERSION, 'signature': hashlib.sha256(b'[]').hexdigest(),
                     'items': {'characters': {'1': {'image':missing}}}, 'modelRefs': {}}
            (art.folder/'index.json').write_text(json.dumps(saved), encoding='utf8')
            with patch.object(art, 'sources', return_value=[]):
                art._build('game')
            self.assertEqual(art.items['characters'], {})
            self.assertEqual(art.warning, '')

    def test_saved_image_revision_observes_late_png_and_hash_writes_without_profile_change(self):
        from test_presets import fixture
        from trackgroups.presets import view
        from trackgroups.profile import Profile
        import os
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            icons = root/'profile/PresetIcons'; icons.mkdir(parents=True)
            art = Appearance(root/'cache', root/'profile')
            presets = view(Profile(fixture()))['presets']
            empty = art.snapshot(presets)
            icon = icons/'Icon_PresetID_100_Modded.png'
            icon.write_bytes(PNG)
            populated = art.snapshot(presets)
            self.assertNotEqual(empty['previewRevision'], populated['previewRevision'])
            self.assertEqual(art.image(icon.name), PNG)
            # Size also changes the URL when a copier preserves file timestamps.
            info = icon.stat()
            icon.write_bytes(PNG+b'updated')
            os.utime(icon, ns=(info.st_atime_ns, info.st_mtime_ns))
            updated = art.snapshot(presets)
            self.assertNotEqual(populated['previews'], updated['previews'])
            self.assertNotEqual(populated['previewRevision'], updated['previewRevision'])
            (icons/'Icon_PresetID_100.hash').write_text('0_2_3_-2147483648_2_3', encoding='utf8')
            mismatch = art.snapshot(presets)
            self.assertNotEqual(updated['previewRevision'], mismatch['previewRevision'])
            self.assertEqual(mismatch['staleViews'], {'100':['original']})

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
