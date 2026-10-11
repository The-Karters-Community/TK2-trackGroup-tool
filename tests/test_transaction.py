from pathlib import Path
import tempfile
import json
import unittest
from unittest.mock import patch

from trackgroups.transaction import commit, digest
from test_profile import group, profile


class FakeSteam:
    account = 'account'
    def __init__(self, data): self.data = data; self.writes = []
    def read_save(self, name): return self.data
    def write_save(self, name, data): self.data = data; self.writes.append(data)


class TransactionTests(unittest.TestCase):
    def execute(self, mutate=None, failing_local=False):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); p = root / '1009PTK_PlayerData_v19tpp0_bt0'
            before = profile(); p.write_bytes(before); s = FakeSteam(before)
            if mutate: mutate(p, s)
            kwargs = dict(backups=root / 'backups', running=lambda: False)
            if failing_local:
                with patch('trackgroups.transaction.atomic_bytes', side_effect=OSError('locked file')):
                    with self.assertRaisesRegex(ValueError, 'original save'):
                        commit(s, p, group(), digest(before), 'account', **kwargs)
                self.assertEqual(s.data, before); self.assertEqual(p.read_bytes(), before)
                self.assertEqual(len(s.writes), 2)
            elif mutate:
                with self.assertRaises(ValueError): commit(s, p, group(), digest(before), 'account', **kwargs)
                self.assertFalse(s.writes)
            else:
                result = commit(s, p, group(), digest(before), 'account', **kwargs)
                self.assertEqual(s.data, p.read_bytes()); self.assertNotEqual(s.data, before)
                self.assertEqual((Path(result['backup']) / 'original.save').read_bytes(), before)

    def test_success_verifies_both_and_retains_backup(self): self.execute()
    def test_failed_local_write_recovers_cloud(self): self.execute(failing_local=True)
    def test_local_changed_since_preview(self): self.execute(lambda p, s: p.write_bytes(profile() + b'changed'))
    def test_cloud_conflict(self): self.execute(lambda p, s: setattr(s, 'data', profile() + b'cloud'))
    def test_account_changed(self): self.execute(lambda p, s: setattr(s, 'account', 'other'))
    def test_running_game_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Close'):
            commit(FakeSteam(profile()), Path('1009PTK_PlayerData_v19tpp0_bt0'), group(), '', 'account', running=lambda: True)

    def test_unfinished_transaction_blocks_new_write(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); p = root / '1009PTK_PlayerData_v19tpp0_bt0'; p.write_bytes(profile())
            prior = root / 'backups/prior'; prior.mkdir(parents=True)
            (prior / 'transaction.json').write_text(json.dumps({'profile': str(p), 'state': 'prepared'}))
            steam = FakeSteam(profile())
            with self.assertRaisesRegex(ValueError, 'recovery'):
                commit(steam, p, group(), digest(profile()), 'account', backups=root / 'backups', running=lambda: False)
            self.assertFalse(steam.writes)

    def test_cloud_write_failure_preserves_local(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); p = root / '1009PTK_PlayerData_v19tpp0_bt0'; p.write_bytes(profile())
            steam = FakeSteam(profile())
            with patch.object(steam, 'write_save', side_effect=OSError('Steam offline')):
                with self.assertRaisesRegex(ValueError, 'original save'):
                    commit(steam, p, group(), digest(profile()), 'account', backups=root / 'backups', running=lambda: False)
            self.assertEqual(p.read_bytes(), profile())

    def test_external_cloud_change_is_not_overwritten_by_recovery(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); p = root / '1009PTK_PlayerData_v19tpp0_bt0'; p.write_bytes(profile())
            steam = FakeSteam(profile()); external = b'new external progress'
            def locked(*_):
                steam.data = external
                raise OSError('Local file locked')
            with patch('trackgroups.transaction.atomic_bytes', side_effect=locked):
                with self.assertRaisesRegex(ValueError, 'recovery needs attention'):
                    commit(steam, p, group(), digest(profile()), 'account', backups=root / 'backups', running=lambda: False)
            self.assertEqual(steam.data, external)
            self.assertEqual(p.read_bytes(), profile())
