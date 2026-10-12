"""Build a self-contained Windows folder and ZIP. Never includes installed game files."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from trackgroups import VERSION


def run(*args):
    subprocess.run(args, cwd=ROOT, check=True)


if __name__ == '__main__':
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
        '--name', 'TK2 Track Groups', '--contents-directory', '.',
        '--distpath', str(ROOT / 'artifacts/build'), '--workpath', str(ROOT / 'local/pyinstaller'),
        '--specpath', str(ROOT / 'local'), '--icon', str(ROOT / 'assets/app.ico'),
        '--add-data', str(ROOT / 'ui/dist') + ';ui/dist', '--add-data', str(ROOT / 'catalog') + ';catalog',
        '--add-data', str(ROOT / 'assets/app.ico') + ';assets',
        '--add-data', str(ROOT / 'tools/apply_update.ps1') + ';tools',
        '--exclude-module', 'PyQt5', '--exclude-module', 'PyQt6', '--exclude-module', 'PySide6',
        '--exclude-module', 'tkinter', 'launch.py')
    if output.exists():
        if not output.resolve().is_relative_to((ROOT / 'artifacts').resolve()): raise SystemExit('Unsafe output.')
        shutil.rmtree(output)
    shutil.move(str(ROOT / 'artifacts/build/TK2 Track Groups'), output)
    for name in ('README.md', 'CONTRIBUTING.md', 'LICENSE'): shutil.copy2(ROOT / name, output / name)
    shutil.copytree(ROOT / 'docs', output / 'docs')
    forbidden = list(output.rglob('steam_api*')) + list(output.rglob('GameAssembly.dll'))
    if forbidden: raise SystemExit('Build contains game files: ' + str(forbidden))
    files = {p.relative_to(output).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in output.rglob('*') if p.is_file()}
    (output / 'portable-manifest.json').write_text(json.dumps({'app':'TK2 Track Groups', 'version':VERSION, 'files':files}, indent=2), encoding='utf-8')
    archive = shutil.make_archive(str(output), 'zip', output)
    checksum = hashlib.sha256(Path(archive).read_bytes()).hexdigest()
    Path(archive + '.sha256').write_text(checksum + '  ' + Path(archive).name + '\n', encoding='ascii')
    print(f'Portable folder: {output}\nZIP: {archive}\nSize: {Path(archive).stat().st_size / 1024**2:.1f} MiB')
