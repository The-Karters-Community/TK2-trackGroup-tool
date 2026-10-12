"""Verified 0.1.4.18 profile: three .NET BinaryWriter UTF-8 strings."""
import copy
from datetime import datetime
import json
import re

SAVE_NAME = re.compile(r"^\d+PTK_PlayerData_v19tpp0_bt0$")
MAX_SAVE = 32 * 1024 * 1024


def encode_length(number):
    if not 0 <= number <= MAX_SAVE:
        raise ValueError("Invalid profile record size.")
    result = bytearray()
    while number >= 128:
        result.append((number & 127) | 128)
        number >>= 7
    result.append(number)
    return bytes(result)


class Profile:
    def __init__(self, data):
        if not data or len(data) > MAX_SAVE:
            raise ValueError("Unsupported or oversized profile.")
        self.original = data
        self.records = []
        self.spans = []
        pos = 0
        for _ in range(3):
            start = pos
            size = 0
            for shift in range(0, 35, 7):
                if pos >= len(data):
                    raise ValueError("Truncated profile record.")
                number = data[pos]
                pos += 1
                size |= (number & 127) << shift
                if number < 128:
                    break
            else:
                raise ValueError("Invalid profile length prefix.")
            if size > MAX_SAVE or pos + size > len(data):
                raise ValueError("Truncated profile data.")
            self.records.append(data[pos:pos + size].decode("utf-8"))
            pos += size
            self.spans.append(data[start:pos])
        if pos != len(data):
            raise ValueError("Unknown trailing profile data; importing is disabled.")
        self.data = json.loads(self.records[2])
        if not isinstance(self.data, dict) or not isinstance(self.data.get("ItemsGroupDefinedContainers"), list):
            raise ValueError("Profile has no supported track group list.")
        self.groups = self.data["ItemsGroupDefinedContainers"]

    def custom_groups(self):
        return [copy.deepcopy(g) for g in self.groups if
                g.get("GroupDefinition", {}).get("Type") == 0 and
                g["GroupDefinition"].get("SubType") == 0 and
                not g["GroupDefinition"].get("IsDefault", True)]

    def unchanged(self):
        return self.original

    def serialize(self, data):
        raw = json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
        result = self.spans[0] + self.spans[1] + encode_length(len(raw)) + raw
        Profile(result)
        return result

    def rename_group(self, identity, name):
        from .groups import validate_name
        validate_name(name)
        data = copy.deepcopy(self.data)
        existing = next((g for g in data['ItemsGroupDefinedContainers'] if g['GroupDefinition']['UniqueID'] == identity), None)
        if not existing or existing not in self.custom_groups():
            raise ValueError("Choose an existing custom track group to rename.")
        definition = existing['GroupDefinition']
        if not definition.get('CanBeModified', True): raise ValueError("This group cannot be renamed.")
        if definition['Name'] == name: return self.original, 'unchanged'
        if any(g['GroupDefinition']['Name'] == name and g['GroupDefinition']['UniqueID'] != identity for g in self.groups):
            raise ValueError("Another group already uses that name. Choose a distinct name.")
        definition['Name'] = name
        return self.serialize(data), 'renamed'

    def edit_group(self, identity, name, order):
        renamed, _ = self.rename_group(identity, name)
        p = Profile(renamed)
        existing = next(g for g in p.custom_groups() if g['GroupDefinition']['UniqueID'] == identity)
        size = len(existing['groupItems'])
        if not isinstance(order, list) or len(order) != size or any(type(i) is not int for i in order) or sorted(order) != list(range(size)):
            raise ValueError('Track order must include each existing track exactly once.')
        if order == list(range(size)):
            return renamed, 'unchanged' if renamed == self.original else 'renamed'
        target = next(g for g in p.groups if g['GroupDefinition']['UniqueID'] == identity)
        target['groupItems'] = [existing['groupItems'][i] for i in order]
        return p.serialize(p.data), 'updated'

    def validate_official_tracks(self, group):
        known = {item["configID"] for container in self.groups
                 if container["GroupDefinition"].get("IsDefault")
                 and container["GroupDefinition"].get("Type") == 0
                 and container["GroupDefinition"].get("SubType") == 0
                 for item in container.get("groupItems", []) if not item.get("modHashID")}
        for track in group["tracks"]:
            if track["kind"] == "official" and track["configId"] not in known:
                raise ValueError("Unknown official track configuration: " + str(track["configId"]))

    def import_group(self, group, *, allow_update=False):
        from .groups import validate, native_items
        group = validate(group)
        data = copy.deepcopy(self.data)
        containers = data["ItemsGroupDefinedContainers"]
        existing = next((g for g in containers if g["GroupDefinition"]["UniqueID"] == group["id"]), None)
        if existing is not None:
            d = existing["GroupDefinition"]
            if d.get("IsDefault", True) or d.get("Type") != 0 or d.get("SubType") != 0:
                raise ValueError("Built-in and non-track groups cannot be replaced.")
            if existing["groupItems"] == native_items(group) and d["Name"] == group["name"]:
                return self.original, "unchanged"
            if not allow_update:
                raise ValueError("Group exists. Review changes and confirm the update.")
            existing["groupItems"] = native_items(group)
            d["Name"] = group["name"]
            outcome = "updated"
        else:
            name = group["name"]
            used = {g["GroupDefinition"]["Name"] for g in containers}
            number = 2
            while name in used:
                name = f"{group['name']} ({number})"
                number += 1
            indices = [g["GroupDefinition"].get("Index", -1) for g in containers if
                       g["GroupDefinition"].get("Type") == 0 and g["GroupDefinition"].get("SubType") == 0]
            containers.append({"$type": "ItemsGroupDefaultContainer", "groupItems": native_items(group),
                "GroupDefinition": {"Index": max(indices, default=-1) + 1, "UniqueID": group["id"],
                    "ManuallySetUniqueID": False, "CanBeModified": True, "CanBeRemoved": True,
                    "Name": name, "Type": 0, "SubType": 0, "MaxElementsCount": 0,
                    "IsForGP": False, "CreationDate": datetime.now().astimezone().isoformat(), "IsDefault": False}})
            outcome = "added"
        return self.serialize(data), outcome
