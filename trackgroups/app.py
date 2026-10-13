"""Authenticated loopback server and native desktop host."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
import os
from pathlib import Path
import secrets
import sys
import threading
from urllib.parse import urlsplit, unquote

from .runtime import ROOT, DATA, write_json
from .service import Service


def make_server(service):
    token = secrets.token_urlsafe(32)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_): pass

        def reply(self, code, value):
            raw = json.dumps(value, ensure_ascii=False).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers(); self.wfile.write(raw)

        def authorized(self):
            return secrets.compare_digest(self.headers.get("X-TK2-Token", ""), token)

        def valid_host(self):
            allowed = {urlsplit(self.server.origin).netloc}
            if not getattr(sys, "frozen", False): allowed.add("127.0.0.1:5173")
            return self.headers.get("Host", "") in allowed

        def do_GET(self):
            if not self.valid_host(): return self.reply(403, {"error": "Untrusted host."})
            path = urlsplit(self.path).path
            if path == "/api/health":
                return self.reply(200, {"app": "TK2 Track Groups", "pid": os.getpid(), "version": service.state()["version"]})
            if path == "/api/state":
                if not self.authorized(): return self.reply(403, {"error": "Invalid session."})
                return self.reply(200, service.state())
            if path.startswith('/api/preset-image/'):
                if not self.authorized(): return self.reply(403, {'error':'Invalid session.'})
                try: raw = service.appearance.image(unquote(path.removeprefix('/api/preset-image/')))
                except (OSError, ValueError): return self.reply(404, {'error':'Preview not found.'})
                self.send_response(200)
                self.send_header('Content-Type','image/png')
                self.send_header('Content-Length',str(len(raw)))
                self.send_header('Cache-Control','private, max-age=60')
                self.send_header('X-Content-Type-Options','nosniff')
                self.end_headers(); self.wfile.write(raw)
                return
            root = (ROOT / "ui/dist").resolve()
            file = (root / ("index.html" if path == "/" else unquote(path).lstrip("/"))).resolve()
            if not file.is_relative_to(root) or not file.is_file(): return self.reply(404, {"error": "Not found."})
            raw = file.read_bytes()
            if file.name == "index.html": raw = raw.replace(b"__SESSION_TOKEN__", token.encode())
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(file.name)[0] or "application/octet-stream")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store" if file.name == "index.html" else "max-age=31536000, immutable")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers(); self.wfile.write(raw)

        def do_POST(self):
            if not self.valid_host(): return self.reply(403, {"error": "Untrusted host."})
            if not self.authorized(): return self.reply(403, {"error": "Invalid session."})
            origin = self.headers.get("Origin")
            allowed = {self.server.origin, "http://127.0.0.1:5173"} if not getattr(sys, "frozen", False) else {self.server.origin}
            if origin and origin not in allowed: return self.reply(403, {"error": "Untrusted origin."})
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 1024 * 1024: raise ValueError("Request size is invalid.")
                body = json.loads(self.rfile.read(length))
                action = urlsplit(self.path).path.removeprefix("/api/")
                if action in ("refresh", "catalog", "preview", "create", "rename", "edit", "repair", "update", "check-update", "import", "presets"):
                    result = service.start_job(action, body)
                elif action == "cancel":
                    service.cancel.set(); result = {"message": "Cancellation requested. Already completed subscriptions remain."}
                elif action == "settings": result = service.settings(body)
                elif action == 'export-presets':
                    pack = service.export_presets(body)
                    try: import webview
                    except ImportError: webview = None
                    if webview and webview.windows:
                        chosen = webview.windows[0].create_file_dialog(webview.FileDialog.SAVE,
                            save_filename='customizations.tk2presets.json', file_types=('Preset packs (*.tk2presets.json)',))
                        if chosen:
                            write_json(Path(chosen[0]), pack)
                            result = {'saved': True, 'message': 'Preset pack exported.'}
                        else: result = {'saved': False, 'message': 'Export cancelled.'}
                    else: result = {'pack': pack}
                elif action == "export":
                    group = service.export(body["id"])
                    try: import webview
                    except ImportError: webview = None
                    if webview and webview.windows:
                        chosen = webview.windows[0].create_file_dialog(webview.FileDialog.SAVE,
                            save_filename=group["id"] + ".tk2group.json", file_types=("Track groups (*.tk2group.json)",))
                        if chosen:
                            write_json(Path(chosen[0]), group)
                            result = {"message": "Group exported.", "saved": True}
                        else: result = {"message": "Export cancelled.", "saved": False}
                    else: result = {"group": group}
                elif action == "shutdown":
                    if service.job and service.job["state"] == "running":
                        raise ValueError("Cancel or finish the current operation before closing.")
                    result = {"message": "Closed."}
                    close = self.server.window.destroy if getattr(self.server, "window", None) else self.server.shutdown
                    threading.Thread(target=close, daemon=True).start()
                else: raise ValueError("Unknown action.")
                self.reply(200, result)
            except Exception as exc:
                self.reply(400, {"error": str(exc)})

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.origin = f"http://127.0.0.1:{server.server_port}"
    server.token = token
    return server


def main():
    if os.name == "nt":
        import ctypes
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.CreateMutexW.restype = ctypes.c_void_p
        kernel.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.c_bool, ctypes.c_wchar_p]
        mutex = kernel.CreateMutexW(None, False, "Local\\TK2TrackGroups-v1")
        if not mutex: raise OSError("Could not create the application lock.")
        if ctypes.get_last_error() == 183:
            if "--no-window" not in sys.argv:
                ctypes.windll.user32.MessageBoxW(None, "TK2 Track Groups is already open.", "TK2 Track Groups", 0)
            return
    service = Service()
    service.updates.start()
    service.start_job("refresh", {})
    server = make_server(service)
    write_json(DATA / "session.json", {"origin": server.origin, "token": server.token, "pid": os.getpid()})
    if "--no-window" in sys.argv:
        try: server.serve_forever()
        finally: server.server_close()
        return
    if not (ROOT / "ui/dist/index.html").is_file():
        raise RuntimeError("Build the frontend first: npm ci && npm run build")
    import webview
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    window = webview.create_window("TK2 Track Groups", server.origin, width=1180, height=820, min_size=(760, 560))
    server.window = window
    def apply_update(folder):
        service.updates.apply(folder)
        window.destroy()
    service.on_update = apply_update

    def closing():
        if service.job and service.job["state"] == "running":
            service.cancel.set()
            # Retain host until subscriptions stop or a save transaction completes.
            return False
        return True

    window.events.closing += closing
    try: webview.start(gui="edgechromium", icon=str(ROOT / 'assets/app.ico'))
    finally:
        server.shutdown(); server.server_close()
        session = DATA / "session.json"
        try:
            if json.loads(session.read_text(encoding="utf-8")).get("pid") == os.getpid(): session.unlink()
        except (OSError, ValueError): pass
