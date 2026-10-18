"""Running-game collection changes never write or restore a whole profile."""
import copy
import itertools
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from trackgroups import worker
from trackgroups.presets import serialize
from trackgroups.profile import Profile
from trackgroups.runtime import write_json
from trackgroups.transaction import commit, digest, library_state
from test_presets import fixture
from test_profile import group


class LiveSteam:
    account = 'account'
    cloud = True

    def __init__(self, raw): self.data = raw
    def storage_call(self, _): return self.cloud
    def read_save(self, _): return self.data
    def write_save(self, *_): raise AssertionError('Live transactions must not write a whole Steam profile.')


class LiveTransactionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.path = self.root / '1009PTK_PlayerData_v19tpp0_bt0'
        self.before = fixture()
        self.path.write_bytes(self.before)
        self.steam = LiveSteam(self.before)
        self.memory = copy.deepcopy(library_state(Profile(self.before)))
        self.calls = []

    def persist(self, library, *, cloud=True):
        profile = Profile(self.path.read_bytes())
        data = copy.deepcopy(profile.data)
        data['ItemsGroupDefinedContainers'] = copy.deepcopy(library['groups'])
        # Independent progress that must survive both commit and rollback.
        data['progress'] = data.get('progress', 0) + 1
        raw = serialize(profile, copy.deepcopy(library['presets']), data)
        self.path.write_bytes(raw)
        if cloud: self.steam.data = raw

    def native(self, game, name, *, operation, payload=None):
        self.assertEqual((game, name), ('fixture-game', self.path.name))
        self.calls.append((operation, copy.deepcopy(payload)))
        if operation == 6: return {'library':copy.deepcopy(self.memory)}
        self.assertEqual(operation, 5)
        if payload['baseline'] != self.memory: raise ValueError('The library changed in the game.')
        self.memory = copy.deepcopy(payload['desired'])
        self.persist(self.memory)
        return {'saved':True, 'menuRefreshed':True}

    def execute(self, *, native=None, change=None, **kwargs):
        with patch('trackgroups.native_quick.available', return_value=True), patch('trackgroups.native_quick.request', side_effect=native or self.native), patch('trackgroups.transaction.atomic_bytes', side_effect=AssertionError('No live raw file writes.')), patch('trackgroups.transaction.time.monotonic', side_effect=itertools.count()), patch('trackgroups.transaction.time.sleep'):
            return commit(self.steam, self.path, change or group(), digest(self.before), 'account',
                          backups=self.root/'backups', running=lambda:True, game='fixture-game', **kwargs)

    def journal(self):
        files = list((self.root/'backups').glob('*/transaction.json'))
        self.assertEqual(len(files), 1)
        return json.loads(files[0].read_text(encoding='utf-8'))

    def test_native_commit_verifies_both_copies_and_preserves_progress_and_extensions(self):
        result = self.execute()
        self.assertTrue(result['live'])
        self.assertTrue(result['menuRefreshed'])
        self.assertEqual(result['outcome'], 'added')
        self.assertEqual(self.path.read_bytes(), self.steam.data)
        after, before = Profile(self.path.read_bytes()), Profile(self.before)
        self.assertGreater(after.data['progress'], before.data['progress'])
        self.assertEqual(after.records[0], before.records[0])
        self.assertEqual(after.records[1], before.records[1])
        self.assertEqual(after.data['private'], before.data['private'])
        self.assertEqual(after.data['QuickCreationPreset'], before.data['QuickCreationPreset'])
        self.assertEqual((Path(result['backup'])/'original.save').read_bytes(), self.before)
        self.assertEqual(self.journal()['state'], 'committed')
        self.assertEqual([op for op, _ in self.calls], [5, 6])

    def test_native_path_reuses_preset_duplicate_validation_and_extension_preservation(self):
        result = self.execute(change={'mode':'duplicate','presetId':100}, preset=True)
        after = Profile(self.path.read_bytes())
        self.assertEqual(len(library_state(after)['presets']), 2)
        self.assertEqual(library_state(after)['presets'][1]['futureNativeField'], {'keep':42})
        self.assertEqual(after.groups, Profile(self.before).groups)
        self.assertEqual(result['outcome'], 'updated')

    def test_native_path_reuses_track_group_rename_validation(self):
        result = self.execute(change={'id':'tracks','name':'Renamed while running'}, rename=True)
        self.assertEqual(result['outcome'], 'renamed')
        after = Profile(self.path.read_bytes())
        self.assertEqual(next(g for g in after.groups if g['GroupDefinition']['UniqueID'] == 'tracks')['GroupDefinition']['Name'], 'Renamed while running')
        self.assertEqual(library_state(after)['presets'], library_state(Profile(self.before))['presets'])

    def test_transport_error_after_game_persisted_is_verified_without_a_duplicate_write(self):
        def uncertain(*args, **kwargs):
            result = self.native(*args, **kwargs)
            if kwargs['operation'] == 5: raise ValueError('Transport response interrupted.')
            return result
        result = self.execute(native=uncertain)
        self.assertTrue(result['live'])
        self.assertEqual(len([op for op, _ in self.calls if op == 5]), 1)
        self.assertIn('Transport', self.journal()['transportWarning'])

    def test_failed_cloud_verification_rolls_back_only_libraries_through_game(self):
        count = 0
        def inconsistent(game, name, *, operation, payload=None):
            nonlocal count
            if operation == 5:
                count += 1
                self.calls.append((operation, copy.deepcopy(payload)))
                self.assertEqual(payload['baseline'], self.memory)
                self.memory = copy.deepcopy(payload['desired'])
                self.persist(self.memory, cloud=count > 1)
                return {'saved':True}
            return self.native(game, name, operation=operation)
        with self.assertRaisesRegex(ValueError, 'original library was retained/restored'):
            self.execute(native=inconsistent)
        after = Profile(self.path.read_bytes())
        self.assertEqual(library_state(after), library_state(Profile(self.before)))
        self.assertGreater(after.data['progress'], Profile(self.before).data['progress'])
        self.assertEqual(self.path.read_bytes(), self.steam.data)
        self.assertEqual(count, 2)
        self.assertEqual(self.journal()['state'], 'rolled-back')

    def test_external_library_change_prevents_rollback_over_new_game_edits(self):
        def external(*args, **kwargs):
            result = self.native(*args, **kwargs)
            if kwargs['operation'] == 5:
                self.memory['groups'][0]['GroupDefinition']['Name'] = 'Changed independently in the game'
                self.persist(self.memory)
            return result
        with self.assertRaisesRegex(ValueError, 'persistence is uncertain'):
            self.execute(native=external)
        self.assertEqual(len([op for op, _ in self.calls if op == 5]), 1)
        self.assertEqual(Profile(self.path.read_bytes()).groups[0]['GroupDefinition']['Name'], 'Changed independently in the game')
        self.assertEqual(self.journal()['state'], 'recovery-required')

    def test_lost_rollback_acknowledgement_still_verifies_game_owned_restoration(self):
        count = 0
        def uncertain_rollback(*args, **kwargs):
            nonlocal count
            result = self.native(*args, **kwargs)
            if kwargs['operation'] == 5:
                count += 1
                if count == 1: self.steam.data = self.before
                else: raise ValueError('Rollback acknowledgement interrupted.')
            return result
        with self.assertRaisesRegex(ValueError, 'original library was retained/restored'):
            self.execute(native=uncertain_rollback)
        self.assertEqual(library_state(Profile(self.path.read_bytes())), library_state(Profile(self.before)))
        self.assertEqual(self.path.read_bytes(), self.steam.data)
        self.assertEqual(self.journal()['state'], 'rolled-back')
        self.assertIn('acknowledgement', self.journal()['rollbackTransportWarning'])

    def test_native_baseline_rejection_keeps_original_library_without_raw_restore(self):
        def rejected(*args, **kwargs):
            if kwargs['operation'] == 5:
                self.calls.append((5, kwargs['payload']))
                raise ValueError('Game editor has conflicting unsaved changes.')
            return self.native(*args, **kwargs)
        with self.assertRaisesRegex(ValueError, 'conflicting unsaved changes'):
            self.execute(native=rejected)
        self.assertEqual(self.path.read_bytes(), self.before)
        self.assertEqual(self.journal()['state'], 'rolled-back')

    def test_account_cloud_and_preview_conflicts_never_call_native(self):
        for kind in ('account', 'cloud', 'profile'):
            with self.subTest(kind=kind):
                self.steam.account = 'other' if kind == 'account' else 'account'
                self.steam.cloud = kind != 'cloud'
                self.path.write_bytes(self.before + b'changed' if kind == 'profile' else self.before)
                with self.assertRaises(ValueError): self.execute()
        self.assertFalse(self.calls)

    def test_collection_only_route_rejects_mutations_to_other_profile_fields(self):
        profile = Profile(self.before)
        data = copy.deepcopy(profile.data); data['progress'] = 999
        after = profile.serialize(data)
        with patch('trackgroups.presets.apply', return_value=(after, 'updated')):
            with self.assertRaisesRegex(ValueError, 'only change preset and track-group libraries'):
                self.execute(change={'mode':'quick'}, preset=True)
        self.assertFalse(self.calls)
        self.assertFalse((self.root/'backups').exists())


