"""Runtime-resolved native transport. No build allowlist or game DLL redistribution."""

import ctypes as C
import ctypes.wintypes as W
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
import time
from .runtime import ROOT, DATA, write_json
from .presets import cosmetic, FIELDS, STICKER_FIELDS

BRIDGE = ROOT / "native-bridge/BobbyGarage.QuickSetup.dll"


class Cosmetic(C.Structure):
    _pack_ = 1
    _fields_ = [
        ("ids", C.c_int32 * 6),
        ("modded", C.c_uint8),
        ("stickers", (C.c_int32 * 4) * 20),
    ]

    @classmethod
    def encode(cls, data):
        data = cosmetic(data, strict=True)
        out = cls()
        out.ids[:] = [data[k] for k in FIELDS]
        out.modded = data["bUsingModdedVersion"]
        for i, s in enumerate(data["stickersData"]):
            out.stickers[i][:] = [s[k] for k in STICKER_FIELDS]
        return out

    def decode(self):
        return {
            **dict(zip(FIELDS, self.ids)),
            "bUsingModdedVersion": bool(self.modded),
            "stickersData": [dict(zip(STICKER_FIELDS, row)) for row in self.stickers],
        }


class LobbyEntry(C.Structure):
    _pack_ = 1
    _fields_ = [
        ("player", C.c_int32),
        ("flags", C.c_int32),
        ("presetId", C.c_int32),
        ("data", Cosmetic),
        ("name", W.WCHAR * 96),
        ("identity", W.WCHAR * 128),
    ]


class Request(C.Structure):
    _pack_ = 1
    _fields_ = [
        ("magic", W.DWORD),
        ("version", W.DWORD),
        ("player", W.DWORD),
        ("operation", W.DWORD),
        ("state", W.LONG),
        ("thread", W.DWORD),
        ("saved", W.DWORD),
        ("menuRefreshed", W.DWORD),
        ("presetId", C.c_int32),
        ("screen", C.c_int32),
        ("baseline", Cosmetic),
        ("desired", Cosmetic),
        ("current", Cosmetic),
        ("profile", W.WCHAR * 128),
        ("error", W.WCHAR * 256),
        ("warning", W.WCHAR * 256),
        ("lobbyCount", W.DWORD),
        ("inLobby", W.DWORD),
        ("targetIdentity", W.WCHAR * 128),
        ("lobby", LobbyEntry * 32),
        ("payloadBytes", W.DWORD),("responseBytes",W.DWORD),("responseCapacity",W.DWORD),
    ]


def available(game):
    if os.name != "nt" or not BRIDGE.is_file():
        return False
    from .native_runtime import runtime_problem
    return not runtime_problem(game)


