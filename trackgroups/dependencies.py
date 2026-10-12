"""Persistent public track identities, independent of Steam subscriptions."""
import json
from urllib.parse import urlsplit
from .runtime import DATA, write_json


class Dependencies:
    def __init__(self, path=None):
        self.path = path or DATA / 'dependencies.json'
        self.items = {}
        try:
            self.remember(json.loads(self.path.read_text(encoding='utf-8')), save=False)
        except (OSError, ValueError, TypeError, AttributeError):
            pass

    def remember(self, values, *, save=True):
        for item, value in values.items():
            if not isinstance(item, str) or not item.isdecimal() or not 0 < int(item) < 2**64:
                continue
            if not isinstance(value, dict) or not value.get('modId'):
                continue
            # Never cache account, owner or upload metadata. Availability is refreshed separately.
            self.items[item] = {'workshopId': item, 'modId': str(value['modId']),
                                'title': str(value.get('title', value['modId'])), 'available': True}
            url = value.get('previewUrl', '')
            if isinstance(url, str) and urlsplit(url).scheme == 'https' and urlsplit(url).hostname in ('images.steamusercontent.com', 'steamuserimages-a.akamaihd.net'):
                self.items[item]['previewUrl'] = url
        if save:
            write_json(self.path, self.items)

    def catalog(self, groups):
        self.remember({t['workshopId']: t for g in groups for t in g['tracks'] if t['kind'] == 'workshop'})

    def mapping(self):
        return {v['modId']: v for v in self.items.values()}
