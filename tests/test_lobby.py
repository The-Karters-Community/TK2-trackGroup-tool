import copy
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from trackgroups.profile import Profile
from trackgroups.presets import view, serialize
from trackgroups.service import Service
from trackgroups.transaction import digest
from test_presets import fixture


class LobbyTests(unittest.TestCase):
    def service(self):
        s = Service.__new__(Service)
        s.lock = threading.RLock()
        s.profile = "1009PTK_PlayerData_v19tpp0_bt0"
        s.game = "game"
        s.account = "account"
        s.cloud_enabled = True
        s.sync_error = ""
        s.job = None
        s.supported_game = lambda: None
        s.load_local = lambda: None
        return s

    def entry(self):
        data = copy.deepcopy(view(Profile(fixture()))["presets"][0]["data"])
        data["iWheelMaterialID_Modded"] = 987
        return {
            "player": 4,
            "id": 999,
            "data": data,
            "name": "Racer",
            "identity": "private-network-identity",
            "local": False,
            "ai": False,
        }

    def test_main_menu_and_offline_do_not_invent_players(self):
        s = self.service()
        with patch("trackgroups.service.game_running", return_value=False), patch(
            "trackgroups.native_quick.request"
        ) as native:
            self.assertEqual(s.lobby_state()["players"], [])
            native.assert_not_called()
        with patch("trackgroups.service.game_running", return_value=True), patch(
            "trackgroups.native_quick.available", return_value=True
        ), patch(
            "trackgroups.native_quick.request",
            return_value={"inLobby": False, "players": []},
        ):
            self.assertEqual(s.lobby_state()["status"], "not-in-lobby")

    def test_native_identity_stays_private_and_keys_survive_unchanged_refresh(self):
        s = self.service()
        entry = self.entry()
        with patch("trackgroups.service.game_running", return_value=True), patch(
            "trackgroups.native_quick.available", return_value=True
        ), patch(
            "trackgroups.native_quick.request",
            return_value={"inLobby": True, "players": [entry]},
        ):
            first = s.lobby_state()
            self.assertNotIn(entry["identity"], json.dumps(first))
            self.assertNotIn("identity", first["players"][0])
            s._lobby_cache["time"] -= 3
            self.assertEqual(
                s.lobby_state()["players"][0]["key"], first["players"][0]["key"]
            )

    def test_expired_or_local_selection_cannot_write(self):
        s = self.service()
        s._lobby_cache = {
            "time": time.monotonic() - 31,
            "profile": s.profile,
            "private": {"key": self.entry()},
        }
        with patch("trackgroups.service.game_running", return_value=True), patch(
            "trackgroups.native_quick.request"
        ) as native:
            with self.assertRaisesRegex(ValueError, "expired"):
                s.copy_lobby_preset({"key": "key"})
            s._lobby_cache["time"] = time.monotonic()
            s._lobby_cache["private"]["key"]["local"] = True
            with self.assertRaises(ValueError):
                s.copy_lobby_preset({"key": "key"})
            native.assert_not_called()

    def test_copy_uses_game_allocation_and_verifies_local_and_steam_preserving_library(
        self,
    ):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            s = self.service()
            entry = self.entry()
            path = root / s.profile
            original = fixture()
            path.write_bytes(original)
            previous = view(Profile(original))
            s._lobby_cache = {
                "time": time.monotonic(),
                "profile": s.profile,
                "private": {"key": entry},
            }

            def remote(action, body, **kwargs):
                return {
                    "account": s.account,
                    "cloudEnabled": True,
                    "saveHash": digest(path.read_bytes()),
                }

            def native(game, profile, preset_id, player, baseline, desired, **kwargs):
                self.assertEqual(
                    kwargs, {"operation": 3, "identity": entry["identity"]}
                )
                self.assertEqual(baseline, entry["data"])
                self.assertIsNone(desired)
                current = Profile(path.read_bytes())
                presets = json.loads(current.records[0])
                presets.append({"iPresetID": 12345, **baseline})
                path.write_bytes(serialize(current, presets, current.data))
                return {"saved": True, "presetId": 12345}

            with patch("trackgroups.service.PROFILE_DIR", root), patch(
                "trackgroups.service.DATA", root / "data"
            ), patch("trackgroups.service.game_running", return_value=True), patch(
                "trackgroups.service.Worker"
            ) as worker, patch(
                "trackgroups.native_quick.request", side_effect=native
            ):
                worker.return_value.request.side_effect = remote
                result = s.copy_lobby_preset({"key": "key"})
            self.assertFalse(s.quick_saving)
            self.assertEqual(result["presetId"], 12345)
            self.assertEqual(Path(result["backup"]).read_bytes(), original)
            now = view(Profile(path.read_bytes()))
            self.assertEqual(now["presets"][:-1], previous["presets"])
            self.assertEqual(now["groups"], previous["groups"])
            self.assertEqual(now["presets"][-1]["data"], entry["data"])

    def test_cloud_conflict_blocks_native_copy(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            s = self.service()
            path = root / s.profile
            path.write_bytes(fixture())
            s._lobby_cache = {
                "time": time.monotonic(),
                "profile": s.profile,
                "private": {"key": self.entry()},
            }
            with patch("trackgroups.service.PROFILE_DIR", root), patch(
                "trackgroups.service.DATA", root / "data"
            ), patch("trackgroups.service.game_running", return_value=True), patch(
                "trackgroups.service.Worker"
            ) as worker, patch(
                "trackgroups.native_quick.request"
            ) as native:
                worker.return_value.request.return_value = {
                    "account": s.account,
                    "cloudEnabled": True,
                    "saveHash": "wrong",
                }
                with self.assertRaisesRegex(ValueError, "disagree"):
                    s.copy_lobby_preset({"key": "key"})
                native.assert_not_called()
                self.assertEqual(path.read_bytes(), fixture())
                self.assertFalse(s.quick_saving)
