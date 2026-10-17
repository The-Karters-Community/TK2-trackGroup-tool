import copy
import ctypes
import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from trackgroups.native_quick import Cosmetic, Request, available
from trackgroups.profile import Profile
from trackgroups.presets import view, apply
from trackgroups.service import Service
from test_presets import fixture


class NativeQuickTests(unittest.TestCase):
    def test_cosmetic_protocol_roundtrip_preserves_signed_ids_and_stickers(self):
        data = view(Profile(fixture()))["presets"][0]["data"]
        self.assertEqual(Cosmetic.encode(data).decode(), data)
        self.assertEqual(ctypes.sizeof(Cosmetic), 345)
        if os.name == "nt":
            self.assertEqual(ctypes.sizeof(Request), 28379)
        invalid = copy.deepcopy(data)
        invalid["iVehicleMaterialID"] = True
        with self.assertRaises(ValueError):
            Cosmetic.encode(invalid)

    def test_unavailable_for_an_unverified_game(self):
        with tempfile.TemporaryDirectory() as folder:
            self.assertFalse(available(folder))

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
