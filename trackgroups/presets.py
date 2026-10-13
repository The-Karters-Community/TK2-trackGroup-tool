"""Portable customization presets for verified game build 0.1.4.18.

Only allowlisted cosmetic fields leave a profile. Native extension fields stay
in the save. Imported preset IDs are allocated locally; group links are remapped.
"""
import copy
from datetime import datetime
import json
import re
import uuid

from .groups import validate_name
from .profile import Profile, encode_length

FIELDS = ('iCharacterSkinMaterialID', 'iVehicleMaterialID', 'iWheelMaterialID',
          'iCharacterSkinMaterialID_Modded', 'iVehicleMaterialID_Modded', 'iWheelMaterialID_Modded')
STICKER_FIELDS = ('iStickerMaterialID', 'iStickerMaterialID_SettingsPacked',
                  'iStickerMaterialID_Modded', 'iStickerMaterialID_Modded_SettingsPacked')
ALLOWED = (*FIELDS, 'bUsingModdedVersion', 'stickersData')


def integer(value):
    if type(value) is not int or not -(2**31) <= value < 2**31:
        raise ValueError('Cosmetic configuration IDs must be signed 32-bit integers.')
    return value


def cosmetic(value, strict=False):
    if not isinstance(value, dict) or (strict and set(value) != set(ALLOWED)):
        raise ValueError('Unsupported or private preset fields.')
    result = {k: integer(value.get(k)) for k in FIELDS}
    if type(value.get('bUsingModdedVersion')) is not bool:
        raise ValueError('Invalid original/modded selection.')
    stickers = value.get('stickersData')
    if not isinstance(stickers, list) or len(stickers) != 20:
        raise ValueError('A preset must preserve all 20 sticker slots.')
    result['bUsingModdedVersion'] = value['bUsingModdedVersion']
    result['stickersData'] = []
    for sticker in stickers:
        if not isinstance(sticker, dict) or (strict and set(sticker) != set(STICKER_FIELDS)):
            raise ValueError('Unsupported sticker fields.')
        result['stickersData'].append({k: integer(sticker.get(k)) for k in STICKER_FIELDS})
    return result


def read(profile):
    presets = json.loads(profile.records[0])
    if not isinstance(presets, list) or len(presets) > 10000:
        raise ValueError('Unsupported preset record.')
    seen = set()
    for preset in presets:
        cosmetic(preset)
        identity = integer(preset.get('iPresetID'))
        if identity in seen: raise ValueError('Duplicate native preset IDs.')
        seen.add(identity)
    return presets


def custom_group(group):
    d = group.get('GroupDefinition', {})
    return d.get('Type') == 1 and d.get('SubType') == 4 and d.get('IsDefault') is False


def view(profile):
    presets = read(profile)
    return {'presets': [{'id': p['iPresetID'], 'data': cosmetic(p)} for p in presets],
            'groups': [{'id': g['GroupDefinition']['UniqueID'], 'name': g['GroupDefinition']['Name'],
                        'members': [i['iPresetID'] for i in g.get('groupItems', [])],
                        'editable': g['GroupDefinition'].get('CanBeModified', True)}
                       for g in sorted(profile.groups, key=lambda g: g.get('GroupDefinition', {}).get('Index', 0)) if custom_group(g)]}


def validate_pack(pack):
    if not isinstance(pack, dict) or set(pack) != {'format','version','gameBuild','presets','groups'} or pack.get('format') != 'tk2-presets' or type(pack.get('version')) is not int or pack['version'] != 1 or pack.get('gameBuild') != '0.1.4.18':
        raise ValueError('Expected tk2-presets version 1 for game 0.1.4.18.')
    if not isinstance(pack['presets'], list) or not 1 <= len(pack['presets']) <= 1000 or not isinstance(pack['groups'], list) or len(pack['groups']) > 100:
        raise ValueError('Select 1–1000 presets and up to 100 groups.')
    keys = set()
    for entry in pack['presets']:
        if not isinstance(entry, dict) or set(entry) != {'key', 'data'} or not isinstance(entry['key'], str) or not re.fullmatch(r'[a-zA-Z0-9:_-]{1,100}', entry['key']) or entry['key'] in keys:
            raise ValueError('Invalid or duplicate portable preset key.')
        keys.add(entry['key']); cosmetic(entry['data'], strict=True)
    ids = set()
    for group in pack['groups']:
        if not isinstance(group, dict) or set(group) != {'id','name','presets'}:
            raise ValueError('Unsupported preset group fields.')
        try:
            if str(uuid.UUID(group['id'])) != group['id']: raise ValueError()
        except (ValueError, TypeError, AttributeError): raise ValueError('Invalid preset group ID.')
        if group['id'] in ids: raise ValueError('Duplicate preset group ID.')
        ids.add(group['id']); validate_name(group['name'])
        members = group['presets']
        if not isinstance(members, list) or not members or len(members) > 1000 or any(not isinstance(k,str) or k not in keys for k in members) or len(set(members)) != len(members):
            raise ValueError('Preset group has missing or duplicate members.')
    return pack


