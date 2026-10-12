"""Resolve user-entered Workshop IDs into an ordered, portable group draft."""
import re
import uuid
from urllib.parse import urlsplit, parse_qs

from .groups import MAX_TRACKS, validate, validate_name


def parse_items(text):
    if not isinstance(text, str) or len(text) > 200000:
        raise ValueError("Paste Workshop item IDs or Steam Workshop links.")
    tokens = re.split(r"[\s,;]+", text.strip())
    ids = []
    for token in tokens:
        if token.startswith(('https://', 'http://')):
            url = urlsplit(token)
            if url.hostname != 'steamcommunity.com' or url.path != '/sharedfiles/filedetails/':
                raise ValueError("Use Steam Workshop item links or decimal IDs.")
            values = parse_qs(url.query).get('id', [])
            token = values[0] if len(values) == 1 else ''
        if not token.isascii() or not token.isdecimal() or not 0 < int(token) < 2**64 or token != str(int(token)):
            raise ValueError("Invalid Workshop item ID: " + token[:60])
        if token in ids: raise ValueError("Duplicate Workshop item ID: " + token)
        ids.append(token)
    if not 1 <= len(ids) <= MAX_TRACKS: raise ValueError("A group needs 1–1000 tracks.")
    return ids


def create_group(name, ids, metadata):
    name = validate_name(name)
    tracks = []
    for item in ids:
        info = metadata.get(item, {})
        if not info.get('available') or not info.get('modId'):
            raise ValueError("Workshop item is unavailable or is not a compatible TK2 track: " + item)
        tracks.append({'kind':'workshop', 'workshopId':item, 'modId':info['modId'],
                       'title':info.get('title', 'Workshop track ' + item)})
    return validate({'format':'tk2-track-group', 'version':1, 'id':str(uuid.uuid4()),
                     'revision':1, 'name':name, 'tracks':tracks})
