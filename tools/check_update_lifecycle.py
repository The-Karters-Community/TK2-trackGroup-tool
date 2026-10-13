"""Real Windows updater check using an isolated compiled version fixture; no release/save writes."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from trackgroups.runtime import DATA
from trackgroups.updates import EXE, extract_verified


def wait_for(test, timeout=45):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            value = test()
            if value: return value
        except (OSError, ValueError, urllib.error.URLError): pass
        time.sleep(.2)
    raise TimeoutError('Updater lifecycle check timed out.')


def session(version, pid=None):
    value = json.loads((DATA / 'session.json').read_text(encoding='utf-8'))
    with urllib.request.urlopen(value['origin']+'/api/health', timeout=2) as response:
        health = json.load(response)
    return value if health['pid'] == value['pid'] and health['version'] == version and (pid is None or value['pid'] == pid) else None


def close(value):
    # Automatic Steam refresh may still be running when startup health becomes available.
    def idle():
        request = urllib.request.Request(value['origin']+'/api/state', headers={'X-TK2-Token':value['token']})
        with urllib.request.urlopen(request, timeout=5) as response:
            state = json.load(response)
        return not state.get('job') or state['job']['state'] != 'running'
    wait_for(idle)
    request = urllib.request.Request(value['origin']+'/api/shutdown', data=b'{}',
                                    headers={'X-TK2-Token':value['token'], 'Content-Type':'application/json'})
    with urllib.request.urlopen(request, timeout=5): pass


def manifest(folder, version):
    files = {p.relative_to(folder).as_posix():hashlib.sha256(p.read_bytes()).hexdigest()
             for p in folder.rglob('*') if p.is_file() and p.name != 'portable-manifest.json'}
    (folder/'portable-manifest.json').write_text(json.dumps({'app':'TK2 Track Groups', 'version':version, 'files':files}), encoding='utf-8')


def helper(old, stage, pid):
    return subprocess.Popen(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
                             str(ROOT/'tools/apply_update.ps1'), '-OldRoot', str(old), '-Stage', str(stage),
                             '-WaitPid', str(pid)], creationflags=0x08000000)


def check(portable):
    if os.name != 'nt': raise ValueError('Windows is required.')
    current = json.loads((portable/'portable-manifest.json').read_text(encoding='utf-8'))['version']
    numbers = list(map(int, current.removesuffix('-dev').split('.')))
    numbers[2] += 1
    next_version = '.'.join(map(str, numbers))
    numbers[2] += 1
    failed_version = '.'.join(map(str, numbers))
    base = ROOT/'local'/('updater-smoke-'+uuid.uuid4().hex)
    base.mkdir(parents=True)
    source = base/'source'; source.mkdir()
    shutil.copytree(ROOT/'trackgroups', source/'trackgroups', ignore=shutil.ignore_patterns('__pycache__'))
    shutil.copy2(ROOT/'launch.py', source/'launch.py')
    initializer = source/'trackgroups/__init__.py'
    initializer.write_text(f'VERSION = "{next_version}"\nGAME_APP_ID = 2269950\n', encoding='utf-8')
    command = [str(ROOT/'.venv/Scripts/python.exe'), '-m', 'PyInstaller', '--noconfirm', '--clean', '--onedir', '--windowed', '--optimize','2',
               '--name','TK2 Track Groups','--contents-directory','.', '--distpath',str(base/'build'), '--workpath',str(base/'work'), '--specpath',str(source),
               '--icon',str(ROOT/'assets/app.ico'), '--exclude-module','PyQt5','--exclude-module','PyQt6','--exclude-module','PySide6','--exclude-module','tkinter']
    for path, target in ((ROOT/'ui/dist','ui/dist'), (ROOT/'catalog','catalog'), (ROOT/'assets/app.ico','assets'), (ROOT/'tools/apply_update.ps1','tools')):
        command += ['--add-data',str(path)+';'+target]
    with (base/'build.log').open('w') as log:
        subprocess.run(command+[str(source/'launch.py')], cwd=source, stdout=log, stderr=subprocess.STDOUT, check=True)
    new = base/'build/TK2 Track Groups'; manifest(new, next_version)
    old = base/f'TK2-Track-Groups-{current}-win-x64'; shutil.copytree(portable, old)
    (old/'user-notes.txt').write_text('Preserve this user file.', encoding='utf-8')
    stage = base/('tk2-track-groups-update-'+uuid.uuid4().hex); stage.mkdir()
    archive = Path(shutil.make_archive(str(stage/'release'), 'zip', new))
    extract_verified(archive, stage/'extracted', next_version)
    app = subprocess.Popen([str(old/EXE)], cwd=base, creationflags=0x08000000)
    original = wait_for(lambda:session(current, app.pid))
    assert original['pid'] == app.pid
    updater = helper(old, stage, app.pid)
    close(original); app.wait(15)
    updated = wait_for(lambda:session(next_version))
    assert updater.wait(60) == 0
    target = base/f'TK2-Track-Groups-{next_version}-win-x64'
    assert not old.exists() and target.exists()
    assert (target/'user-notes.txt').read_text() == 'Preserve this user file.'
    assert not (stage/'previous').exists()
    # A correctly inventoried but non-runnable fixture must restore/reopen the old app.
    broken = base/('tk2-track-groups-update-'+uuid.uuid4().hex); broken.mkdir()
    shutil.copytree(new, broken/'extracted')
    (broken/'extracted'/EXE).write_bytes(b'not a Windows executable')
    manifest(broken/'extracted', failed_version)
    updater = helper(target, broken, updated['pid'])
    close(updated)
    assert updater.wait(60) == 1
    restored = wait_for(lambda:session(next_version))
    assert target.exists() and not (base/f'TK2-Track-Groups-{failed_version}-win-x64').exists()
    assert (target/'user-notes.txt').read_text() == 'Preserve this user file.'
    close(restored)
    # Deleting the relocated fixtures proves the restarted host and helper released their files.
    wait_for(lambda:not process_running(restored['pid']), 15)
    if not base.resolve().is_relative_to((ROOT/'local').resolve()): raise ValueError('Unsafe cleanup path.')
    shutil.rmtree(base)
    assert not base.exists()
    print('PASS: verified extraction, real portable replacement/restart, version-folder rename, preserved user file, temporary backup cleanup, failure rollback/restart, folder deletion.')


def process_running(pid):
    result = subprocess.run(['tasklist','/FI',f'PID eq {pid}','/FO','CSV','/NH'], capture_output=True, creationflags=0x08000000)
    return f'"{pid}"'.encode() in result.stdout


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('portable', type=Path)
    check(parser.parse_args().portable.resolve())
