"""Build a self-contained Windows folder and ZIP. Never includes installed game files."""
import os
import argparse
from pathlib import Path
import shutil
import subprocess
import sys
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from trackgroups import VERSION


def run(*args):
    subprocess.run(args, cwd=ROOT, check=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--preview-companion', type=Path, help='Optional authored TK2.Garage.Preview.dll')
    args = parser.parse_args()
    if args.preview_companion and (args.preview_companion.name != 'TK2.Garage.Preview.dll' or not args.preview_companion.is_file()):
        raise SystemExit('Specify the compiled authored TK2.Garage.Preview.dll.')
    if os.name != 'nt': raise SystemExit('Portable builds require Windows x64.')
    run('npm.cmd', 'ci')
    run('npm.cmd', 'run', 'build')
    run('npm.cmd', 'test')
    run(sys.executable, '-m', 'unittest', 'discover', '-s', 'tests')
    runtime = ROOT / '.venv/Scripts/python.exe'
    if not runtime.exists(): run(sys.executable, '-m', 'venv', str(ROOT / '.venv'))
    run(str(runtime), '-m', 'pip', 'install', '-r', 'requirements.txt')
    output = ROOT / 'artifacts' / f'TK2-Track-Groups-{VERSION}-win-x64'
    run(str(runtime), '-m', 'PyInstaller', '--noconfirm', '--clean', '--onedir', '--windowed',
        '--optimize', '2',
        '--name', 'TK2 Track Groups', '--contents-directory', '.',
        '--distpath', str(ROOT / 'artifacts/build'), '--workpath', str(ROOT / 'local/pyinstaller'),
        '--specpath', str(ROOT / 'local'), '--icon', str(ROOT / 'assets/app.ico'),
        '--add-data', str(ROOT / 'ui/dist') + ';ui/dist', '--add-data', str(ROOT / 'catalog') + ';catalog',
        '--add-data', str(ROOT / 'assets/app.ico') + ';assets',
        '--add-data', str(ROOT / 'tools/apply_update.ps1') + ';tools',
        '--collect-data', 'UnityPy',
        '--collect-data', 'archspec',
        '--collect-binaries', 'fmod_toolkit',
        '--exclude-module', 'PyQt5', '--exclude-module', 'PyQt6', '--exclude-module', 'PySide6',
        '--exclude-module', 'tkinter', 'launch.py')
    if output.exists():
        if not output.resolve().is_relative_to((ROOT / 'artifacts').resolve()): raise SystemExit('Unsafe output.')
        shutil.rmtree(output)
    shutil.move(str(ROOT / 'artifacts/build/TK2 Track Groups'), output)
    for required in ('UnityPy/resources/lzma.tpk', 'archspec/json/cpu/microarchitectures.json',
                     'fmod_toolkit/libfmod/Windows/x64/fmod.dll'):
        if not (output / required).is_file(): raise SystemExit('Missing decoder dependency: ' + required)
    if args.preview_companion:
        (output / 'preview-bridge').mkdir()
        shutil.copy2(args.preview_companion, output / 'preview-bridge/TK2.Garage.Preview.dll')
    for name in ('README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'LICENSE'): shutil.copy2(ROOT / name, output / name)
    shutil.copytree(ROOT / 'docs', output / 'docs')
    forbidden = list(output.rglob('steam_api*')) + list(output.rglob('GameAssembly.dll'))
    if forbidden: raise SystemExit('Build contains game files: ' + str(forbidden))
    files = {p.relative_to(output).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in output.rglob('*') if p.is_file()}
    (output / 'portable-manifest.json').write_text(json.dumps({'app':'TK2 Track Groups', 'version':VERSION, 'files':files}, indent=2), encoding='utf-8')
    archive = str(output) + '.zip'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
        for path in sorted(output.rglob('*')):
            if path.is_file(): bundle.write(path, path.relative_to(output).as_posix())
    checksum = hashlib.sha256(Path(archive).read_bytes()).hexdigest()
    Path(archive + '.sha256').write_text(checksum + '  ' + Path(archive).name + '\n', encoding='ascii')
    print(f'Portable folder: {output}\nZIP: {archive}\nSize: {Path(archive).stat().st_size / 1024**2:.1f} MiB')
