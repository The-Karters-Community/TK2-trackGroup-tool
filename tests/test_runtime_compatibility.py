"""Synthetic future runtimes exercise capability checks without loading a DLL."""
import copy
from pathlib import Path
import struct
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from trackgroups.native_runtime import runtime_problem
from trackgroups.native_quick import available
from trackgroups.profile import Profile, SAVE_NAME
from trackgroups.presets import export, validate_pack
from trackgroups.service import Service
from test_presets import fixture


def runtime(exports=('il2cpp_domain_get', 'il2cpp_class_from_name', 'il2cpp_runtime_invoke'), machine=0x8664):
    data = bytearray(0x600)
    data[:2] = b'MZ'
    struct.pack_into('<I', data, 60, 0x80)
    data[0x80:0x84] = b'PE\0\0'
    struct.pack_into('<HH', data, 0x84, machine, 1)
    struct.pack_into('<H', data, 0x94, 0xf0)
    struct.pack_into('<H', data, 0x98, 0x20b)
    struct.pack_into('<I', data, 0x98 + 60, 0x200)
    struct.pack_into('<II', data, 0x98 + 112, 0x1000, 0x400)
    struct.pack_into('<IIII', data, 0x188 + 8, 0x400, 0x1000, 0x400, 0x200)
    struct.pack_into('<I', data, 0x200 + 24, len(exports))
    struct.pack_into('<I', data, 0x200 + 32, 0x1040)
    offset = 0x280
    for i, name in enumerate(exports):
        encoded = name.encode() + b'\0'
        struct.pack_into('<I', data, 0x240 + i * 4, offset - 0x200 + 0x1000)
        data[offset:offset + len(encoded)] = encoded
        offset += len(encoded)
    return bytes(data)


class RuntimeCompatibilityTests(unittest.TestCase):
    def test_unseen_build_and_changed_binary_do_not_need_allowlist_updates(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            bridge = root / 'bridge.dll'
            bridge.write_bytes(b'authored bridge fixture; never loaded')
            dll = root / 'GameAssembly.dll'
            dll.write_bytes(runtime())
            (root / 'build-info.txt').write_text('Version: 9999.42.7\n')
            with patch('trackgroups.native_quick.BRIDGE', bridge), patch('trackgroups.native_quick.os', SimpleNamespace(name='nt')):
                self.assertEqual(runtime_problem(root), '')
                self.assertTrue(available(root))
                dll.write_bytes(runtime() + b'another completely unknown game patch')
                self.assertTrue(available(root))
            self.assertEqual(dll.read_bytes(), runtime() + b'another completely unknown game patch')

    def test_only_actual_runtime_incompatibilities_are_reported(self):
        with tempfile.TemporaryDirectory() as folder:
            dll = Path(folder) / 'GameAssembly.dll'
            dll.write_bytes(runtime(exports=('il2cpp_domain_get',)))
            self.assertIn('missing IL2CPP APIs', runtime_problem(folder))
            dll.write_bytes(runtime(machine=0x14c))
            self.assertIn('x64', runtime_problem(folder))
            dll.write_bytes(b'truncated')
            self.assertIn('incomplete', runtime_problem(folder))

    def test_installation_validation_ignores_version_and_missing_build_info(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'TheKarters2.exe').touch()
            steam = root / 'TheKarters2_Data/Plugins/x86_64/steam_api64.dll'
            steam.parent.mkdir(parents=True)
            steam.touch()
            service = Service.__new__(Service)
            service.game = folder
            service.supported_game()
            (root / 'build-info.txt').write_text('Version: future-preview-999\n')
            service.supported_game()
            steam.unlink()
            with self.assertRaisesRegex(ValueError, 'installed'):
                service.supported_game()

    def test_pack_build_labels_are_metadata_while_cosmetic_schema_stays_strict(self):
        pack = export(Profile(fixture()), [100], [])
        self.assertEqual(pack['gameBuild'], 'unspecified')
        for version in ('0.1.4.18', '0.1.4.999', 'future-build'):
            pack['gameBuild'] = version
            self.assertIs(validate_pack(pack), pack)
        broken = copy.deepcopy(pack)
        broken['presets'][0]['data']['stickersData'].pop()
        with self.assertRaises(ValueError):
            validate_pack(broken)

    def test_new_numeric_profile_versions_are_checked_by_contents_not_filename_label(self):
        self.assertTrue(SAVE_NAME.fullmatch('1009PTK_PlayerData_v999tpp42_bt7'))
        self.assertEqual(Profile(fixture()).unchanged(), fixture())
        for name in ('../1009PTK_PlayerData_v20tpp0_bt0', '1009PTK_PlayerData_v20tpp0_bt0.bak', '1009PTK_PlayerData_vxxtpp0_bt0'):
            self.assertFalse(SAVE_NAME.fullmatch(name))
