"""Optional, current-user Windows pipe to the game's read-only preview companion.

No game-memory injection, remote listener, save writes, or executable commands.
"""
import base64
import ctypes
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import threading
import time

from .presets import cosmetic
from .runtime import ROOT, game_running

PIPE = r"\\.\pipe\TK2GaragePreview-v1"
DLL = "TK2.Garage.Preview.dll"
MAX_REPLY = 6 * 1024 * 1024
busy = threading.Lock()


def companion_source():
    return next((p for p in (ROOT / "preview-bridge" / DLL, ROOT / "local/preview-bridge" / DLL) if p.is_file()), None)


def installation(game):
    return Path(game) / "BepInEx/plugins/TK2-Garage-Preview" / DLL


def companion_state(game):
    return {"installed": bool(game) and installation(game).is_file(), "canInstall": companion_source() is not None}


def remove(game):
    if game_running(): raise ValueError("Close the game before removing the preview companion.")
    target = installation(game)
    if not target.resolve().is_relative_to(Path(game).resolve()): raise ValueError("Unsafe companion destination.")
    target.unlink(missing_ok=True)
    return {"message": "Preview companion removed. Other plugins and your presets were left unchanged."}


def install(game):
    root = Path(game).resolve()
    if game_running(): raise ValueError("Close the game before installing the optional preview companion.")
    if not (root / "BepInEx/core/BepInEx.Unity.IL2CPP.dll").is_file():
        raise ValueError("The optional companion requires BepInEx Unity IL2CPP. Normal Garage features do not require it.")
    source = companion_source()
    if source is None: raise ValueError("Compile the companion first with python tools/build_preview_bridge.py.")
    target = installation(root)
    if not target.resolve().is_relative_to(root): raise ValueError("Unsafe companion destination.")
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix('.dll.tmp')
    shutil.copy2(source, temporary)
    expected = hashlib.sha256(source.read_bytes()).digest()
    if hashlib.sha256(temporary.read_bytes()).digest() != expected: raise ValueError("Companion copy verification failed.")
    os.replace(temporary, target)
    return {"message":"Preview companion installed. Start the game and leave it at the main menu. Regular save editing still requires the game closed."}


def validate_request(body):
    if not isinstance(body, dict) or set(body) - {"data", "view", "rotation", "operation"}:
        raise ValueError("Unsupported preview fields.")
    operation = body.get("operation", "render")
    if operation == "status": return {"operation": "status"}
    if operation != "render" or body.get("view") not in ("original", "modded"):
        raise ValueError("Unsupported preview operation or version.")
    rotation = body.get("rotation", 0)
    if type(rotation) not in (int,float) or not math.isfinite(rotation) or not -180 <= rotation <= 180:
        raise ValueError("Preview rotation must be between -180 and 180 degrees.")
    return {"operation":"render", "data":cosmetic(body.get("data"), strict=True), "view":body["view"], "rotation":rotation}


def _exchange(payload, timeout):
    import msvcrt
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.WaitNamedPipeW.argtypes = [ctypes.c_wchar_p,ctypes.c_uint32]
    kernel.PeekNamedPipe.argtypes = [ctypes.c_void_p,ctypes.c_void_p,ctypes.c_uint32,ctypes.c_void_p,ctypes.POINTER(ctypes.c_uint32),ctypes.c_void_p]
    if not kernel.WaitNamedPipeW(PIPE, 100):
        return {"ready":False,"message":"Start the game with the optional preview companion, then open its main menu."}
    raw = json.dumps(payload, separators=(',',':'), allow_nan=False).encode() + b'\n'
    if len(raw) > 32768: raise ValueError("Preview request too large.")
    with open(PIPE,'r+b',buffering=0) as pipe:
        written = 0
        while written < len(raw):
            count = pipe.write(raw[written:])
            if not count: raise OSError('The game preview connection closed.')
            written += count
        handle = msvcrt.get_osfhandle(pipe.fileno())
        chunks = bytearray(); deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            count = ctypes.c_uint32()
            if not kernel.PeekNamedPipe(handle,None,0,None,ctypes.byref(count),None):
                raise OSError('The game preview connection closed.')
            if count.value:
                chunk = pipe.read(min(count.value,65536))
                if not chunk: raise OSError('The game preview connection closed.')
                chunks.extend(chunk)
                if len(chunks) > MAX_REPLY: raise ValueError('Game preview response too large.')
                if b'\n' in chunk: return json.loads(chunks.split(b'\n',1)[0])
            else: time.sleep(.015)
        raise TimeoutError('The game renderer did not respond in time. Keep the game at its main menu.')


def render(body):
    payload = validate_request(body)
    if os.name != 'nt': return {"ready":False,"message":"The optional live game renderer requires Windows."}
    if not busy.acquire(blocking=False): return {"ready":False,"message":"Finishing the previous preview…"}
    try:
        result = _exchange(payload, 3 if payload['operation']=='status' else 26)
        if not isinstance(result,dict): raise ValueError('Invalid preview response.')
        if result.get('ready') and payload['operation']=='render':
            png = base64.b64decode(result.get('png',''),validate=True)
            if not png.startswith(b'\x89PNG\r\n\x1a\n') or len(png)>4*1024*1024: raise ValueError('Invalid game preview image.')
        return result
    except (OSError,TimeoutError) as exc:
        return {"ready":False,"message":str(exc)}
    finally: busy.release()
