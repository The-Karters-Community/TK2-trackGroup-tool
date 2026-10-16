"""Minimal flat Steam API adapter, loaded only inside the short-lived worker."""
import ctypes as C
import json
import os
from pathlib import Path
import time

from . import GAME_APP_ID

U64 = C.c_uint64
U32 = C.c_uint32
PTR = C.c_void_p


class Steam:
    def __init__(self, game):
        if os.name != "nt":
            raise ValueError("Steam integration requires Windows x64.")
        game = Path(game).resolve()
        library = game / "TheKarters2_Data/Plugins/x86_64/steam_api64.dll"
        if not library.is_file() or not (game / "TheKarters2.exe").is_file():
            raise ValueError("Select the installed The Karters 2 game folder.")
        # Worker-only environment; no game-directory files are created or changed.
        os.environ["SteamAppId"] = str(GAME_APP_ID)
        os.environ["SteamGameId"] = str(GAME_APP_ID)
        self.dll = C.CDLL(str(library))
        self.bind("SteamAPI_Init", C.c_bool, [])
        self.bind("SteamAPI_Shutdown", None, [])
        self.bind("SteamAPI_RunCallbacks", None, [])
        if not self.dll.SteamAPI_Init():
            raise ValueError("Steam connection failed. Start Steam, sign in to an account that owns the game, and run both apps as the same Windows user.")
        try:
            self.ugc = self.interface("SteamUGC_v016")
            self.utils = self.interface("SteamUtils_v010")
            self.storage = self.interface("SteamRemoteStorage_v016")
            self.user = self.interface("SteamUser_v021")
            self.bind("SteamAPI_ISteamUser_GetSteamID", U64, [PTR])
            self.bind("SteamAPI_ISteamUtils_GetAppID", U32, [PTR])
            if self.dll.SteamAPI_ISteamUtils_GetAppID(self.utils) != GAME_APP_ID:
                raise ValueError("Steam initialized for a different game; import disabled.")
            self.account = str(self.dll.SteamAPI_ISteamUser_GetSteamID(self.user))
            functions = {
                "GetNumSubscribedItems": (U32, []), "GetSubscribedItems": (U32, [C.POINTER(U64), U32]),
                "GetItemState": (U32, [U64]), "SubscribeItem": (U64, [U64]),
                "DownloadItem": (C.c_bool, [U64, C.c_bool]),
                "GetItemDownloadInfo": (C.c_bool, [U64, C.POINTER(U64), C.POINTER(U64)]),
                "GetItemInstallInfo": (C.c_bool, [U64, C.POINTER(U64), PTR, U32, C.POINTER(U32)]),
                "CreateQueryUGCDetailsRequest": (U64, [C.POINTER(U64), U32]),
                "SetReturnMetadata": (C.c_bool, [U64, C.c_bool]),
                "SendQueryUGCRequest": (U64, [U64]), "GetQueryUGCResult": (C.c_bool, [U64, U32, PTR]),
                "GetQueryUGCMetadata": (C.c_bool, [U64, U32, PTR, U32]), "ReleaseQueryUGCRequest": (C.c_bool, [U64])}
            functions['GetQueryUGCPreviewURL'] = (C.c_bool, [U64, U32, PTR, U32])
            for name, (result, args) in functions.items():
                self.bind("SteamAPI_ISteamUGC_" + name, result, [PTR] + args)
            self.bind("SteamAPI_ISteamUtils_IsAPICallCompleted", C.c_bool, [PTR, U64, C.POINTER(C.c_bool)])
            self.bind("SteamAPI_ISteamUtils_GetAPICallResult", C.c_bool, [PTR, U64, PTR, C.c_int, C.c_int, C.POINTER(C.c_bool)])
            for name, result, args in [
                ("FileExists", C.c_bool, [C.c_char_p]), ("GetFileSize", C.c_int, [C.c_char_p]),
                ("FileRead", C.c_int, [C.c_char_p, PTR, C.c_int]),
                ("FileWrite", C.c_bool, [C.c_char_p, PTR, C.c_int]),
                ("IsCloudEnabledForAccount", C.c_bool, []), ("IsCloudEnabledForApp", C.c_bool, [])]:
                self.bind("SteamAPI_ISteamRemoteStorage_" + name, result, [PTR] + args)
        except Exception:
            self.close()
            raise

    def bind(self, name, result, args):
        fn = getattr(self.dll, name)
        fn.restype, fn.argtypes = result, args
        return fn

    def interface(self, name):
        handle = self.bind("SteamAPI_" + name, PTR, [])()
        if not handle:
            raise ValueError("Installed Steam API does not provide " + name)
        return handle

    def ugc_call(self, name, *args):
        return getattr(self.dll, "SteamAPI_ISteamUGC_" + name)(self.ugc, *args)

    def storage_call(self, name, *args):
        return getattr(self.dll, "SteamAPI_ISteamRemoteStorage_" + name)(self.storage, *args)

    def close(self):
        self.dll.SteamAPI_Shutdown()

    def wait(self, call, callback, size, cancelled=lambda: False, timeout=30):
        if not call:
            raise ValueError("Steam rejected the request.")
        failed = C.c_bool()
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if cancelled():
                raise ValueError("Import cancelled. Completed subscriptions remain subscribed.")
            self.dll.SteamAPI_RunCallbacks()
            if self.dll.SteamAPI_ISteamUtils_IsAPICallCompleted(self.utils, call, C.byref(failed)):
                if failed.value:
                    raise ValueError("Steam request failed; check your connection.")
                raw = C.create_string_buffer(size)
                if not self.dll.SteamAPI_ISteamUtils_GetAPICallResult(self.utils, call, raw, size, callback, C.byref(failed)) or failed.value:
                    raise ValueError("Steam did not return a valid result.")
                return raw.raw
            time.sleep(.08)
        raise ValueError("Steam request timed out. Retry when Steam is online.")

    def subscribed(self):
        count = self.ugc_call("GetNumSubscribedItems")
        if count > 100000:
            raise ValueError("Steam returned an invalid subscription count.")
        values = (U64 * count)()
        actual = self.ugc_call("GetSubscribedItems", values, count)
        return [str(x) for x in values[:actual]]

    def details(self, ids, cancelled=lambda: False):
        """Only expose public item metadata, never owner upload passwords/keys."""
        result = {}
        for offset in range(0, len(ids), 50):
            batch = ids[offset:offset + 50]
            values = (U64 * len(batch))(*(int(x) for x in batch))
            query = self.ugc_call("CreateQueryUGCDetailsRequest", values, len(batch))
            if query == 2**64 - 1:
                raise ValueError("Steam could not prepare the Workshop query.")
            try:
                self.ugc_call("SetReturnMetadata", query, True)
                # SteamUGCQueryCompleted_t is 32 bytes with 8-byte Windows alignment.
                raw = self.wait(self.ugc_call("SendQueryUGCRequest", query), 3401, 32, cancelled)
                if int.from_bytes(raw[8:12], "little") != 1:
                    raise ValueError("Steam could not retrieve Workshop metadata.")
                for i, item in enumerate(batch):
                    # The installed v016 fixed-size details struct fits in this bounded buffer.
                    details = C.create_string_buffer(16384)
                    meta = C.create_string_buffer(5000)
                    if not self.ugc_call("GetQueryUGCResult", query, i, details):
                        continue
                    raw = details.raw
                    returned_id = str(int.from_bytes(raw[:8], "little"))
                    status = int.from_bytes(raw[8:12], "little")
                    app = int.from_bytes(raw[20:24], "little")
                    if returned_id != item or status != 1 or app != GAME_APP_ID:
                        result[item] = {"available": False}
                        continue
                    self.ugc_call("GetQueryUGCMetadata", query, i, meta, len(meta))
                    try: metadata = json.loads(meta.value)
                    except (ValueError, UnicodeError): metadata = {}
                    result[item] = {"available": True, "workshopId": item,
                        "title": raw[24:24 + 128].split(b"\0", 1)[0].decode("utf-8", "replace"),
                        "modId": metadata.get("strOwnerModServerUpdateKey", "")}
                    preview = C.create_string_buffer(4096)
                    if self.ugc_call('GetQueryUGCPreviewURL', query, i, preview, len(preview)):
                        result[item]['previewUrl'] = preview.value.decode('utf-8', 'replace')
            finally:
                self.ugc_call("ReleaseQueryUGCRequest", query)
        return result

    def item_status(self, item):
        state = self.ugc_call("GetItemState", int(item))
        downloaded, total = U64(), U64()
        self.ugc_call("GetItemDownloadInfo", int(item), C.byref(downloaded), C.byref(total))
        return {"subscribed": bool(state & 1), "ready": bool(state & 4) and not bool(state & (8 | 16 | 32)),
                "downloaded": downloaded.value, "total": total.value}

    def install_directory(self, item):
        size, timestamp = U64(), U32()
        directory = C.create_string_buffer(4096)
        if not self.ugc_call("GetItemInstallInfo", int(item), C.byref(size), directory, len(directory), C.byref(timestamp)):
            return None
        path = Path(directory.value.decode("utf-8")).resolve()
        if path.name != str(item) or path.parent.name != str(GAME_APP_ID):
            raise ValueError('Steam returned a different Workshop item directory.')
        return path

    def installed(self, item):
        path = self.install_directory(item)
        if path is None: return False
        # Verify Steam's installation exists, without exposing arbitrary file paths to the UI.
        from .content import verify_installation
        return verify_installation(path, item)

    def subscribe(self, item, cancelled=lambda: False):
        # RemoteStorageSubscribePublishedFileResult_t: EResult + padding + PublishedFileId.
        raw = self.wait(self.ugc_call("SubscribeItem", int(item)), 1313, 16, cancelled)
        if int.from_bytes(raw[:4], "little") != 1 or str(int.from_bytes(raw[8:16], "little")) != item:
            raise ValueError("Steam could not subscribe Workshop item " + item)

    def read_save(self, name):
        from .profile import SAVE_NAME, MAX_SAVE
        if not SAVE_NAME.fullmatch(name):
            raise ValueError("Unsupported profile filename.")
        key = name.encode()
        if not self.storage_call("FileExists", key):
            raise ValueError("The active Steam account has no matching profile. Start the game once with this account.")
        size = self.storage_call("GetFileSize", key)
        if not 0 < size <= MAX_SAVE:
            raise ValueError("Steam returned an unsupported profile size.")
        raw = C.create_string_buffer(size)
        if self.storage_call("FileRead", key, raw, size) != size:
            raise ValueError("Steam save could not be read completely.")
        return raw.raw

    def write_save(self, name, data):
        from .profile import SAVE_NAME, Profile
        if not SAVE_NAME.fullmatch(name):
            raise ValueError("Unsupported profile filename.")
        Profile(data)
        raw = C.create_string_buffer(data)
        if not self.storage_call("FileWrite", name.encode(), raw, len(data)):
            raise ValueError("Steam rejected the profile write.")
        if self.read_save(name) != data:
            raise ValueError("Steam save verification failed.")
