"""Portable, deliberately small group format. Never export a player's profile."""
import copy
import hashlib
import json
import uuid

MAX_TRACKS = 1000


def validate_name(name):
    if not isinstance(name, str) or not name.strip() or len(name) > 200 or any(ord(c) < 32 for c in name):
        raise ValueError("Group name must be 1–200 characters without control characters.")
    return name


def validate(value):
    if not isinstance(value, dict) or value.get("format") != "tk2-track-group" or value.get("version") != 1:
        raise ValueError("Unsupported track group format. Expected version 1.")
    allowed = {"format", "version", "id", "revision", "name", "description", "tracks"}
    if value.keys() - allowed:
        raise ValueError("Group contains unsupported fields; export only group metadata.")
    uuid.UUID(value["id"])
    if type(value.get("revision")) is not int or value["revision"] < 1:
        raise ValueError("Revision must be a positive integer.")
    validate_name(value.get("name"))
    if not isinstance(value.get("description", ""), str) or len(value.get("description", "")) > 4000:
        raise ValueError("Description is too long.")
    tracks = value.get("tracks")
    if not isinstance(tracks, list) or not 1 <= len(tracks) <= MAX_TRACKS:
        raise ValueError("A group needs 1–1000 tracks.")
    identities = set()
    for t in tracks:
        if not isinstance(t, dict) or t.keys() - {"kind", "configId", "modId", "workshopId", "title"}:
            raise ValueError("Invalid track fields.")
        if not isinstance(t.get("title", ""), str) or len(t.get("title", "")) > 300:
            raise ValueError("Invalid track title.")
        if t.get("kind") == "official":
            if type(t.get("configId")) is not int or not -(2**31) <= t["configId"] < 2**31 or t["configId"] == -1 or "modId" in t or "workshopId" in t:
                raise ValueError("Invalid official track ID.")
            identity = ("official", t["configId"])
        elif t.get("kind") == "workshop":
            item = t.get("workshopId")
            mod = t.get("modId")
            if not isinstance(item, str) or not item.isascii() or not item.isdecimal() or not 0 < int(item) < 2**64 or item != str(int(item)):
                raise ValueError("Workshop IDs must be canonical decimal strings.")
            if not isinstance(mod, str) or not mod or len(mod) > 300 or "configId" in t or any(ord(c) < 32 for c in mod):
                raise ValueError("Missing internal Workshop track identifier.")
            identity = ("workshop", mod)
        else:
            raise ValueError("Track kind must be official or workshop.")
        if identity in identities:
            raise ValueError("Duplicate track in group.")
        identities.add(identity)
    return copy.deepcopy(value)


def fingerprint(group):
    """Revision is editorial; content determines whether a local update is needed."""
    data = {key: group[key] for key in ("id", "name", "tracks")}
    return hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def export_native(native, mapping, revision=1):
    definition = native["GroupDefinition"]
    if definition.get("IsDefault") or definition.get("Type") != 0 or definition.get("SubType") != 0:
        raise ValueError("Export a custom racing-track group, not a built-in or preset group.")
    tracks = []
    for item in native["groupItems"]:
        if item["modHashID"]:
            info = mapping.get(item["modHashID"])
            if not info:
                raise ValueError(f"Workshop item unresolved: {item['modHashID']}. Refresh Steam metadata first.")
            tracks.append({"kind": "workshop", "modId": item["modHashID"], "workshopId": str(info["workshopId"]), "title": info["title"]})
        else:
            tracks.append({"kind": "official", "configId": item["configID"], "title": f"Official track {item['configID']}"})
    return validate({"format": "tk2-track-group", "version": 1, "id": definition["UniqueID"], "revision": revision, "name": definition["Name"], "description": "", "tracks": tracks})


def native_items(group):
    return [{"configID": t["configId"] if t["kind"] == "official" else -1,
             "modHashID": t.get("modId", ""), "iPresetID": -1} for t in group["tracks"]]
