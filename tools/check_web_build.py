"""Verify the deployed output is static and contains no desktop transport."""
import json
from pathlib import Path
import re
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
folder = ROOT / 'ui/web-dist'
html = (folder / 'index.html').read_text(encoding='utf-8')
assert 'tk2-session' not in html and '__SESSION_TOKEN__' not in html
assert "connect-src 'none'" in html, 'Production website must prohibit background requests.'
assert "form-action 'none'" in html
for src in re.findall(r'(?:src|href)="([^"]+)"', html):
    assert src.startswith('/TK2-trackGroup-tool/'), f'Unexpected deployed asset: {src}'
    assert (folder / src.removeprefix('/TK2-trackGroup-tool/')).is_file()
scripts = '\n'.join(p.read_text(encoding='utf-8') for p in (folder / 'assets').glob('*.js'))
assert '/api/' not in scripts and '__SESSION_TOKEN__' not in scripts, 'Desktop API leaked into browser bundle.'
assert not any(p.suffix in {'.exe', '.dll', '.py', '.bin'} for p in folder.rglob('*'))
previews = json.loads((ROOT / 'catalog/track-previews.json').read_text(encoding='utf-8'))
workshop = {t['workshopId'] for p in (ROOT / 'catalog').glob('*.tk2group.json')
            for t in json.loads(p.read_text(encoding='utf-8'))['tracks'] if t['kind'] == 'workshop'}
assert previews.keys() <= workshop
for item, url in previews.items():
    parsed = urlparse(url)
    assert item.isdecimal() and parsed.scheme == 'https'
    assert parsed.hostname in {'images.steamusercontent.com', 'steamuserimages-a.akamaihd.net'}
    assert not parsed.username and not parsed.password and not parsed.query
print('Static website verified: subpath assets, restricted connections, public previews, no desktop API/runtime.')