def export(profile, ids, groups):
    state = view(profile)
    selected = [g for g in state['groups'] if g['id'] in groups]
    if len(selected) != len(set(groups)): raise ValueError('Preset group no longer exists.')
    wanted = set(ids) | {i for g in selected for i in g['members']}
    entries = [p for p in state['presets'] if p['id'] in wanted]
    if {p['id'] for p in entries} != wanted: raise ValueError('A selected preset or group member is missing.')
    return validate_pack({'format':'tk2-presets','version':1,'gameBuild':'0.1.4.18',
        'presets':[{'key':f"preset:{p['id']}", 'data':p['data']} for p in entries],
        'groups':[{'id':g['id'],'name':g['name'],'presets':[f'preset:{i}' for i in g['members']]} for g in selected]})


def serialize(profile, presets, data):
    first = json.dumps(presets, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode()
    third = json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode()
    unchanged_first = json.loads(profile.records[0]) == presets
    unchanged_third = profile.data == data
    if unchanged_first and unchanged_third: return profile.original
    result = (profile.spans[0] if unchanged_first else encode_length(len(first)) + first) + profile.spans[1] + (profile.spans[2] if unchanged_third else encode_length(len(third)) + third)
    read(Profile(result))
    return result


def reserved_ids(presets, data):
    used = {p['iPresetID'] for p in presets}
    def walk(value):
        if isinstance(value, dict):
            if type(value.get('iPresetID')) is int: used.add(value['iPresetID'])
            for child in value.values(): walk(child)
        elif isinstance(value, list):
            for child in value: walk(child)
    for key in ('QuickCreationPreset','QuickCreationPresets'): walk(data.get(key))
    # Do not reuse dangling IDs referenced by any group or local player slot.
    walk(data.get('ItemsGroupDefinedContainers'))
    used.update(i for i in data.get('lastLocalChoosedPresetsIds', []) if type(i) is int)
    return used


def allocate(used):
    # Same verified native range as RandomRangeInt(100,999999).
    identity = next((i for i in range(100, 999999) if i not in used), None)
    if identity is None: raise ValueError('No preset IDs remain available.')
    used.add(identity)
    return identity


def save_group(containers, identity, name, members, *, update=False):
    validate_name(name)
    previous = next((g for g in containers if g['GroupDefinition']['UniqueID'] == identity), None)
    if previous:
        if not custom_group(previous) or previous['GroupDefinition'].get('CanBeModified') is False:
            raise ValueError('Protected groups cannot be edited.')
        if not update: raise ValueError('Confirm updating the existing preset group.')
        previous['GroupDefinition']['Name'] = name
        old = {i['iPresetID']:i for i in previous.get('groupItems', [])}
        previous['groupItems'] = [old.get(i, {'configID':-1,'modHashID':'','iPresetID':i}) for i in members]
    else:
        used_names = {g['GroupDefinition']['Name'] for g in containers}
        original = name; suffix = 2
        while name in used_names:
            name = f'{original} ({suffix})'; suffix += 1
        indices = [g['GroupDefinition'].get('Index',-1) for g in containers if g['GroupDefinition'].get('Type') == 1]
        containers.append({'$type':'ItemsGroupDefaultContainer', 'groupItems':[{'configID':-1,'modHashID':'','iPresetID':i} for i in members],
            'GroupDefinition': {'Index':max(indices,default=-1)+1,'UniqueID':identity,'Name':name,
                'ManuallySetUniqueID':False,'CanBeModified':True,'CanBeRemoved':True,'Type':1,'SubType':4,
                'MaxElementsCount':0,'IsForGP':False,'CreationDate':datetime.now().astimezone().isoformat(),'IsDefault':False}})


def apply(profile, change):
    presets = read(profile); data = copy.deepcopy(profile.data)
    groups = data['ItemsGroupDefinedContainers']; mode = change.get('mode')
    if mode == 'import':
        pack = validate_pack(change['pack']); used = reserved_ids(presets, data); mapping = {}; claimed = set()
        for entry in pack['presets']:
            match = next((p for p in presets if p['iPresetID'] not in claimed and cosmetic(p) == entry['data']), None)
            if match is None:
                match = {'iPresetID':allocate(used), **copy.deepcopy(entry['data'])}; presets.append(match)
            mapping[entry['key']] = match['iPresetID']
            claimed.add(match['iPresetID'])
        for group in pack['groups']:
            save_group(groups, group['id'], group['name'], [mapping[k] for k in group['presets']], update=change.get('confirmUpdate') is True)
    elif mode == 'preset':
        target = next((p for p in presets if p['iPresetID'] == change['presetId']), None)
        if target is None: raise ValueError('Preset no longer exists.')
        values = cosmetic(change['data'], strict=True)
        # Preserve native extension fields, including sticker extensions.
        target.update({k:v for k,v in values.items() if k != 'stickersData'})
        target['stickersData'] = [{**old, **new} for old,new in zip(target['stickersData'], values['stickersData'])]
    elif mode == 'duplicate':
        target = next((p for p in presets if p['iPresetID'] == change['presetId']), None)
        if target is None: raise ValueError('Preset no longer exists.')
        new = copy.deepcopy(target); new['iPresetID'] = allocate(reserved_ids(presets, data)); presets.append(new)
        if change.get('groupId'):
            group = next((g for g in groups if g['GroupDefinition']['UniqueID'] == change['groupId'] and custom_group(g)), None)
            if not group or group['GroupDefinition'].get('CanBeModified') is False: raise ValueError('Group cannot be edited.')
            group['groupItems'].append({'configID':-1,'modHashID':'','iPresetID':new['iPresetID']})
    elif mode == 'order':
        order = change['order']
        if not isinstance(order,list) or any(type(i) is not int for i in order) or len(order) != len(presets) or set(order) != {p['iPresetID'] for p in presets}: raise ValueError('Include each preset exactly once.')
        by_id = {p['iPresetID']:p for p in presets}; presets = [by_id[i] for i in order]
    elif mode == 'group':
        members = change['members']
        if not isinstance(members,list) or not members or any(type(i) is not int for i in members) or len(set(members)) != len(members) or not set(members) <= {p['iPresetID'] for p in presets}: raise ValueError('Choose existing presets once each.')
        identity = change['groupId']; uuid.UUID(identity)
        save_group(groups, identity, change['name'], members, update=True)
    elif mode == 'group-order':
        custom = [g for g in groups if custom_group(g)]
        order = change['order']
        if not isinstance(order,list) or len(order) != len(custom) or any(not isinstance(i,str) for i in order) or set(order) != {g['GroupDefinition']['UniqueID'] for g in custom}: raise ValueError('Include each custom preset group exactly once.')
        by_id = {g['GroupDefinition']['UniqueID']:g for g in custom}
        indices = sorted(g['GroupDefinition']['Index'] for g in custom)
        for identity, index in zip(order, indices):
            definition = by_id[identity]['GroupDefinition']
            if definition.get('CanBeModified') is False and definition['Index'] != index: raise ValueError('Protected groups cannot be reordered.')
            definition['Index'] = index
    elif mode == 'delete-group':
        target = next((g for g in groups if g['GroupDefinition']['UniqueID'] == change['groupId']), None)
        if not target or not custom_group(target) or target['GroupDefinition'].get('CanBeRemoved') is False: raise ValueError('Group cannot be removed.')
        groups.remove(target)
    elif mode == 'delete':
        identity = change['presetId']
        if identity in data.get('lastLocalChoosedPresetsIds', []): raise ValueError('This preset is selected for a local player. Choose a different preset in the game first.')
        if len(presets) <= 1: raise ValueError('Keep at least one preset.')
        target = next((p for p in presets if p['iPresetID'] == identity), None)
        if not target: raise ValueError('Preset no longer exists.')
        # Unmapped history/quick-creation references must not be guessed away.
        for key in ('recentlyUsedPresets','QuickCreationPreset','QuickCreationPresets'):
            if re.search(r'(?<!\d)' + str(identity) + r'(?!\d)', json.dumps(data.get(key))): raise ValueError('Preset is referenced by history or quick setup. Remove it in the game instead.')
        for group in groups:
            if custom_group(group):
                if group['GroupDefinition'].get('CanBeModified') is False and any(i['iPresetID'] == identity for i in group.get('groupItems', [])): raise ValueError('Preset is used by a protected group.')
                group['groupItems'] = [i for i in group.get('groupItems', []) if i['iPresetID'] != identity]
        presets.remove(target)
    else: raise ValueError('Unknown preset operation.')
    return serialize(profile, presets, data), 'updated'
