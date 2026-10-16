import threading
import unittest
from unittest.mock import Mock
from trackgroups.service import Service

class GroupPackTests(unittest.TestCase):
    def test_batch_export_keeps_order_and_excludes_review_metadata(self):
        service = Service.__new__(Service)
        service.lock = threading.RLock()
        group = {'format':'tk2-track-group','version':1,'id':'11111111-1111-1111-1111-111111111111','name':'Reviewed','revision':1,'category':'speedrun','tracks':[{'kind':'official','configId':267992}]}
        service.groups = [group]
        service.export = Mock(return_value={'name':'Local'})
        result = service.export_groups(['local',group['id']])
        self.assertEqual(result['format'],'tk2-track-groups')
        self.assertEqual([g['name'] for g in result['groups']],['Local','Reviewed'])
        self.assertNotIn('category',result['groups'][1])
        with self.assertRaises(ValueError): service.export_groups(['local','local'])
        with self.assertRaises(ValueError): service.export_groups([])
