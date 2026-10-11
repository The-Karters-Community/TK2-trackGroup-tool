"""Desktop application state and import previews. Steam work runs outside request handlers."""
import base64
import copy
import json
from pathlib import Path
import threading
import time
import uuid

from . import VERSION
from . import catalog
from .groups import export_native, native_items
from .profile import Profile, SAVE_NAME
from .runtime import DATA, PROFILE_DIR, Worker, discover_games, game_running, write_json
from .transaction import digest


class Service:
    def __init__(self):
        self.lock = threading.RLock()
        try: self.preferences = json.loads((DATA / "preferences.json").read_text(encoding="utf-8"))
        except (OSError, ValueError): self.preferences = {}
        games = discover_games()
        self.game = self.preferences.get("game", games[0] if games else "")
        self.profiles = sorted(p.name for p in PROFILE_DIR.glob("*PTK_PlayerData_v19tpp0_bt0") if SAVE_NAME.fullmatch(p.name))
        selected = self.preferences.get("profile", "")
        self.profile = selected if selected in self.profiles else self.profiles[0] if len(self.profiles) == 1 else ""
        self.groups = catalog.load()
        self.items = {}
        self.track_status = {}
        self.account = ""
        self.cloud_enabled = False
        self.sync_error = "Connect Steam to verify your profile before importing."
        self.job = None
        self.cancel = threading.Event()
        self.previews = {}
        self.local_groups = []
        self.load_local()

    def load_local(self):
        if not self.profile: self.local_groups = []; return
        try: self.local_groups = Profile((PROFILE_DIR / self.profile).read_bytes()).custom_groups()
        except (OSError, ValueError, KeyError, TypeError) as exc:
            self.local_groups = []
            self.sync_error = "Could not read this profile: " + str(exc)

    def supported_game(self):
        p = Path(self.game)
        info = p / "build-info.txt"
        if not info.is_file() or "Version: 0.1.4.18\n" not in info.read_text(encoding="utf-8").replace("\r\n", "\n"):
            raise ValueError("This tool currently supports game build 0.1.4.18. Select that installation in Settings.")

    def settings(self, body):
        if self.job and self.job["state"] == "running": raise ValueError("Wait for the current operation before changing settings.")
        profile = body.get("profile", self.profile)
        if profile and profile not in self.profiles: raise ValueError("Choose a detected profile.")
        self.game = str(body.get("game", self.game)).strip()
        self.profile = profile
        write_json(DATA / "preferences.json", {"game": self.game, "profile": profile})
        self.account = ""; self.items = {}; self.previews.clear()
        self.sync_error = "Connect Steam to verify this selection."
        self.load_local()
        return {"message": "Settings saved."}

    def summary(self, group):
        local = next((g for g in self.local_groups if g["GroupDefinition"]["UniqueID"] == group["id"]), None)
        state = "not-imported"
        if local:
            state = "installed" if local["groupItems"] == native_items(group) and local["GroupDefinition"]["Name"] == group["name"] else "update-available"
        return {**group, "importState": state}

    def state(self):
        # The public state deliberately excludes save contents and full Steam account IDs.
        with self.lock:
            mapping = {v["modId"]: v for v in self.items.values() if v.get("available") and v.get("modId")}
            local = []
            for native in self.local_groups:
                d = native["GroupDefinition"]
                try:
                    local.append({**export_native(native, mapping), "exportReady": True})
                except ValueError as exc:
                    local.append({"id": d["UniqueID"], "name": d["Name"], "tracks": [{"kind": "workshop" if x["modHashID"] else "official"} for x in native["groupItems"]], "exportReady": False, "reason": str(exc)})
            return {"version": VERSION,
                "groups": [self.summary(g) for g in self.groups], "localGroups": local,
                "settings": {"game": self.game, "profile": self.profile, "profiles": self.profiles,
                    "profileDirectory": str(PROFILE_DIR), "dataDirectory": str(DATA)},
                "steamConnected": bool(self.account), "cloudEnabled": self.cloud_enabled, "trackStatus": copy.deepcopy(self.track_status),
                "syncError": self.sync_error, "job": copy.deepcopy(self.job)}

    def start_job(self, action, body):
        with self.lock:
            if self.job and self.job["state"] == "running": raise ValueError("An operation is already running.")
            if action not in ("refresh", "catalog", "preview", "import"): raise ValueError("Unknown operation.")
            self.cancel.clear()
            self.job = {"id": str(uuid.uuid4()), "action": action, "state": "running", "message": "Starting…", "phase": "starting"}
            threading.Thread(target=self.perform, args=(action, body), daemon=False).start()
            return {"message": "Operation started."}

    def progress(self, value):
        with self.lock: self.job.update(value)

    def perform(self, action, body):
        try:
            if action == "catalog":
                self.progress({"message": "Refreshing reviewed community groups…"})
                values = catalog.refresh(self.cancel.is_set)
                with self.lock: self.groups = values
                result = {"message": "Community library refreshed."}
            elif action == "refresh":
                self.supported_game()
                self.progress({"message": "Connecting to Steam and reading public track metadata…"})
                r = Worker(self.game).request("snapshot", {"profile": self.profile}, self.progress, self.cancel.is_set)
                with self.lock:
                    self.account = r["account"]; self.items = r["items"]; self.cloud_enabled = r["cloudEnabled"]
                    self.track_status = r.get("status", {})
                    self.load_local()
                    self.sync_error = "" if self.profile and base64.b64decode(r["save"]) == (PROFILE_DIR / self.profile).read_bytes() else "Local and Steam saves disagree, or no profile is selected. Resolve the sync before importing."
                    if not self.cloud_enabled: self.sync_error = "Enable Steam Cloud for this game before importing."
                    from .transaction import require_recovered
                    try: require_recovered(DATA / "backups", PROFILE_DIR / self.profile)
                    except ValueError as exc:
                        self.sync_error = str(exc)
                        raise
                result = {"message": "Steam connected. Track metadata refreshed."}
            elif action == "preview":
                self.supported_game()
                if game_running(): raise ValueError("Close The Karters 2 before previewing an import.")
                if not self.profile or not self.account or self.sync_error: raise ValueError("Connect Steam and resolve the profile status first.")
                group = catalog.decode(json.dumps(body["group"]).encode())
                ids = list(dict.fromkeys(t["workshopId"] for t in group["tracks"] if t["kind"] == "workshop"))
                r = Worker(self.game).request("details", {"ids": ids}, self.progress, self.cancel.is_set)
                if r["account"] != self.account: raise ValueError("Steam account changed. Refresh first.")
                for t in group["tracks"]:
                    if t["kind"] == "workshop":
                        detail = r["items"].get(t["workshopId"], {})
                        if not detail.get("available") or detail.get("modId") != t["modId"]:
                            raise ValueError("Unavailable or mismatched Workshop track: " + t.get("title", t["modId"]))
                local = (PROFILE_DIR / self.profile).read_bytes()
                p = Profile(local)
                p.validate_official_tracks(group)
                updated, outcome = p.import_group(group, allow_update=True)
                existing = next((g for g in p.custom_groups() if g["GroupDefinition"]["UniqueID"] == group["id"]), None)
                key = str(uuid.uuid4())
                preview = {"token": key, "outcome": outcome, "group": group,
                    "destinationName": next(g["GroupDefinition"]["Name"] for g in Profile(updated).custom_groups() if g["GroupDefinition"]["UniqueID"] == group["id"]),
                    "previousTracks": existing["groupItems"] if existing else [],
                    "previousName": existing["GroupDefinition"]["Name"] if existing else None,
                    "missingSubscriptions": [item for item in ids if not r["status"][item]["subscribed"]],
                    "pendingDownloads": [item for item in ids if not r["status"][item]["ready"]]}
                with self.lock:
                    self.previews[key] = {"group": group, "hash": digest(local), "time": time.monotonic(), "profile": self.profile, "account": self.account}
                result = {"message": "Review this import before applying it.", "preview": preview}
            else:
                token = body["token"]
                with self.lock: preview = self.previews.pop(token, None)
                if not preview or time.monotonic() - preview["time"] > 600:
                    raise ValueError("Import preview expired. Preview again.")
                self.supported_game()
                result = Worker(self.game).request("install", {"group": preview["group"], "expectedHash": preview["hash"],
                    "account": preview["account"], "profile": preview["profile"], "allowUpdate": True}, self.progress, self.cancel.is_set)
                with self.lock: self.load_local()
                for track in preview["group"]["tracks"]:
                    if track["kind"] == "workshop": self.track_status[track["workshopId"]] = {"subscribed": True, "ready": True}
                result["message"] = "Group " + result["outcome"] + ". You can start the game."
            with self.lock: self.job.update(state="completed", result=result, message=result["message"])
        except Exception as exc:
            with self.lock: self.job.update(state="failed", message=str(exc))

    def export(self, identity):
        with self.lock:
            mapping = {v["modId"]: v for v in self.items.values() if v.get("available") and v.get("modId")}
            native = next((g for g in self.local_groups if g["GroupDefinition"]["UniqueID"] == identity), None)
            if native is None: raise ValueError("Custom group not found.")
            return export_native(native, mapping)
