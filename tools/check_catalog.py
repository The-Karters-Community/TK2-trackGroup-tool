import json
import argparse
import hashlib
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from trackgroups.catalog import read_catalog, decode
from trackgroups.runtime import write_json

parser = argparse.ArgumentParser(description='Validate catalog; optionally regenerate its index with canonical LF files.')
parser.add_argument('--write-index', action='store_true')
args = parser.parse_args()
if args.write_index:
    folder = ROOT / 'catalog'
    index = json.loads((folder / 'index.json').read_text(encoding='utf-8'))
    files = {p.name: p for p in folder.glob('*.tk2group.json')}
    order = [e['file'] for e in index['groups'] if e['file'] in files]
    order += sorted(set(files) - set(order))
    entries = []
    normalized = []
    for name in order:
        raw = files[name].read_bytes().replace(b'\r\n', b'\n')
        group = decode(raw)
        if name != group['id'] + '.tk2group.json': raise SystemExit('Filename and group ID must match.')
        normalized.append((files[name], raw))
        entries.append({'file':name, 'sha256':hashlib.sha256(raw).hexdigest()})
    for file, raw in normalized: file.write_bytes(raw)
    write_json(folder / 'index.json', {'version':1, 'groups':entries})

groups = read_catalog(ROOT / 'catalog')
indexed = {g['id'] + '.tk2group.json' for g in groups}
actual = {p.name for p in (ROOT / 'catalog').glob('*.tk2group.json')}
if indexed != actual: raise SystemExit('Catalog index must include every group exactly once.')
dependencies = {}
for group in groups:
    for track in group['tracks']:
        if track['kind'] != 'workshop': continue
        prior = dependencies.setdefault(track['workshopId'], track['modId'])
        if prior != track['modId']: raise SystemExit('Conflicting internal IDs for the same Workshop item.')
print(f'Validated {len(groups)} groups and {sum(len(g["tracks"]) for g in groups)} ordered references.')
