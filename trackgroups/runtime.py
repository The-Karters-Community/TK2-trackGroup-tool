"""App-owned paths, installation discovery, and isolated Steam worker transport."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time

ROOT = Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parents[1]
DATA = Path(os.environ.get("LOCALAPPDATA", str(Path.home() / ".local/share"))) / "TK2 Track Groups"
PROFILE_DIR = Path.home() / "AppData/LocalLow/PixelEdgeGames/TheKarters2"


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")
    os.replace(temp, path)


def game_running():
    if os.name != "nt": return False
    result = subprocess.run(["tasklist", "/FI", "IMAGENAME eq TheKarters2.exe", "/FO", "CSV", "/NH"],
        capture_output=True, creationflags=0x08000000)
    if result.returncode:
        raise ValueError("Could not check running game processes. Import disabled.")
    return b'"thekarters2.exe"' in result.stdout.lower()


def discover_games():
    roots = [Path(os.environ.get("PROGRAMFILES(X86)", "C:/Program Files (x86)")) / "Steam"]
    if os.name == "nt":
        import winreg
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam") as key:
                roots.insert(0, Path(winreg.QueryValueEx(key, "SteamPath")[0]))
        except OSError: pass
    libraries = list(roots)
    for root in roots:
        vdf = root / "steamapps/libraryfolders.vdf"
        if vdf.is_file():
            libraries.extend(Path(x.replace("\\\\", "\\")) for x in re.findall(r'"path"\s*"([^"]+)"', vdf.read_text(encoding="utf-8", errors="replace")))
    return [str(p) for p in dict.fromkeys(library / "steamapps/common/The Karters 2 Turbo Charged" for library in libraries)
            if (p / "TheKarters2.exe").is_file()]


class Worker:
    def __init__(self, game):
        self.game = str(game)

    def request(self, action, payload=None, progress=lambda value: None, cancelled=lambda: False, timeout=660):
        DATA.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="steam-", dir=DATA) as temp:
            folder = Path(temp)
            write_json(folder / "request.json", {"game": self.game, "action": action, **(payload or {})})
            command = [sys.executable]
            if not getattr(sys, "frozen", False): command += [str(ROOT / "launch.py")]
            command += ["--steam-worker", str(folder)]
            process = subprocess.Popen(command, cwd=ROOT, creationflags=0x08000000 if os.name == "nt" else 0,
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            deadline = time.monotonic() + timeout
            try:
                while process.poll() is None:
                    if cancelled(): (folder / "cancel").touch()
                    if time.monotonic() > deadline:
                        # Do not interrupt a save transaction halfway through recovery.
                        (folder / "cancel").touch()
                        if action in ("install", "rename", "edit", "repair"):
                            progress({"message": "Waiting for the save worker to finish safely…"})
                            deadline = float("inf")
                        else:
                            process.terminate()
                            process.wait()
                            raise ValueError("Steam worker timed out.")
                    try: progress(json.loads((folder / "progress.json").read_text(encoding="utf-8")))
                    except (OSError, ValueError): pass
                    time.sleep(.15)
                result_file = folder / "result.json"
                if not result_file.is_file():
                    raise ValueError("Steam helper stopped unexpectedly. Your group was not confirmed as imported.")
                result = json.loads(result_file.read_text(encoding="utf-8"))
                if "error" in result: raise ValueError(result["error"])
                return result
            finally:
                if process.poll() is None:
                    process.wait(timeout=60)