def exchange(
    game,
    profile,
    preset_id=0,
    player=0,
    baseline=None,
    desired=None,
    operation=None,
    identity="",
    payload=None,
    response_capacity=None,
):
    operation = (1 if desired is not None else 0) if operation is None else operation
    if not available(game):
        from .native_runtime import runtime_problem
        raise ValueError(runtime_problem(game) or 'The native bridge is missing. Reinstall the complete Garage portable folder.')
    if (
        type(player) is not int
        or not 0 <= player < (6 if operation < 2 else 32)
        or type(preset_id) is not int
        or not isinstance(profile, str)
        or not 0 < len(profile) < 128
    ):
        raise ValueError("Invalid Quick Setup target.")
    if (
        operation not in (0, 1, 2, 3, 4, 5, 6, 7, 8)
        or not isinstance(identity, str)
        or len(identity) >= 128
    ):
        raise ValueError("Invalid lobby request.")
    encoded = b"" if payload is None else json.dumps(payload,ensure_ascii=False,separators=(",",":"),allow_nan=False).encode("utf-8")
    if len(encoded)>48*1024*1024:raise ValueError("The library transaction exceeds the 48 MiB safety limit.")
    if operation==5 and (not isinstance(payload,dict) or not {"baseline","desired"}<=set(payload) or set(payload)-{"baseline","desired","validateOnly"} or ("validateOnly"in payload and type(payload["validateOnly"])is not bool) or any(not isinstance(payload[k],dict) or set(payload[k])!={"presets","groups"} or any(not isinstance(payload[k][n],list) for n in ("presets","groups")) for k in ("baseline","desired"))):
        raise ValueError("Expected complete baseline and desired native preset/group lists.")
    if operation==7 and (not isinstance(payload,dict) or set(payload)!={"workshopId"} or not isinstance(payload["workshopId"],str) or not payload["workshopId"].isascii() or not payload["workshopId"].isdigit() or not 0<int(payload["workshopId"])<2**63):
        raise ValueError("Expected one exact Steam Workshop identity.")
    if operation==8 and (baseline is None or desired is None or not identity):
        raise ValueError("CPU changes need an exact current identity, baseline and chosen appearance.")
    response_capacity=(16*1024*1024 if operation==6 else 1024*1024 if operation in (2,3,7,8) else 0) if response_capacity is None else response_capacity
    if type(response_capacity)is not int or not 0<=response_capacity<=48*1024*1024:raise ValueError("Invalid native response capacity.")
    mapping_size=C.sizeof(Request)+len(encoded)+response_capacity
    # A fresh, bounded current-owner mapping for every invocation. No network listener.
    k = C.WinDLL("kernel32", use_last_error=True)
    u = C.WinDLL("user32", use_last_error=True)
    a = C.WinDLL("advapi32", use_last_error=True)
    k.OpenProcess.argtypes = [W.DWORD, W.BOOL, W.DWORD]
    k.OpenProcess.restype = W.HANDLE
    k.CloseHandle.argtypes = [W.HANDLE]
    k.QueryFullProcessImageNameW.argtypes = [
        W.HANDLE,
        W.DWORD,
        W.LPWSTR,
        C.POINTER(W.DWORD),
    ]
    u.GetWindowThreadProcessId.argtypes = [W.HWND, C.POINTER(W.DWORD)]
    u.GetWindowThreadProcessId.restype = W.DWORD
    callback = C.WINFUNCTYPE(W.BOOL, W.HWND, W.LPARAM)
    windows = set()
    expected = (Path(game) / "TheKarters2.exe").resolve()

    @callback
    def collect(hwnd, _):
        pid = W.DWORD()
        thread = u.GetWindowThreadProcessId(hwnd, C.byref(pid))
        handle = k.OpenProcess(0x1000, False, pid.value)
        if handle:
            try:
                path = C.create_unicode_buffer(32768)
                size = W.DWORD(len(path))
                if (
                    k.QueryFullProcessImageNameW(handle, 0, path, C.byref(size))
                    and Path(path.value).resolve() == expected
                ):
                    windows.add((pid.value, thread))
            finally:
                k.CloseHandle(handle)
        return True

    u.EnumWindows(collect, 0)
    if len(windows) != 1:
        raise ValueError(
            "Open the selected The Karters 2 installation, with both apps running as the same Windows user."
        )
    pid, thread = next(iter(windows))
    nonce = secrets.randbits(63)

    class SA(C.Structure):
        _fields_ = [
            ("nLength", W.DWORD),
            ("lpSecurityDescriptor", W.LPVOID),
            ("bInheritHandle", W.BOOL),
        ]

    sd = W.LPVOID()
    a.ConvertStringSecurityDescriptorToSecurityDescriptorW.argtypes = [
        W.LPCWSTR,
        W.DWORD,
        C.POINTER(W.LPVOID),
        C.POINTER(W.DWORD),
    ]
    if not a.ConvertStringSecurityDescriptorToSecurityDescriptorW(
        "D:P(A;;GA;;;OW)", 1, C.byref(sd), None
    ):
        raise C.WinError(C.get_last_error())
    sa = SA(C.sizeof(SA), sd, False)
    k.CreateFileMappingW.argtypes = [
        W.HANDLE,
        C.POINTER(SA),
        W.DWORD,
        W.DWORD,
        W.DWORD,
        W.LPCWSTR,
    ]
    k.CreateFileMappingW.restype = W.HANDLE
    k.MapViewOfFile.argtypes = [W.HANDLE, W.DWORD, W.DWORD, W.DWORD, C.c_size_t]
    k.MapViewOfFile.restype = W.LPVOID
    k.UnmapViewOfFile.argtypes = [W.LPCVOID]
    k.LocalFree.argtypes = [W.HLOCAL]
    mapping = None
    view = None
    hook = None
    try:
        mapping = k.CreateFileMappingW(
            W.HANDLE(-1),
            C.byref(sa),
            4,
            0,
            mapping_size,
            f"Local\\BobbysGarageQuick_{pid}_{nonce:x}",
        )
        if not mapping:
            raise C.WinError(C.get_last_error())
        view = k.MapViewOfFile(mapping, 0xF001F, 0, 0, mapping_size)
        if not view:
            raise C.WinError(C.get_last_error())
        r = Request.from_address(view)
        r.magic = 0x42475153
        r.version = 3
        r.player = player
        r.presetId = preset_id
        r.profile = profile
        r.operation = operation
        r.targetIdentity = identity
        r.payloadBytes=len(encoded);r.responseCapacity=response_capacity
        if encoded:C.memmove(view+C.sizeof(Request),encoded,len(encoded))
        if baseline is not None:
            r.baseline = Cosmetic.encode(baseline)
        if desired is not None:
            r.desired = Cosmetic.encode(desired)
        dll = C.WinDLL(str(BRIDGE))
        u.SetWindowsHookExW.argtypes = [C.c_int, W.LPVOID, W.HINSTANCE, W.DWORD]
        u.SetWindowsHookExW.restype = W.HHOOK
        u.UnhookWindowsHookEx.argtypes = [W.HHOOK]
        u.PostThreadMessageW.argtypes = [W.DWORD, W.UINT, W.WPARAM, W.LPARAM]
        u.RegisterWindowMessageW.argtypes = [W.LPCWSTR]
        u.RegisterWindowMessageW.restype = W.UINT
        hook = u.SetWindowsHookExW(
            3, C.cast(dll.GarageQuickSetup, W.LPVOID), dll._handle, thread
        )
        if not hook:
            raise C.WinError(C.get_last_error())
        if not u.PostThreadMessageW(
            thread, u.RegisterWindowMessageW("BobbysGarage.QuickSetup.v1"), nonce, 0
        ):
            raise C.WinError(C.get_last_error())
        deadline = time.monotonic() + 10
        dll.GarageCancel.argtypes = [C.POINTER(Request)]
        dll.GarageCancel.restype = W.LONG
        while r.state != 2:
            if time.monotonic() > deadline:
                state = C.cast(view + Request.state.offset, C.POINTER(W.LONG))
                if dll.GarageCancel(C.byref(r)) == 0:
                    raise ValueError(
                        "The game did not process the request. Nothing was changed; retry when it responds."
                    )
                # A running save must finish before its transport is torn down.
                if time.monotonic() > deadline + 60:
                    raise ValueError(
                        "The game is still processing this save. Do not retry until it finishes; reopen Quick Setup to check its state."
                    )
            time.sleep(0.025)
        result = {
            "ready": not bool(r.error),
            "saved": bool(r.saved),
            "menuRefreshed": bool(r.menuRefreshed),
            "thread": r.thread,
            "screen": r.screen,
            "data": r.current.decode(),
            "warning": r.warning,
            "message": r.error,
        }
        if operation==8:
            result["current"]=r.current.decode()
        if operation >= 2:
            if r.lobbyCount > 32:
                raise ValueError("Invalid lobby result.")
            result.update(
                inLobby=bool(r.inLobby),
                online=r.inLobby == 2,
                presetId=r.presetId,
                players=[
                    {
                        "player": e.player,
                        "id": e.presetId,
                        "data": e.data.decode(),
                        "name": e.name,
                        "identity": e.identity,
                        "local": bool(e.flags & 1),
                        "ai": bool(e.flags & 2),
                        "canEditCpu": bool(e.flags & 32),
                        "canEdit": bool(e.flags & 1) or bool(e.flags & 32),
                        "localPlayer": (e.flags >> 8)-1 if e.flags >> 8 else None,
                    }
                    for e in r.lobby[: r.lobbyCount]
                ],
            )
        if r.responseBytes:
            if r.responseBytes>response_capacity:raise ValueError("Invalid native JSON response.")
            decoded=json.loads(C.string_at(view+C.sizeof(Request)+len(encoded),r.responseBytes))
            if operation==6: result["library"]=decoded
            else: result.update(decoded)
            metadata=result.pop("entryMetadata",{})
            for entry in result.get("players",[]):
                entry.update(metadata.get(str(entry["player"]),{}))
        if r.error and not r.saved:
            raise ValueError(r.error)
        return result
    finally:
        if hook:
            u.UnhookWindowsHookEx(hook)
        if view:
            k.UnmapViewOfFile(view)
        if mapping:
            k.CloseHandle(mapping)
        k.LocalFree(sd)


