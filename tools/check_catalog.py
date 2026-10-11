import json
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from trackgroups.catalog import read_catalog

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
