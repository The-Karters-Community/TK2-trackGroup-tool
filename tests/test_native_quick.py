import copy
import ctypes
import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from trackgroups.native_quick import Cosmetic, Request, available, exchange, _select_game_thread
from trackgroups.profile import Profile
from trackgroups.presets import view, apply
from trackgroups.service import Service
from test_presets import fixture


class NativeQuickTests(unittest.TestCase):
    def test_game_thread_ignores_auxiliary_windows_on_other_threads(self):
        executable = Path('installed-game/TheKarters2.exe').resolve()
        windows = [
            {'pid': 10, 'thread': 11, 'class': 'UnityWndClass', 'path': executable},
            {'pid': 10, 'thread': 12, 'class': 'IME', 'path': executable},
            {'pid': 10, 'thread': 13, 'class': 'SteamOverlay', 'path': executable},
            {'pid': 10, 'thread': 14, 'class': 'ConsoleWindowClass', 'path': executable},
        ]
        self.assertEqual(_select_game_thread(windows, executable), (10, 11))
        self.assertEqual(_select_game_thread(list(reversed(windows)), executable), (10, 11))

    def test_game_thread_keeps_minimized_unfocused_player_and_secondary_windows(self):
        executable = Path('installed-game/TheKarters2.exe').resolve()
        windows = [
            {'pid': 10, 'thread': 11, 'class': 'UnityWndClass', 'path': executable,
             'minimized': True, 'visible': False, 'foreground': False},
            {'pid': 10, 'thread': 11, 'class': 'UnityWndClass', 'path': executable},
        ]
        self.assertEqual(_select_game_thread(windows, executable), (10, 11))

    def test_game_thread_never_targets_a_different_installation(self):
        executable = Path('installed-game/TheKarters2.exe').resolve()
        other = Path('other-installation/TheKarters2.exe').resolve()
        window = {'pid': 20, 'thread': 21, 'class': 'UnityWndClass', 'path': other}
        with self.assertRaisesRegex(ValueError, 'Check the game folder in Settings'):
            _select_game_thread([window], executable)
        with self.assertRaisesRegex(ValueError, 'same administrator setting'):
            _select_game_thread([], executable)

    def test_game_thread_rejects_multiple_players_instead_of_picking_first(self):
        executable = Path('installed-game/TheKarters2.exe').resolve()
        for pid in (10, 20):
            windows = [
                {'pid': 10, 'thread': 11, 'class': 'UnityWndClass', 'path': executable},
                {'pid': pid, 'thread': 21, 'class': 'UnityWndClass', 'path': executable},
            ]
            with self.assertRaisesRegex(ValueError, 'More than one Unity game window'):
                _select_game_thread(windows, executable)

    def test_game_thread_does_not_hook_auxiliary_thread_when_player_is_not_ready(self):
        executable = Path('installed-game/TheKarters2.exe').resolve()
        with self.assertRaisesRegex(ValueError, 'Unity game window is not ready'):
            _select_game_thread([{'pid': 10, 'thread': 12, 'class': 'IME', 'path': executable}], executable)

    def test_cosmetic_protocol_roundtrip_preserves_signed_ids_and_stickers(self):
        data = view(Profile(fixture()))["presets"][0]["data"]
        self.assertEqual(Cosmetic.encode(data).decode(), data)
        self.assertEqual(ctypes.sizeof(Cosmetic), 345)
        if os.name == "nt":
            self.assertEqual(ctypes.sizeof(Request), 28391)
        invalid = copy.deepcopy(data)
        invalid["iVehicleMaterialID"] = True
        with self.assertRaises(ValueError):
            Cosmetic.encode(invalid)

    def test_unavailable_for_a_missing_runtime(self):
        with tempfile.TemporaryDirectory() as folder:
            self.assertFalse(available(folder))

    def test_retention_rejects_ambiguous_workshop_targets_before_entering_game(self):
        with patch("trackgroups.native_quick.available", return_value=True):
            for payload in (None, {}, {"workshopId": 42}, {"workshopId": "-1"},
                            {"workshopId": "0"}, {"workshopId": "１２"},
                            {"workshopId": str(2**63)}, {"workshopId": "42", "all": True}):
                with self.subTest(payload=payload), self.assertRaisesRegex(ValueError, "exact Steam Workshop"):
                    exchange("game", "profile", operation=7, payload=payload)

    def test_cpu_change_requires_fresh_target_and_cosmetics(self):
        with patch("trackgroups.native_quick.available", return_value=True):
            with self.assertRaisesRegex(ValueError, "exact current identity"):
                exchange("game", "profile", operation=8)

    def test_live_quick_service_uses_native_bridge_and_verifies_both_copies(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            name = "1009PTK_PlayerData_v19tpp0_bt0"
            profiles = root / "profiles"
            profiles.mkdir()
            path = profiles / name
            path.write_bytes(fixture())
            before = Profile(path.read_bytes())
            data = view(before)
            # Test fixture's old single-player Quick Setup is intentionally incomplete;
            # install a complete native slot for this transaction test.
            before.data["QuickCreationPresets"] = [
                {
                    "BQuickPresetInitialized": True,
                    "QuickPreset": {"iPresetID": 338088, **data["presets"][0]["data"]},
                }
            ]
            path.write_bytes(before.serialize(before.data))
            original = path.read_bytes()
            baseline = view(Profile(original))["quickSetup"]
            target = copy.deepcopy(baseline["data"])
            target["iWheelMaterialID_Modded"] = 88
            s = Service.__new__(Service)
            s.lock = threading.RLock()
            s.profile = name
            s.account = "test-account"
            s.game = "test-game"
            s.job = None
            s.cloud_enabled = True
            s.sync_error = ""
            s.supported_game = lambda: None
            s.load_local = lambda: None
            change = {"mode": "quick", "player": 0, "presetId": 338088, "data": target}
            from trackgroups.transaction import digest

            def remote(action, payload, **kwargs):
                return {
                    "account": s.account,
                    "cloudEnabled": True,
                    "saveHash": digest(path.read_bytes()),
                }

            def native(game, profile, preset_id, player, old, desired):
                self.assertEqual(old, baseline["data"])
                self.assertEqual(desired, target)
                updated, _ = apply(Profile(path.read_bytes()), change)
                path.write_bytes(updated)
                return {"ready": True, "saved": True, "menuRefreshed": True}

            with patch("trackgroups.service.PROFILE_DIR", profiles), patch(
                "trackgroups.service.DATA", root / "data"
            ), patch("trackgroups.service.game_running", return_value=True), patch(
                "trackgroups.service.Worker"
            ) as worker, patch(
                "trackgroups.native_quick.request", side_effect=native
            ):
                worker.return_value.request.side_effect = remote
                result = s.save_live_quick(
                    {"profile": name, "change": change, "baseline": baseline}
                )
            self.assertTrue(result["menuRefreshed"])
            self.assertFalse(s.quick_saving)
            self.assertEqual(Path(result["backup"]).read_bytes(), original)
            self.assertEqual(
                view(Profile(path.read_bytes()))["presets"], data["presets"]
            )
