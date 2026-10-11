"""Reviewed JSON library. Remote entries are data, never executable extensions."""
import hashlib
import json
from pathlib import Path
import re
import time
import urllib.request

from .groups import validate
from .runtime import DATA, ROOT, write_json

BASE = "https://raw.githubusercontent.com/The-Karters-Community/TK2-trackGroup-tool/main/catalog/"
NAME = re.compile(r"^[0-9a-f-]{36}\.tk2group\.json$")


def decode(raw):
    if len(raw) > 1024 * 1024:
        raise ValueError("Group file exceeds 1 MiB.")
    return validate(json.loads(raw))


def read_catalog(folder):
    index = json.loads((folder / "index.json").read_text(encoding="utf-8"))
    if index.get("version") != 1 or not isinstance(index.get("groups"), list) or len(index["groups"]) > 1000:
        raise ValueError("Invalid catalog index.")
    result = []
    ids = set()
    for entry in index["groups"]:
        name = entry["file"]
        if not NAME.fullmatch(name): raise ValueError("Invalid catalog filename.")
        raw = (folder / name).read_bytes()
        if hashlib.sha256(raw).hexdigest() != entry["sha256"]: raise ValueError("Catalog checksum mismatch.")
        group = decode(raw)
        if name != group["id"] + ".tk2group.json" or group["id"] in ids: raise ValueError("Duplicate or mismatched group ID.")
        ids.add(group["id"])
        result.append(group)
    return result


def fetch(name):
    request = urllib.request.Request(BASE + name, headers={"User-Agent": "TK2-Track-Groups/0.1"})
    with urllib.request.urlopen(request, timeout=8) as response:
        raw = response.read(1024 * 1024 + 1)
    if len(raw) > 1024 * 1024: raise ValueError("Catalog download exceeds limit.")
    return raw


def refresh(cancelled=lambda: False):
    deadline = time.monotonic() + 120
    index_raw = fetch("index.json")
    index = json.loads(index_raw)
    if index.get("version") != 1 or not isinstance(index.get("groups"), list) or len(index["groups"]) > 1000:
        raise ValueError("Unsupported remote catalog.")
    entries = []
    for entry in index["groups"]:
        if cancelled(): raise ValueError("Library refresh cancelled. Offline library retained.")
        if time.monotonic() > deadline: raise ValueError("Library refresh timed out. Offline library retained.")
        name = entry["file"]
        if not NAME.fullmatch(name): raise ValueError("Unsafe catalog filename.")
        raw = fetch(name)
        group = decode(raw)
        if group["id"] + ".tk2group.json" != name or hashlib.sha256(raw).hexdigest() != entry["sha256"]:
            raise ValueError("Remote group ID or checksum does not match.")
        entries.append(group)
    if len({g["id"] for g in entries}) != len(entries): raise ValueError("Duplicate remote groups.")
    write_json(DATA / "catalog-cache.json", entries)
    return entries


def load():
    try:
        values = json.loads((DATA / "catalog-cache.json").read_text(encoding="utf-8"))
        if not isinstance(values, list) or len(values) > 1000: raise ValueError()
        return [validate(x) for x in values]
    except (OSError, ValueError, KeyError, TypeError):
        return read_catalog(ROOT / "catalog")
