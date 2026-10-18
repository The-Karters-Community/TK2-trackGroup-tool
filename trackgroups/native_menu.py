"""Resolve installed menu presentation records without loading the scene.

Read the serialized object table and identify PTK_PlayerPreviewItem by its
MonoScript, rather than assuming an absolute byte offset from one game build.
Only the small presentation record is decoded; no scene objects are created.
"""
from functools import lru_cache
from pathlib import Path
import struct
from types import SimpleNamespace

from .unity_animation import decode_clip


def _body_offset(raw):
    if len(raw) < 32:
        raise ValueError('Incomplete native component header.')
    length = struct.unpack_from('<i', raw, 28)[0]
    if not 0 <= length < len(raw) - 32:
        raise ValueError('Unsupported native component header.')
    return 32 + (length + 3) // 4 * 4


def _presentation_record(raw, externals):
    body = _body_offset(raw)
    if len(raw) < body + 44:
        raise ValueError('Incomplete installed character presentation.')
    count = struct.unpack_from('<i', raw, body + 40)[0]
    if not 1 <= count <= 20 or body + 44 + count * 40 > len(raw):
        raise ValueError('Unsupported installed character animation table.')

    def reference(offset, expected):
        external, identity = struct.unpack_from('<iq', raw, offset)
        if identity == 0:
            return None
        if not 1 <= external <= len(externals) or externals[external - 1] != expected:
            raise ValueError('Unsupported installed presentation dependency.')
        return identity

    overrides = {}
    for i in range(count):
        offset = body + 44 + i * 40
        identity = struct.unpack_from('<i', raw, offset)[0]
        if identity in overrides or not 0 <= identity < 20:
            raise ValueError('Invalid installed character animation identity.')
        overrides[identity] = tuple(reference(offset + 4 + j * 12, 'sharedassets5.assets') for j in range(3))
    worker = reference(body + 16, 'sharedassets1.assets')
    if not worker or not any(any(refs) for refs in overrides.values()):
        raise ValueError('Installed character presentation has no usable references.')
    return overrides, worker


@lru_cache(maxsize=4)
def _locate_presentation(path, size, modified, scripts_size, scripts_modified):
    # Stat arguments invalidate the small result on an in-place game update.
    # UnityPy parses only the type definitions, not the million scene objects.
    import UnityPy
    from UnityPy.files.SerializedFile import SerializedType, FileIdentifier, LocalSerializedObjectIdentifier
    from UnityPy.streams import EndianBinaryReader

    with path.open('rb') as stream:
        header = stream.read(48)
        if len(header) != 48 or struct.unpack_from('>I', header, 8)[0] != 22 or header[16] != 0:
            raise ValueError('Unsupported installed menu serialization format.')
        metadata_size, file_size, data_offset = struct.unpack_from('>Iqq', header, 20)
        if file_size != size or not 0 < metadata_size <= 64 * 1024 * 1024 or not 48 + metadata_size <= data_offset <= size:
            raise ValueError('Invalid installed menu metadata boundaries.')
        metadata = stream.read(metadata_size)
    reader = EndianBinaryReader(metadata, endian='<')
    reader.read_string_to_null()  # Unity version
    reader.read_int()  # build target
    has_tree = reader.read_boolean()
    type_count = reader.read_int()
    if not 0 < type_count <= 4096:
        raise ValueError('Invalid installed menu type table.')
    file = SimpleNamespace(header=SimpleNamespace(version=22), _enable_type_tree=has_tree)
    types = [SerializedType(reader, file, False) for _ in range(type_count)]
    object_count = reader.read_int()
    reader.align_stream()
    table_start = reader.Position
    table_end = table_start + object_count * 24
    if not 0 < object_count <= 2_000_000 or table_end > len(metadata):
        raise ValueError('Invalid installed menu object table.')
    reader.Position = table_end
    script_count = reader.read_int()
    if not 0 <= script_count <= 100_000:
        raise ValueError('Invalid installed menu script table.')
    scripts = [LocalSerializedObjectIdentifier(file.header, reader) for _ in range(script_count)]
    external_count = reader.read_int()
    if not 0 < external_count <= 256:
        raise ValueError('Invalid installed menu dependency table.')
    externals = [FileIdentifier(file.header, reader).name for _ in range(external_count)]
    script_file = UnityPy.load(str(path.parent / 'globalgamemanagers.assets')).assets[0]
    preview_types = set()
    for index, entry in enumerate(types):
        if entry.class_id != 114 or not 0 <= entry.script_type_index < len(scripts):
            continue
        script = scripts[entry.script_type_index]
        external = script.local_serialized_file_index
        if not 1 <= external <= len(externals) or externals[external - 1] != 'globalgamemanagers.assets':
            continue
        obj = script_file.objects.get(script.local_identifier_in_file)
        if obj is None or obj.type.name != 'MonoScript':
            continue
        definition = obj.read()
        if definition.m_ClassName == 'PTK_PlayerPreviewItem' and definition.m_AssemblyName.removesuffix('.dll') == 'Assembly-CSharp':
            preview_types.add(index)
    presentations = []
    with path.open('rb') as stream:
        for _, offset, length, type_id in struct.iter_unpack('<qqIi', memoryview(metadata)[table_start:table_end]):
            if type_id not in preview_types:
                continue
            if not 76 <= length <= 16384 or offset < 0 or data_offset + offset + length > size:
                raise ValueError('Invalid installed character presentation boundaries.')
            stream.seek(data_offset + offset)
            presentations.append(_presentation_record(stream.read(length), externals))
    if not presentations or any(item != presentations[0] for item in presentations[1:]):
        raise ValueError('The installed character presentation could not be resolved consistently.')
    return presentations[0]


