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
    parser.add_argument('--output-folder', type=Path, help='Alternative destination beneath artifacts; leaves an open build untouched.')
    parser.add_argument('--full-decoders', action='store_true', help='Include optional AVIF/font and build-time dependencies for comparison.')
    args = parser.parse_args()
    output = (args.output_folder or ROOT / 'artifacts' / f'TK2-Track-Groups-{VERSION}-win-x64').resolve()
    if output == ROOT / 'artifacts' or not output.is_relative_to((ROOT / 'artifacts').resolve()):
        raise SystemExit('Output must be a child folder beneath artifacts.')
    if os.name != 'nt': raise SystemExit('Portable builds require Windows x64.')
    run(sys.executable, 'tools/build_native_bridge.py')
    run(sys.executable, 'tools/check_native_contracts.py')
    run('npm.cmd', 'ci')
    run('npm.cmd', 'run', 'build')
    run('npm.cmd', 'test')
    run(sys.executable, '-m', 'unittest', 'discover', '-s', 'tests')
    runtime = ROOT / '.venv/Scripts/python.exe'
    if not runtime.exists(): run(sys.executable, '-m', 'venv', str(ROOT / '.venv'))
    run(str(runtime), '-m', 'pip', 'install', '-r', 'requirements.txt')
    # Unity textures use the native texture decoder and PNG output. Keep Pillow's
    # common image formats and ImageDraw, but omit unused AVIF and font binaries.
    # CFFI's prebuilt ABI interface needs neither a compiler nor setuptools.
    excludes = [] if args.full_decoders else [
        'PIL.AvifImagePlugin', 'PIL._avif', 'PIL._imagingft',
        'setuptools', 'pydoc_data', '_pyrepl',
    ]
    optional_flags = [flag for module in excludes for flag in ('--exclude-module', module)]
    run(str(runtime), '-m', 'PyInstaller', '--noconfirm', '--clean', '--onedir', '--windowed',
        '--optimize', '2',
        '--name', 'TK2 Track Groups', '--contents-directory', '.',
        '--distpath', str(ROOT / 'artifacts/build'), '--workpath', str(ROOT / 'local/pyinstaller'),
        '--specpath', str(ROOT / 'local'), '--icon', str(ROOT / 'assets/app.ico'),
        '--add-data', str(ROOT / 'ui/dist') + ';ui/dist', '--add-data', str(ROOT / 'catalog') + ';catalog',
        '--add-data', str(ROOT / 'assets/app.ico') + ';assets',
        '--add-data', str(ROOT / 'native-bridge/BobbyGarage.QuickSetup.dll') + ';native-bridge',
        '--add-data', str(ROOT / 'tools/apply_update.ps1') + ';tools',
        '--collect-data', 'UnityPy',
        '--collect-data', 'archspec',
        '--collect-binaries', 'fmod_toolkit',
        '--exclude-module', 'PyQt5', '--exclude-module', 'PyQt6', '--exclude-module', 'PySide6',
        '--exclude-module', 'tkinter', *optional_flags, 'launch.py')
    if output.exists():
        if not output.resolve().is_relative_to((ROOT / 'artifacts').resolve()): raise SystemExit('Unsafe output.')
        shutil.rmtree(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(ROOT / 'artifacts/build/TK2 Track Groups'), output)
    for required in ('UnityPy/resources/lzma.tpk', 'archspec/json/cpu/microarchitectures.json',
                     'fmod_toolkit/libfmod/Windows/x64/fmod.dll'):
        if not (output / required).is_file(): raise SystemExit('Missing decoder dependency: ' + required)
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