def request(
    game,
    profile,
    preset_id=0,
    player=0,
    baseline=None,
    desired=None,
    *,
    operation=None,
    identity="",
    payload=None,
    response_capacity=None,
):
    DATA.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="native-quick-", dir=DATA) as temp:
        folder = Path(temp)
        write_json(
            folder / "request.json",
            {
                "game": game,
                "profile": profile,
                "presetId": preset_id,
                "player": player,
                "baseline": baseline,
                "desired": desired,
                "operation": operation,
                "identity": identity,
                "payload":payload, "responseCapacity":response_capacity,
            },
        )
        command = (
            [sys.executable]
            + ([] if getattr(sys, "frozen", False) else [str(ROOT / "launch.py")])
            + ["--quick-worker", str(folder)]
        )
        result = subprocess.run(
            command,
            cwd=ROOT,
            creationflags=0x08000000,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        path = folder / "result.json"
        if not path.is_file():
            raise ValueError(
                "Quick Setup helper stopped unexpectedly. Refresh before retrying; a safety backup was retained."
            )
        outcome = json.loads(path.read_text(encoding="utf-8"))
        if "error" in outcome:
            raise ValueError(outcome["error"])
        return outcome


def run(folder):
    folder = Path(folder)
    try:
        data = json.loads((folder / "request.json").read_text(encoding="utf-8"))
        result = exchange(
            data["game"],
            data["profile"],
            data["presetId"],
            data["player"],
            data["baseline"],
            data["desired"],
            data.get("operation"),
            data.get("identity", ""),
            data.get("payload"),data.get("responseCapacity"),
        )
    except Exception as exc:
        result = {"error": str(exc)}
    write_json(folder / "result.json", result)
