"""Lazy access to installed character clips, independent of the game process."""
import gzip
import hashlib
import json
from .unity_animation import decode_clip


def workshop_clips(prefab, root):
    from .models import _pointer
    for component in prefab.read_typetree().get('m_Component', []):
        obj = _pointer(prefab, component['component'])
        if not obj or obj.type.name != 'MonoBehaviour': continue
        config = _pointer(obj, obj.read_typetree().get('charAnimationsListSO'))
        if not config: continue
        tree = config.read_typetree()
        for index, name in enumerate(('CharacterA','CharacterB','CharacterC')):
            if index >= len(root['children']): break
            for section, pointers in tree.get(name, {}).items():
                # Item-model clips target separate weapon prefabs, not this rig.
                if not isinstance(pointers, list) or section.startswith('ItemsModelAnim'): continue
                for pointer in pointers:
                    clip = _pointer(config, pointer)
                    if clip and clip.type.name == 'AnimationClip':
                        name = clip.peek_name()
                        yield section+'/'+name, section, name, clip, root['children'][index]['path']


def choices(prefab, root):
    return list({key:{'id':key, 'category':section, 'name':name.replace('_',' ')}
                 for key,section,name,_,_ in workshop_clips(prefab,root)}.values())


def animation(appearance, identity, selection):
    from .models import _source, _read_cache, _cache, _load_asset, model
    if not isinstance(selection, str) or not 1 <= len(selection) <= 240:
        raise ValueError('Choose an installed animation.')
    reference, game, bundles, cache = _source(appearance, 'characters', identity)
    cache = cache.with_name('animation-'+hashlib.sha256((cache.name+selection).encode()).hexdigest()+'.json.gz')
    cached = _read_cache(cache)
    if cached: return cached
    root = json.loads(gzip.decompress(model(appearance, 'characters', identity)))['root']
    if 'characterType' in reference:
        from .native_menu import character_presentation
        clips = character_presentation(game, reference['characterType'], root, selected=selection)['selectedAnimations']
    else:
        _, prefab = _load_asset(reference, bundles)
        clips = [decoded for key,_,_,clip,prefix in workshop_clips(prefab,root) if key == selection
                 and (decoded := decode_clip(clip,root,prefix))]
    if not clips: raise ValueError('This clip has no supported character transform animation.')
    raw = gzip.compress(json.dumps({'animations':clips},separators=(',',':')).encode())
    _cache(cache, raw)
    return raw
