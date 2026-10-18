"""Synthetic serialized records; no extracted game assets in test fixtures."""
from pathlib import Path
import struct
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from trackgroups.native_menu import _locate_presentation, _presentation_record


def record(controller=123, worker=456):
    raw = bytearray(116)
    struct.pack_into('<iq', raw, 48, 4, worker)
    struct.pack_into('<i', raw, 72, 1)
    struct.pack_into('<i', raw, 76, 0)
    struct.pack_into('<iq', raw, 80, 2, controller)
    return bytes(raw)


EXTERNALS = ['globalgamemanagers.assets', 'sharedassets5.assets', 'resources.assets', 'sharedassets1.assets']


def scene(records, padding):
    meta = bytearray(b'6000.0.75f1\0' + struct.pack('<i?i', 19, False, 1))
    meta += struct.pack('<i?h', 114, False, 0) + bytes(32)
    meta += struct.pack('<i', len(records))
    meta += bytes(-len(meta) % 4)
    offset = padding
    for i, raw in enumerate(records):
        meta += struct.pack('<qqIi', i + 1, offset, len(raw), 0)
        offset += len(raw)
    meta += struct.pack('<ii', 1, 1)  # script count, external file
    meta += bytes(-len(meta) % 4) + struct.pack('<q', 999)
    meta += struct.pack('<i', len(EXTERNALS))
    for name in EXTERNALS:
        meta += b'\0' + bytes(16) + struct.pack('<i', 0) + name.encode() + b'\0'
    data_offset = 48 + len(meta)
    size = data_offset + padding + sum(map(len, records))
    header = struct.pack('>IIII', 0, 0, 22, 0) + bytes(4)
    header += struct.pack('>Iqqq', len(meta), size, data_offset, 0)
    return header + meta + bytes(padding) + b''.join(records)


class NativeMenuTests(unittest.TestCase):
    def locate(self, raw, class_name='PTK_PlayerPreviewItem'):
        definition = SimpleNamespace(m_ClassName=class_name, m_AssemblyName='Assembly-CSharp')
        obj = SimpleNamespace(type=SimpleNamespace(name='MonoScript'), read=lambda: definition)
        env = SimpleNamespace(assets=[SimpleNamespace(objects={999: obj})])
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'level5'
            path.write_bytes(raw)
            with patch('UnityPy.load', return_value=env):
                return _locate_presentation(path, len(raw), 1, 1, 1)

    def test_resolves_component_after_scene_relocation_without_absolute_offset(self):
        expected = ({0: (123, None, None)}, 456)
        self.assertEqual(self.locate(scene([record(), record()], 16)), expected)
        self.assertEqual(self.locate(scene([record()], 32000)), expected)

    def test_requires_semantic_script_identity_and_consistent_presentation(self):
        with self.assertRaisesRegex(ValueError, 'consistently'):
            self.locate(scene([record()], 0), 'OtherComponent')
        with self.assertRaisesRegex(ValueError, 'consistently'):
            self.locate(scene([record(), record(controller=789)], 0))

    def test_rejects_invalid_dependency_and_truncated_or_oversized_arrays(self):
        raw = bytearray(record())
        struct.pack_into('<i', raw, 80, 3)
        with self.assertRaisesRegex(ValueError, 'dependency'):
            _presentation_record(raw, EXTERNALS)
        raw = bytearray(record())
        struct.pack_into('<i', raw, 72, 100000)
        with self.assertRaisesRegex(ValueError, 'table'):
            _presentation_record(raw, EXTERNALS)
        with self.assertRaises(ValueError):
            _presentation_record(b'', EXTERNALS)

    def test_rejects_out_of_file_scene_metadata(self):
        raw = bytearray(scene([record()], 0))
        struct.pack_into('>q', raw, 32, len(raw) + 1)
        with self.assertRaisesRegex(ValueError, 'boundaries'):
            self.locate(raw)


if __name__ == '__main__':
    unittest.main()
