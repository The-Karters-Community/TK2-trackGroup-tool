"""Bounded local PNG cache for rendered lobby setups, never game save data."""
import base64
import hashlib
from io import BytesIO
import json
import threading
import uuid

from .presets import cosmetic

LOCK = threading.Lock()
LIMIT = 8 * 1024 * 1024
MAX_IMAGE = 512 * 1024


def picture(appearance, body):
    data = cosmetic(body.get('data'))
    with appearance.lock:
        revision = appearance.revision
        folder = appearance.folder / 'setup-pictures'
    if not revision or body.get('revision') != revision:
        return {'image': None}
    key = hashlib.sha256(json.dumps([1, revision, data], sort_keys=True).encode()).hexdigest()
    path = folder / (key + '.png')
    image = body.get('image')
    with LOCK:
        if image is not None:
            if not isinstance(image, str) or not image.startswith('data:image/png;base64,') or len(image) > MAX_IMAGE * 4 // 3 + 30:
                raise ValueError('Invalid setup picture.')
            try:
                raw = base64.b64decode(image.split(',', 1)[1], validate=True)
                from PIL import Image
                with Image.open(BytesIO(raw)) as png:
                    if png.format != 'PNG' or not (1 <= png.width <= 1024 and 1 <= png.height <= 1024):
                        raise ValueError('Invalid setup picture dimensions.')
                    png.verify()
            except (OSError, ValueError) as exc:
                raise ValueError('Invalid setup picture.') from exc
            if len(raw) > MAX_IMAGE:
                raise ValueError('Setup picture is too large.')
            folder.mkdir(parents=True, exist_ok=True)
            temporary = folder / (uuid.uuid4().hex + '.tmp')
            try:
                temporary.write_bytes(raw)
                temporary.replace(path)
            finally:
                temporary.unlink(missing_ok=True)
            total = 0
            for index, file in enumerate(sorted(folder.glob('*.png'), key=lambda p: p.stat().st_mtime_ns, reverse=True)):
                total += file.stat().st_size
                if total > LIMIT or index >= 96:
                    file.unlink(missing_ok=True)
            return {'saved': True}
        if not path.is_file() or not 8 < path.stat().st_size <= MAX_IMAGE:
            return {'image': None}
        raw = path.read_bytes()
        if not raw.startswith(b'\x89PNG\r\n\x1a\n'):
            return {'image': None}
        path.touch()
        return {'image': 'data:image/png;base64,' + base64.b64encode(raw).decode('ascii')}
