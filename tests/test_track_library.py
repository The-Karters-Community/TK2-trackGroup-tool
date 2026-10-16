import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from trackgroups.content import installed_kind
from trackgroups.track_library import library, summary
from trackgroups.worker import installation_status
from trackgroups.appearance import Appearance


class LibraryTests(unittest.TestCase):
    def test_cosmetic_downloads_are_not_validated_as_track_catalogs(self):
        class Steam:
            def item_status(self, item): return {'ready':True,'subscribed':True}
            def installed(self, item): raise ValueError('Not a track')
        self.assertTrue(installation_status(Steam(),'1',track=False)['ready'])
        self.assertFalse(installation_status(Steam(),'1')['ready'])

    def test_missing_community_entries_and_cosmetics_do_not_inflate_notifications(self):
        items={'1':{'kind':'track','available':True,'modId':'one'},'2':{'kind':'track','available':True,'modId':'two'},'3':{'kind':'cosmetic','modId':'character'}}
        statuses={'1':{'subscribed':True,'ready':True},'2':{'subscribed':False,'ready':False},'3':{'subscribed':True,'ready':True}}
        result=summary(items,statuses,[])
        self.assertEqual(result['downloaded'],1)
        self.assertEqual(result['groupMissing'],0)
        self.assertNotIn('need',result['message'])
        self.assertEqual(sum(t['kind']=='workshop' for t in library(items,statuses)),2)
        self.assertEqual(summary(items,statuses,[{'tracks':[{'workshopId':'2'}]}])['groupMissing'],1)

    def test_new_cosmetic_package_triggers_index_refresh_without_restart(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);game=root/'steamapps/common/Game';mods=game/'Mods';mods.mkdir(parents=True)
            appearance=Appearance(root/'cache',root/'profile')
            with patch.object(appearance,'refresh') as refresh, patch('trackgroups.appearance.time.monotonic',side_effect=[10,13]):
                appearance.observe(str(game));refresh.reset_mock()
                package=mods/'new/StandaloneWindows64';package.mkdir(parents=True)
                catalog=package/'catalog_config.json';catalog.write_text(json.dumps({'m_InternalIds':['Assets/Workshop_Content/Characters/Test/file.prefab']}))
                self.assertEqual(installed_kind(package.parent),'cosmetic')
                appearance.observe(str(game));refresh.assert_called_once_with(str(game))


    def test_completed_steam_change_updates_library_in_background_without_a_ui_job(self):
        import threading
        from types import SimpleNamespace
        from unittest.mock import Mock
        from trackgroups.service import Service
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);game=root/'steamapps/common/Game';game.mkdir(parents=True)
            manifest=root/'steamapps/workshop/appworkshop_2269950.acf';manifest.parent.mkdir(parents=True);manifest.write_text('before')
            service=Service.__new__(Service)
            service._library_retry_at=0;service._workshop_stamp=None;service.library_loading=False
            service.game=str(game);service.account='fixture';service.job=None;service.lock=threading.RLock()
            service.library_cancel=threading.Event();service.dependencies=SimpleNamespace(items={},remember=Mock());service.appearance=SimpleNamespace(refresh=Mock())
            service.observe_workshop();manifest.write_text('after download completed')
            payload={'account':'fixture','items':{'42':{'title':'New track','kind':'track'}},'status':{'42':{'ready':True,'subscribed':True}}}
            with patch('trackgroups.service.Worker') as worker:
                worker.return_value.request.return_value=payload
                service.observe_workshop();service.library_thread.join(timeout=2)
                self.assertFalse(service.library_thread.is_alive())
                self.assertEqual(worker.return_value.request.call_args.args[0],'library-snapshot')
            self.assertEqual(service.items,payload['items'])
            self.assertIsNone(service.job)
            service.appearance.refresh.assert_called_once_with(str(game))
