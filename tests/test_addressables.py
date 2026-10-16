import base64
import json
from pathlib import Path
import struct
import tempfile
import unittest

from trackgroups.addressables import Addressables


class AddressablesTests(unittest.TestCase):
    def catalog(self, root, bad_dependency=False):
        keys = bytearray()
        buckets = bytearray(struct.pack('<i', 2))
        for key, rows in [('choice', [0, 1]), ('dependencies', [2])]:
            encoded = key.encode()
            buckets.extend(struct.pack('<ii', len(keys), len(rows)))
            buckets.extend(struct.pack('<' + 'i' * len(rows), *rows))
            keys.extend(bytes([0]) + struct.pack('<i', len(encoded)) + encoded)
        rows = [(0, 0, 99 if bad_dependency else 1, 0, 0, 0, 0),
                (1, 0, 1, 0, 0, 0, 0), (2, 0, -1, 0, 0, 0, 0)]
        entries = struct.pack('<i', len(rows)) + b''.join(struct.pack('<7i', *row) for row in rows)
        path = root / 'catalog.json'
        path.write_text(json.dumps({'m_InternalIds':['first.prefab', 'second.prefab', 'package.bundle'],
            'm_KeyDataString':base64.b64encode(keys).decode(),
            'm_BucketDataString':base64.b64encode(buckets).decode(),
            'm_EntryDataString':base64.b64encode(entries).decode()}))
        return path

    def test_duplicate_key_uses_first_location_and_its_dependency(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'package.bundle').write_bytes(b'fixture')
            catalog = Addressables(self.catalog(root))
            result = catalog.resolve('choice')
            self.assertEqual(result['prefab'], 'first.prefab')
            self.assertEqual(result['bundles'], ['package.bundle'])
            self.assertIsNone(catalog.resolve('absent'))

    def test_invalid_dependency_is_rejected_before_traversal(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, 'dependency index'):
                Addressables(self.catalog(Path(folder), bad_dependency=True))

    def test_truncated_catalog_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path = self.catalog(Path(folder))
            data = json.loads(path.read_text())
            data['m_BucketDataString'] = base64.b64encode(b'\x01').decode()
            path.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError, 'Malformed'):
                Addressables(path)
