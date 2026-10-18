import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from unittest.mock import patch

from trackgroups.updates import extract_verified, release_info, EXE, Updates
from trackgroups import updates
from trackgroups.catalog import REPOSITORY


class UpdateTests(unittest.TestCase):
    def test_bad_archive_checksum_and_cancellation_preserve_installed_files(self):
        for cancelled in (False, True):
            with self.subTest(cancelled=cancelled), tempfile.TemporaryDirectory() as folder:
                root = Path(folder)/'app'; root.mkdir()
                (root/'portable-manifest.json').write_text('{}')
                (root/EXE).write_bytes(b'original')
                updater = Updates(); updater.release = {'version':'0.1.1', 'checksum':'fixture-checksum', 'url':'fixture-zip'}
                checksum = hashlib.sha256(b'archive').hexdigest() if cancelled else '0'*64
                with patch.object(updates, 'ROOT', root), patch.object(updates.sys, 'frozen', True, create=True), patch.object(updates, 'read_url', side_effect=[checksum.encode(), b'archive']):
                    with self.assertRaisesRegex(ValueError, 'cancelled' if cancelled else 'checksum mismatch'):
                        updater.prepare(lambda:cancelled)
                self.assertEqual((root/EXE).read_bytes(), b'original')
                self.assertFalse(list(root.parent.glob('tk2-track-groups-update-*')))

    def test_streaming_download_enforces_limit_and_observes_cancellation(self):
        with patch.object(updates.urllib.request, 'urlopen', return_value=io.BytesIO(b'too much')):
            with self.assertRaisesRegex(ValueError, 'size limit'): updates.read_url('https://example.test', 2)
        with patch.object(updates.urllib.request, 'urlopen', return_value=io.BytesIO(b'archive')):
            with self.assertRaisesRegex(ValueError, 'cancelled'): updates.read_url('https://example.test', 100, lambda:True)

    def test_destination_collision_stops_before_download_or_app_shutdown(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)/'TK2-Track-Groups-0.1.0-dev-win-x64'; root.mkdir()
            (root/'portable-manifest.json').write_text('{}')
            (root.parent/'TK2-Track-Groups-0.1.1-win-x64').mkdir()
            updater = Updates(); updater.release = {'version':'0.1.1'}
            with patch.object(updates, 'ROOT', root), patch.object(updates.sys, 'frozen', True, create=True), patch.object(updates, 'read_url') as download:
                with self.assertRaisesRegex(ValueError, 'already exists'): updater.prepare()
                download.assert_not_called()
            self.assertTrue(root.exists())

    def release(self, tag='v0.1.1'):
        name = f'TK2-Track-Groups-{tag[1:]}-win-x64.zip'
        return {'tag_name':tag, 'draft':False, 'prerelease':False,
                'assets':[{'name':n, 'browser_download_url':f'https://github.com/{REPOSITORY}/releases/download/{tag}/{n}'} for n in (name, name+'.sha256')]}

    def test_release_selection_requires_supported_assets_and_stable_newer_version(self):
        self.assertEqual(release_info(self.release(), '0.1.0')['version'], '0.1.1')
        self.assertEqual(release_info(self.release(), '0.1.1-dev')['version'], '0.1.1')
        self.assertIsNone(release_info(self.release(), '0.1.1'))
        self.assertEqual(release_info(self.release('v0.1.0'), '0.1.0-dev')['version'], '0.1.0')
        r = self.release(); r['prerelease'] = True; self.assertIsNone(release_info(r))
        r = self.release(); r['assets'].pop()
        with self.assertRaises(ValueError): release_info(r, '0.1.0')
        r = self.release(); r['assets'][0]['browser_download_url'] = 'https://example.com/app.zip'
        with self.assertRaises(ValueError): release_info(r, '0.1.0')

    def archive(self, folder, *, extra=None, checksum=None, version='0.1.1'):
        path = Path(folder) / 'release.zip'
        manifest = {'app':'TK2 Track Groups', 'version':version, 'files':{EXE:checksum or hashlib.sha256(b'executable').hexdigest()}}
        with zipfile.ZipFile(path, 'w') as bundle:
            bundle.writestr(EXE, b'executable')
            bundle.writestr('portable-manifest.json', json.dumps(manifest))
            if extra: bundle.writestr(extra, b'bad')
        return path

    def test_flat_inventory_and_every_file_hash_verified_before_extraction(self):
        with tempfile.TemporaryDirectory() as folder:
            destination = Path(folder) / 'extracted'
            extract_verified(self.archive(folder), destination, '0.1.1')
            self.assertEqual((destination / EXE).read_bytes(), b'executable')
            for options in ({'checksum':'0'*64}, {'version':'0.1.0'}, {'extra':'unlisted.exe'}):
                with self.assertRaises(ValueError): extract_verified(self.archive(folder, **options), destination, '0.1.1')

    def test_unsafe_paths_and_nested_folder_packages_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            for name in ('../outside', '/absolute', 'C:/outside', 'dir\\bad.exe', 'file:stream', 'name. '):
                with self.subTest(name=name), self.assertRaises(ValueError):
                    extract_verified(self.archive(folder, extra=name), Path(folder)/'out', '0.1.1')
            archive = Path(folder)/'nested.zip'
            with zipfile.ZipFile(archive, 'w') as bundle: bundle.writestr('outer/'+EXE, b'bad')
            with self.assertRaisesRegex(ValueError, 'ZIP root'): extract_verified(archive, Path(folder)/'out', '0.1.1')