class CosmeticSubscriptionTests(unittest.TestCase):
    def run_worker(self, *, initially_ready=False, kind='cosmetic', account='account', cancel_after_subscribe=False):
        class Steam:
            account = 'account'
            ticks = 0
            subscribed = initially_ready
            calls = []
            def __init__(self, _): self.dll = self
            def close(self): pass
            def details(self, ids, *_): return {ids[0]:{'available':True, 'title':'Example character'}}
            def item_status(self, _): return {'subscribed':self.subscribed,'ready':initially_ready or self.ticks >= 2}
            def subscribe(self, *_):
                self.subscribed = True; self.calls.append('subscribe')
                if cancel_after_subscribe: (folder/'cancel').write_text('cancel')
            def ugc_call(self, name, *_): self.calls.append(name); return True
            def SteamAPI_RunCallbacks(self): self.ticks += 1
            def storage_call(self, *_): raise AssertionError('Subscribing needs no Cloud save access.')
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            write_json(folder/'request.json', {'action':'subscribe-cosmetic','game':'fixture','id':'123456789','account':account})
            with patch.object(worker, 'Steam', Steam), patch.object(worker, 'content_kind', return_value=kind), patch.object(worker.time, 'sleep'):
                worker.run(folder)
            return json.loads((folder/'result.json').read_text(encoding='utf-8')), Steam.calls

    def test_explicitly_resubscribes_an_already_ready_item_without_cloud_access(self):
        result, calls = self.run_worker(initially_ready=True)
        self.assertTrue(result['subscribed'])
        self.assertEqual(calls, ['subscribe'])
        self.assertEqual(result['items']['123456789']['kind'], 'cosmetic')

    def test_subscribes_downloads_and_verifies_cosmetic_content(self):
        result, calls = self.run_worker()
        self.assertTrue(result['status']['123456789']['ready'])
        self.assertEqual(calls, ['subscribe', 'DownloadItem'])

    def test_rejects_tracks_and_changed_accounts_before_subscribing(self):
        for kwargs in ({'kind':'track'}, {'account':'other'}):
            with self.subTest(kwargs=kwargs):
                result, calls = self.run_worker(**kwargs)
                self.assertIn('error', result)
                self.assertFalse(calls)

    def test_unverified_download_or_cancellation_retains_the_explicit_subscription(self):
        for kwargs in ({'kind':'unknown'}, {'cancel_after_subscribe':True}):
            with self.subTest(kwargs=kwargs):
                result, calls = self.run_worker(**kwargs)
                self.assertIn('error', result)
                self.assertEqual(result['newSubscriptions'], ['123456789'])
                self.assertEqual(calls, ['subscribe', 'DownloadItem'])


