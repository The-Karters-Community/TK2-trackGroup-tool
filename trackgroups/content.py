"""Check Steam's app/item directory and the game's downloaded track catalog."""
import base64
import json
from pathlib import Path

from . import GAME_APP_ID


def installed_kind(directory):
    """Classify public catalog paths, without interpreting cosmetic assets as tracks."""
    if not directory: return 'unknown'
    directory = Path(directory)
    for catalog in (directory/'catalog_config.json', directory/'StandaloneWindows64/catalog_config.json'):
        try:
            if catalog.stat().st_size > 1024 * 1024: continue
            ids = json.loads(catalog.read_text(encoding='utf-8')).get('m_InternalIds', [])
            paths = [p.replace('\\', '/') for p in ids if isinstance(p, str)]
            if any('/Tracks/' in p and p.endswith('.unity') for p in paths): return 'track'
            if any('/'+kind+'/' in p for p in paths for kind in ('Characters','Vehicles','Wheels','Stickers')): return 'cosmetic'
        except (OSError, ValueError, AttributeError): pass
    return 'unknown'


def verify_installation(directory, item):
    directory = Path(directory).resolve()
    if directory.name != item or directory.parent.name != str(GAME_APP_ID):
        raise ValueError("Steam returned content for a different Workshop item.")
    catalog = directory / "catalog_config.json"
    if not catalog.is_file() or catalog.stat().st_size > 1024 * 1024:
        raise ValueError("Downloaded Workshop item has no supported track catalog: " + item)
    data = json.loads(catalog.read_text(encoding="utf-8"))
    keys = base64.b64decode(data.get("m_KeyDataString", ""), validate=True)
    ids = data.get("m_InternalIds", [])
    if b"ModInfo" not in keys or b"Tracks_" not in keys or not any(
        isinstance(value, str) and value.startswith("Assets/Workshop_Content/Tracks/")
        and value.endswith(".unity") for value in ids
    ):
        raise ValueError("Downloaded Workshop item is not a compatible track: " + item)
    bundles = [value.split("{DATA_PATH}/", 1)[1] for value in ids
               if isinstance(value, str) and "{DATA_PATH}/" in value]
    if not bundles: raise ValueError("Downloaded track has no content bundles: " + item)
    for name in bundles:
        file = (directory / name).resolve()
        if not file.is_relative_to(directory) or not file.is_file() or file.stat().st_size == 0:
            raise ValueError("Downloaded track content is incomplete: " + item)
    return True