def character_presentation(game, character_type, root, selected=None):
    import UnityPy
    from UnityPy.classes.PPtr import PPtr
    directory = Path(game) / 'TheKarters2_Data'
    path = directory / 'level5'
    scene_stat = path.stat()
    scripts_stat = (directory / 'globalgamemanagers.assets').stat()
    overrides, worker_config = _locate_presentation(path, scene_stat.st_size, scene_stat.st_mtime_ns,
                                                   scripts_stat.st_size, scripts_stat.st_mtime_ns)
    refs = overrides.get(character_type)
    if not refs:
        raise ValueError('No installed menu animation exists for this character type.')
    env = UnityPy.load(str(directory / 'sharedassets5.assets'))
    file = env.assets[0]
    animations = []
    standing = []
    chosen = []
    choices = {}
    for index, identity in enumerate(refs):
        if not identity or index >= len(root['children']):
            continue
        controller = file.objects[identity].read()
        for entry in controller.m_Clips:
            name = entry.m_OriginalClip.read().m_Name
            choices[name] = {'id':name, 'category':'Game animations', 'name':{'jazda_idle':'Seated idle','idle_w_menu':'Standing menu idle','wybor_w_menu':'Menu selection'}.get(name,name.replace('_',' '))}
            if selected == name or selected is None and name in ('jazda_idle', 'idle_w_menu'):
                animation = decode_clip(entry.m_OverrideClip.deref(), root, root['children'][index]['path'])
                if animation: (chosen if selected is not None else animations if name == 'jazda_idle' else standing).append(animation)
    if selected is not None:
        return {'selectedAnimations':chosen}
    if not animations:
        raise ValueError('The original character idle pose could not be decoded.')
    # The character-worker array supplies the exact seated offset/scale used by
    # SetPlayerInCorrectPosition. Its dependency was validated by file name.
    workers_env = UnityPy.load(str(directory / 'sharedassets1.assets'))
    workers_file = workers_env.assets[0]
    config = workers_file.objects[worker_config]
    config_raw = config.get_raw_data()
    offset = _body_offset(config_raw) + 12  # default worker PPtr
    count = struct.unpack_from('<i', config_raw, offset)[0]
    if not 0 <= count <= 20:
        raise ValueError('Invalid character-worker count.')
    for i in range(count):
        external, identity = struct.unpack_from('<iq', config_raw, offset + 4 + i * 12)
        worker = PPtr(m_FileID=external, m_PathID=identity, assetsfile=workers_file).deref()
        worker_raw = worker.get_raw_data()
        if struct.unpack_from('<i', worker_raw, _body_offset(worker_raw))[0] != character_type:
            continue
        go = worker.parse_monobehaviour_head().m_GameObject.read()
        transform = go.m_Component[0].component.read()
        return {'animations':animations, 'standingAnimations':standing, 'animationChoices':list(choices.values()),
                'offset':[getattr(transform.m_LocalPosition, axis) for axis in 'xyz'],
                'rotation':[getattr(transform.m_LocalRotation, axis) for axis in 'xyzw'],
                'scale':[getattr(transform.m_LocalScale, axis) for axis in 'xyz']}
    raise ValueError('The installed character seating transform is unavailable.')