class RunningTrackWorkerTests(unittest.TestCase):
    def execute(self, action):
        before = fixture(); library_group = group(); library_group['tracks'] = library_group['tracks'][1:]
        class Steam:
            account = 'account'
            def __init__(self, _): self.dll = self; self.raw = before
            def close(self): pass
            def read_save(self, _): return self.raw
            def storage_call(self, _): return True
            def details(self, ids, *_): return {ids[0]:{'available':True,'modId':'example','title':'Track'}}
            def item_status(self, _): return {'subscribed':True,'ready':True}
            def installed(self, _): return True
            def SteamAPI_RunCallbacks(self):
                profile = Profile(self.raw); data = copy.deepcopy(profile.data); data['progress'] += 1
                self.raw = profile.serialize(data); path.write_bytes(self.raw)
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary); path = folder/'1009PTK_PlayerData_v19tpp0_bt0'; path.write_bytes(before)
            write_json(folder/'request.json', {'action':action,'game':'fixture-game','profile':path.name,'group':library_group,'expectedHash':digest(before),'account':'account'})
            with patch.object(worker, 'Steam', Steam), patch.object(worker, 'content_kind', return_value='track'), patch('trackgroups.runtime.PROFILE_DIR', folder), patch('trackgroups.runtime.DATA', folder), patch('trackgroups.runtime.game_running', return_value=True), patch('trackgroups.transaction.commit', return_value={'outcome':'added','live':True}) as save:
                worker.run(folder)
                result = json.loads((folder/'result.json').read_text(encoding='utf-8'))
                return result, save.call_args, path.read_bytes()

    def test_repair_is_available_while_running_and_never_commits_a_profile(self):
        result, save, _ = self.execute('repair')
        self.assertEqual(result['outcome'], 'repaired')
        self.assertIsNone(save)

    def test_install_rebases_progress_only_changes_and_passes_game_to_native_transaction(self):
        result, save, current = self.execute('install')
        self.assertEqual(result['outcome'], 'added')
        self.assertEqual(save.args[3], digest(current))
        self.assertEqual(save.kwargs['game'], 'fixture-game')


if __name__ == '__main__': unittest.main()
