"""Opt-in installation of checksum-verified public Windows releases."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import urllib.error
import urllib.request
import zipfile

from . import VERSION
from .catalog import REPOSITORY
from .runtime import ROOT

EXE = 'TK2 Track Groups.exe'
STABLE = re.compile(r'^v?(\d+)\.(\d+)\.(\d+)$')


def version(value):
    match = STABLE.fullmatch(value)
    if not match: raise ValueError('Expected a stable release version.')
    return tuple(map(int, match.groups()))


def read_url(url, limit):
    request = urllib.request.Request(url, headers={'User-Agent':'TK2-Track-Groups', 'Accept':'application/vnd.github+json'})
    with urllib.request.urlopen(request, timeout=20) as response:
        data = response.read(limit + 1)
    if len(data) > limit: raise ValueError('Release download exceeds its size limit.')
    return data


def release_info(release, current=VERSION):
    if release.get('draft') or release.get('prerelease'): return None
    tag = release['tag_name']
    latest = version(tag)
    base = current.removesuffix('-dev')
    if latest < version(base) or (latest == version(base) and not current.endswith('-dev')): return None
    number = '.'.join(map(str, latest))
    name = f'TK2-Track-Groups-{number}-win-x64.zip'
    assets = {a['name']: a['browser_download_url'] for a in release['assets']}
    prefix = f'https://github.com/{REPOSITORY}/releases/download/{tag}/'
    for required in (name, name + '.sha256'):
        if required not in assets or assets[required] != prefix + required:
            raise ValueError('Release is missing the supported Windows ZIP/checksum pair.')
    return {'version':number, 'url':prefix + name, 'checksum':prefix + name + '.sha256',
            'page':f'https://github.com/{REPOSITORY}/releases/tag/{tag}'}


def extract_verified(archive, destination, expected_version):
    """Reject nested packages, traversal, links, duplicate names and oversized archives."""
    names = set()
    total = 0
    with zipfile.ZipFile(archive) as bundle:
        entries = bundle.infolist()
        if len(entries) > 10000: raise ValueError('Too many archive entries.')
        for item in entries:
            path = PurePosixPath(item.filename)
            if not path.parts or path.is_absolute() or any(p in ('..', '.') or ':' in p or '\\' in p or p.endswith((' ', '.')) for p in path.parts):
                raise ValueError('Unsafe archive path.')
            if item.filename.casefold() in names or (item.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError('Duplicate archive entry or symbolic link.')
            names.add(item.filename.casefold())
            total += item.file_size
            if total > 200 * 1024**2: raise ValueError('Extracted release exceeds its size limit.')
        if EXE.casefold() not in names or 'portable-manifest.json' not in names:
            raise ValueError('Release must contain application files directly at ZIP root.')
        manifest = json.loads(bundle.read('portable-manifest.json'))
        if manifest.get('app') != 'TK2 Track Groups' or manifest.get('version') != expected_version:
            raise ValueError('Release manifest/version mismatch.')
        files = manifest.get('files')
        actual = {e.filename for e in entries if not e.is_dir() and e.filename != 'portable-manifest.json'}
        if not isinstance(files, dict) or set(files) != actual: raise ValueError('Release file inventory mismatch.')
        for name, checksum in files.items():
            if hashlib.sha256(bundle.read(name)).hexdigest() != checksum: raise ValueError('Release file checksum mismatch.')
        bundle.extractall(destination)


class Updates:
    def __init__(self):
        self.lock = threading.Lock()
        self.state = {'state':'checking', 'message':'Checking for app releases…', 'portable':bool(getattr(sys, 'frozen', False))}
        self.release = None
    def start(self):
        threading.Thread(target=self.check, daemon=True).start()

    def snapshot(self):
        with self.lock: return dict(self.state)

    def set(self, **value):
        with self.lock: self.state.update(value)

    def check(self):
        self.set(state='checking', message='Checking for app releases…')
        try:
            raw = read_url(f'https://api.github.com/repos/{REPOSITORY}/releases/latest', 1024**2)
            self.release = release_info(json.loads(raw))
            self.set(state='available' if self.release else 'current', message=f"Version {self.release['version']} is available." if self.release else 'The app is up to date.', version=self.release['version'] if self.release else None)
        except urllib.error.HTTPError as exc:
            self.set(state='current' if exc.code == 404 else 'error', message='No public release yet.' if exc.code == 404 else 'Could not check releases. Try again later.')
            exc.close()
        except Exception:
            self.set(state='error', message='Could not check releases. Your installed app can still be used.')

    def prepare(self, cancelled=lambda:False):
        if not getattr(sys, 'frozen', False): raise ValueError('Source checkouts update through Git. Portable releases update here.')
        if not self.release: raise ValueError('Check for an available release first.')
        release = dict(self.release)
        if not (ROOT / 'portable-manifest.json').is_file(): raise ValueError('This folder is not a managed portable installation.')
        if re.fullmatch(r'TK2-Track-Groups-\d+\.\d+\.\d+(-dev)?-win-x64', ROOT.name):
            target = ROOT.parent / f"TK2-Track-Groups-{release['version']}-win-x64"
            if target != ROOT and target.exists(): raise ValueError('The new version folder already exists. Move it before updating; this installation is unchanged.')
        self.set(state='downloading', message='Downloading and verifying the app update…')
        folder = Path(tempfile.mkdtemp(prefix='tk2-track-groups-update-', dir=ROOT.parent))
        try:
            checksum = read_url(release['checksum'], 4096).decode('ascii').split()[0]
            if not re.fullmatch(r'[a-fA-F0-9]{64}', checksum): raise ValueError('Invalid release checksum.')
            raw = read_url(release['url'], 100 * 1024**2)
            if cancelled(): raise ValueError('Update cancelled. Installed files are unchanged.')
            if hashlib.sha256(raw).hexdigest() != checksum.lower(): raise ValueError('Update checksum mismatch. Installed files are unchanged.')
            archive = folder / 'release.zip'; archive.write_bytes(raw)
            extracted = folder / 'extracted'; extracted.mkdir()
            extract_verified(archive, extracted, release['version'])
            if cancelled(): raise ValueError('Update cancelled. Installed files are unchanged.')
            helper = folder / 'apply.ps1'
            shutil.copy2(ROOT / 'tools/apply_update.ps1', helper)
            self.set(state='ready', message='Verified update ready. The app will close and reopen.')
            return folder
        except Exception:
            shutil.rmtree(folder)
            self.set(state='available', message='Update failed. Installed files are unchanged.')
            raise

    def apply(self, folder):
        subprocess.Popen(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(folder / 'apply.ps1'),
                          '-OldRoot', str(ROOT), '-Stage', str(folder), '-WaitPid', str(__import__('os').getpid())],
                         cwd=folder, creationflags=0x08000000)
