import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

from trackgroups.updates import extract_verified, release_info, EXE
from trackgroups.catalog import REPOSITORY


class UpdateTests(unittest.TestCase):
    def release(self, tag='v0.1.1'):
        name = f'TK2-Track-Groups-{tag[1:]}-win-x64.zip'
        return {'tag_name':tag, 'draft':False, 'prerelease':False,
                'assets':[{'name':n, 'browser_download_url':f'https://github.com/{REPOSITORY}/releases/download/{tag}/{n}'} for n in (name, name+'.sha256')]}

    def test_release_selection_requires_supported_assets_and_stable_newer_version(self):
        self.assertEqual(release_info(self.release())['version'], '0.1.1')
        self.assertIsNone(release_info(self.release(), '0.1.1'))
        self.assertEqual(release_info(self.release('v0.1.0'), '0.1.0-dev')['version'], '0.1.0')
        r = self.release(); r['prerelease'] = True; self.assertIsNone(release_info(r))
        r = self.release(); r['assets'].pop()
        with self.assertRaises(ValueError): release_info(r)
        r = self.release(); r['assets'][0]['browser_download_url'] = 'https://example.com/app.zip'
        with self.assertRaises(ValueError): release_info(r)

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
