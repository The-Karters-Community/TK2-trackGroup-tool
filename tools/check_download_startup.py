"""Load the frozen Edge/.NET host with Explorer-style Internet-marked DLLs."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


def check(portable):
    if os.name != 'nt':
        raise SystemExit('Downloaded portable startup checks require Windows/NTFS.')
    portable = Path(portable).resolve()
    if not (portable / 'TK2 Track Groups.exe').is_file():
        raise SystemExit('Expected a complete portable app folder.')
    # All markers and test data stay in a disposable copy, outside the source
    # package. Do not unblock the original or depend on a running Steam session.
    with tempfile.TemporaryDirectory(prefix='garage downloaded ') as temporary:
        folder = Path(temporary)
        app = folder / 'app'
        shutil.copytree(portable, app)
        marked = []
        for dll in app.rglob('*.dll'):
            marker = Path(str(dll) + ':Zone.Identifier')
            marker.write_text('[ZoneTransfer]\r\nZoneId=3\r\n', encoding='ascii')
            marked.append(marker)
        if not marked:
            raise RuntimeError('No bundled DLLs found to mark.')
        (folder / 'index.json').write_text('{"modelRefs":{},"items":{}}', encoding='utf-8')
        (folder / 'request.json').write_text(json.dumps({
            'index': str(folder / 'index.json'), 'game': '', 'models': [],
        }), encoding='utf-8')
        environment = os.environ.copy()
        system_root = os.environ['SystemRoot']
        environment['PATH'] = os.pathsep.join((str(Path(system_root) / 'System32'), system_root))
        completed = subprocess.run([str(app / 'TK2 Track Groups.exe'), '--bundle-check', str(folder)],
                                   cwd=folder, env=environment, timeout=60,
                                   creationflags=subprocess.CREATE_NO_WINDOW)
        result = json.loads((folder / 'result.json').read_text(encoding='utf-8'))
        if completed.returncode or result.get('error') or not result.get('edgeHostInitialized'):
            raise RuntimeError(f'Downloaded portable startup failed: {result}')
        if not all('ZoneId=3' in marker.read_text(encoding='ascii') for marker in marked):
            raise RuntimeError('The check must pass while Internet markers remain present.')
        print(f'PASS: frozen Edge/.NET host loaded with {len(marked)} Internet-marked DLLs and no developer PATH.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('portable', type=Path)
    check(parser.parse_args().portable)
