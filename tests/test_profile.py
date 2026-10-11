import copy
import json
import unittest
from trackgroups.groups import validate, export_native
from trackgroups.profile import Profile, encode_length

ID = "58d56a74-7974-42f0-92ef-34f6b2361966"


def group():
    return {"format": "tk2-track-group", "version": 1, "id": ID, "revision": 1,
        "name": "Suomi — 雪", "tracks": [{"kind": "official", "configId": 44},
            {"kind": "workshop", "modId": "example", "workshopId": "3263970719"}]}


def profile():
    records = [b'[{"private":"preserve exactly"}]', b'separator', json.dumps({"progress": {"wins": 9},
        "unknownFutureField": [1, 2], "ItemsGroupDefinedContainers": []}).encode()]
    return b''.join(encode_length(len(x)) + x for x in records)


class ProfileTests(unittest.TestCase):
    def test_unchanged_roundtrip(self):
        data = profile()
        self.assertEqual(Profile(data).unchanged(), data)

    def test_import_preserves_records_progress_order_and_unicode(self):
        p = Profile(profile())
        raw, action = p.import_group(group())
        after = Profile(raw)
        self.assertEqual(action, 'added')
        self.assertEqual(after.spans[:2], p.spans[:2])
        self.assertEqual(after.data['progress'], p.data['progress'])
        self.assertEqual(after.data['unknownFutureField'], [1, 2])
        self.assertEqual(after.custom_groups()[0]['GroupDefinition']['Name'], group()['name'])
        self.assertEqual([t['configID'] for t in after.custom_groups()[0]['groupItems']], [44, -1])

    def test_duplicate_is_noop_and_update_requires_confirmation(self):
        raw, _ = Profile(profile()).import_group(group())
        self.assertEqual(Profile(raw).import_group(group()), (raw, 'unchanged'))
        updated = group(); updated['tracks'].reverse()
        with self.assertRaisesRegex(ValueError, 'Review'):
            Profile(raw).import_group(updated)
        result, action = Profile(raw).import_group(updated, allow_update=True)
        self.assertEqual(action, 'updated')
        self.assertEqual(Profile(result).custom_groups()[0]['GroupDefinition']['Index'], 0)

    def test_same_name_different_id_adds_numbered_copy(self):
        raw, _ = Profile(profile()).import_group(group())
        other = group(); other['id'] = '2609e34d-a412-43a0-9bbc-4026a9ffb000'
        result, _ = Profile(raw).import_group(other)
        self.assertEqual(Profile(result).custom_groups()[1]['GroupDefinition']['Name'], group()['name'] + ' (2)')

    def test_malformed_save_rejected(self):
        for data in [b'', profile()[:-1], profile() + b'extra', b'\xff' * 8]:
            with self.subTest(data=data[:8]), self.assertRaises((ValueError, UnicodeError)):
                Profile(data)

    def test_group_validation_rejects_private_fields_and_numeric_workshop_id(self):
        for mutation in [lambda g: g.update(playerData={}), lambda g: g['tracks'][1].update(workshopId=3263970719),
                         lambda g: g['tracks'].append(copy.deepcopy(g['tracks'][0]))]:
            g = group(); mutation(g)
            with self.assertRaises(ValueError): validate(g)

    def test_export_rejects_unresolved_workshop_and_excludes_profile(self):
        raw, _ = Profile(profile()).import_group(group())
        native = Profile(raw).custom_groups()[0]
        with self.assertRaisesRegex(ValueError, 'unresolved'): export_native(native, {})
        result = export_native(native, {'example': {'workshopId': '3263970719', 'title': 'Example'}})
        self.assertNotIn('progress', result)
        self.assertEqual(result['tracks'][1]['modId'], 'example')
