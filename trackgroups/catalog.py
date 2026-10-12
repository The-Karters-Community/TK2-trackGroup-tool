"""Reviewed JSON library. Remote entries are data, never executable extensions."""
import hashlib
import json
from pathlib import Path
import re
import time
import urllib.request

from .groups import validate
from .runtime import DATA, ROOT, write_json

REPOSITORY = "The-Karters-Community/TK2-trackGroup-tool"
BASE = "https://raw.githubusercontent.com/" + REPOSITORY + "/{revision}/catalog/"
NAME = re.compile(r"^[0-9a-f-]{36}\.tk2group\.json$")


def categorized(group, category='community'):
    if category not in ('speedrun', 'community'): raise ValueError('Unsupported catalog category.')
    return {**group, 'category':category}


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
        result.append(categorized(group, entry.get('category', 'community')))
    return result


def download(url):
    request = urllib.request.Request(url, headers={"User-Agent": "TK2-Track-Groups/0.1"})
    with urllib.request.urlopen(request, timeout=8) as response:
        raw = response.read(1024 * 1024 + 1)
    if len(raw) > 1024 * 1024: raise ValueError("Catalog download exceeds limit.")
    return raw


def resolve_revision():
    value = json.loads(download("https://api.github.com/repos/" + REPOSITORY + "/git/ref/heads/main"))
    revision = value.get("object", {}).get("sha", "")
    if not isinstance(revision, str) or not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("Invalid catalog revision. Offline library retained.")
    return revision


def fetch(name, revision):
    return download(BASE.format(revision=revision) + name)


def refresh(cancelled=lambda: False):
    deadline = time.monotonic() + 120
    revision = resolve_revision()
    index_raw = fetch("index.json", revision)
    index = json.loads(index_raw)
    if index.get("version") != 1 or not isinstance(index.get("groups"), list) or len(index["groups"]) > 1000:
        raise ValueError("Unsupported remote catalog.")
    entries = []
    for entry in index["groups"]:
        if cancelled(): raise ValueError("Library refresh cancelled. Offline library retained.")
        if time.monotonic() > deadline: raise ValueError("Library refresh timed out. Offline library retained.")
        name = entry["file"]
        if not NAME.fullmatch(name): raise ValueError("Unsafe catalog filename.")
        raw = fetch(name, revision)
        group = decode(raw)
        if group["id"] + ".tk2group.json" != name or hashlib.sha256(raw).hexdigest() != entry["sha256"]:
            raise ValueError("Remote group ID or checksum does not match.")
        entries.append(categorized(group, entry.get('category', 'community')))
    if len({g["id"] for g in entries}) != len(entries): raise ValueError("Duplicate remote groups.")
    write_json(DATA / "catalog-cache.json", entries)
    return merge_bundled(entries)


def merge_bundled(values):
    """A stale remote cache must not hide newly shipped reviewed collections."""
    bundled = read_catalog(ROOT / 'catalog')
    merged = {g['id']: g for g in bundled}
    for group in values:
        current = merged.get(group['id'])
        if current is None or group['revision'] > current['revision']:
            merged[group['id']] = group
    return list(merged.values())


def load():
    try:
        values = json.loads((DATA / "catalog-cache.json").read_text(encoding="utf-8"))
        if not isinstance(values, list) or len(values) > 1000: raise ValueError()
        labels = {g['id']:g['category'] for g in read_catalog(ROOT / 'catalog')}
        cached = [categorized(validate({k:v for k,v in x.items() if k != 'category'}), x.get('category', labels.get(x['id'], 'community'))) for x in values]
        return merge_bundled(cached)
    except (OSError, ValueError, KeyError, TypeError):
        return read_catalog(ROOT / "catalog")
