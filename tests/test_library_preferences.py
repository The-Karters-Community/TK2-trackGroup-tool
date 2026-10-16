import unittest, tempfile, json
from pathlib import Path
from unittest.mock import patch
from trackgroups import library_preferences as prefs

class LibraryPreferencesTests(unittest.TestCase):
    def test_favorites_and_history_persist_outside_the_profile(self):
        value={'favorites':['preset:1','group:2'], 'activity':{'preset:1':{'added':1,'last':2,'count':3}}}
        with tempfile.TemporaryDirectory() as folder, patch.object(prefs,'PATH',Path(folder)/'library.json'):
            self.assertEqual(prefs.load(), {'favorites':[], 'activity':{}})
            prefs.save(value)
            self.assertEqual(prefs.load(),value)
            self.assertFalse(prefs.PATH.with_suffix('.json.tmp').exists())
    def test_rejects_oversized_and_nonfinite_history_without_overwriting(self):
        good={'favorites':[], 'activity':{}}
        bad=[{'favorites':['x'*301], 'activity':{}}, {'favorites':[], 'activity':{'p':{'count':float('nan')}}}, {'favorites':[], 'activity':{'p':{'path':'untrusted'}}}]
        with tempfile.TemporaryDirectory() as folder, patch.object(prefs,'PATH',Path(folder)/'library.json'):
            prefs.save(good)
            for value in bad:
                with self.assertRaises(ValueError): prefs.save(value)
                self.assertEqual(prefs.load(),good)
    def test_corrupt_file_falls_back_to_empty(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(prefs,'PATH',Path(folder)/'library.json'):
            prefs.PATH.write_text('{bad')
            self.assertEqual(prefs.load(), {'favorites':[], 'activity':{}})
