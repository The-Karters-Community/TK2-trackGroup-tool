"""Public track-library display and scoped subscription summaries."""
import json
from functools import lru_cache
from .runtime import ROOT


@lru_cache(maxsize=1)
def official():
    return json.loads((ROOT/'catalog/official-tracks.json').read_text(encoding='utf-8'))


def library(items, statuses):
    tracks = [{'kind':'official', 'configId':int(key), 'title':value['title'], 'image':value.get('image'), 'ready':True}
              for key,value in official().items()]
    for item, info in items.items():
        status = statuses.get(item, {})
        if info.get('kind') != 'track' or not info.get('available') or not info.get('modId'): continue
        tracks.append({'kind':'workshop', 'workshopId':item, 'modId':info['modId'],
            'title':info.get('title', item), 'image':info.get('previewUrl'),
            'ready':bool(status.get('ready')), 'subscribed':bool(status.get('subscribed'))})
    return tracks


def summary(items, statuses, groups):
    subscribed = {i for i,info in items.items() if info.get('kind') == 'track' and statuses.get(i,{}).get('subscribed')}
    pending = sum(not statuses[i].get('ready') for i in subscribed)
    used = {t.get('workshopId') for g in groups for t in g.get('tracks', []) if t.get('workshopId')}
    missing = sum(not statuses.get(i,{}).get('subscribed') or not statuses.get(i,{}).get('ready') for i in used)
    message = f'Steam connected. {len(subscribed)-pending} subscribed tracks downloaded.'
    if pending: message += f' {pending} subscribed tracks are waiting for download.'
    if missing: message += f' {missing} tracks used by My groups need attention.'
    return {'message':message, 'downloaded':len(subscribed)-pending, 'pendingDownloads':pending, 'groupMissing':missing}
