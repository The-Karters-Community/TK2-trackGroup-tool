"""Bounded local package inventory. Never opens upload credentials or bundles.

Addressable paths identify asset categories, not the game's generated material
IDs. Inventory is informational and must not be used as installation proof.
"""
import json
from pathlib import Path


def local_packages(game):
    if not game: return []
    root = (Path(game) / 'Mods').resolve()
    if not root.is_dir(): return []
    result = []
    for directory in sorted(root.iterdir())[:1000]:
        if not directory.is_dir() or not directory.resolve().is_relative_to(root): continue
        catalog = (directory / 'StandaloneWindows64/catalog_config.json').resolve()
        if not catalog.is_relative_to(root) or not catalog.is_file() or catalog.stat().st_size > 1024 * 1024: continue
        try:
            data = json.loads(catalog.read_text(encoding='utf-8'))
            paths = [v for v in data.get('m_InternalIds', []) if isinstance(v, str)]
            kinds = [kind.lower() for kind in ('Characters', 'Vehicles', 'Wheels', 'Stickers')
                     if any(v.startswith('Assets/Workshop_Content/' + kind + '/') for v in paths)]
            if kinds: result.append({'name':directory.name[:200], 'kinds':kinds})
        except (OSError, ValueError, TypeError, AttributeError): continue
    return result
