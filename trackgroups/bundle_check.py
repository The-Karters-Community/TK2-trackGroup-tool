"""Explicit, read-only frozen dependency check. Never starts the app or saves a profile."""
from io import BytesIO
import gzip
import json
from pathlib import Path
import threading
from types import SimpleNamespace


def run(folder):
    folder = Path(folder)
    result = {}
    try:
        request = json.loads((folder / 'request.json').read_text(encoding='utf-8'))
        import ssl
        from PIL import Image, ImageDraw
        ssl.create_default_context()
        image = Image.new('RGB', (32, 32), 'black')
        ImageDraw.Draw(image).polygon([(0, 0), (31, 0), (15, 31)], fill='white')
        formats = []
        for format in ('PNG', 'JPEG', 'WEBP'):
            stream = BytesIO()
            image.save(stream, format=format)
            stream.seek(0)
            with Image.open(stream) as decoded:
                decoded.load()
                if decoded.size != image.size:
                    raise ValueError('Image codec round trip failed.')
            formats.append(format)
        result['imageFormats'] = formats
        # Loads the actual .NET/Edge host dependencies without creating a window
        # or taking the application's single-instance mutex/session file.
        from webview.guilib import initialize
        initialize('edgechromium')
        result['edgeHostInitialized'] = True
        from .models import model
        from .animation_library import animation
        index = json.loads(Path(request['index']).read_text(encoding='utf-8'))
        appearance = SimpleNamespace(lock=threading.RLock(), game=request['game'],
                                     model_refs=index['modelRefs'], items=index['items'], folder=folder)
        checks = []
        for entry in request.get('models', []):
            raw = model(appearance, entry['kind'], entry['id'])
            data = json.loads(gzip.decompress(raw))
            if not data.get('root'):
                raise ValueError('Missing decoded model.')
            if entry.get('animation'):
                clip = json.loads(gzip.decompress(animation(appearance, entry['id'], entry['animation'])))
                if not clip.get('animations'):
                    raise ValueError('Missing decoded animation.')
            checks.append({'kind':entry['kind'], 'id':entry['id'], 'decoded':True})
        result['models'] = checks
    except Exception as exc:
        result['error'] = str(exc)
    (folder / 'result.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    if 'error' in result:
        raise SystemExit(1)
