"""Read the verified 0.1.4.18 menu's serialized character presentation data.

The narrow record locator avoids loading the million-object menu scene. Its
SHA-256 must match before any version-specific references are interpreted.
Nothing is executed, injected, or written to the game directory.
"""
import hashlib
from pathlib import Path
import struct

from .unity_animation import decode_clip


MENU_OFFSET = 175789888
MENU_SIZE = 560
MENU_RECORD_SHA256 = '193662ccf567a87bf38984f885e223f02f86327ae1315a9a153e5caa1972c30e'


def _body_offset(raw):
    length = struct.unpack_from('<i', raw, 28)[0]
    if not 0 <= length < len(raw) - 32:
        raise ValueError('Unsupported native component header.')
    return 32 + (length + 3) // 4 * 4


def character_presentation(game, character_type, root):
    import UnityPy
    from UnityPy.classes.PPtr import PPtr
    directory = Path(game) / 'TheKarters2_Data'
    with (directory / 'level5').open('rb') as stream:
        stream.seek(MENU_OFFSET)
        raw = stream.read(MENU_SIZE)
    if hashlib.sha256(raw).hexdigest() != MENU_RECORD_SHA256:
        raise ValueError('The installed menu layout differs from verified game build 0.1.4.18.')
    # MonoBehaviour header (32), bool+alignment (4), three PPtrs (36).
    offset = 76
    count = struct.unpack_from('<i', raw, 72)[0]
    overrides = {}
    for _ in range(count):
        identity = struct.unpack_from('<i', raw, offset)[0]
        overrides[identity] = [struct.unpack_from('<iq', raw, offset + 4 + i * 12) for i in range(3)]
        offset += 40
    refs = overrides.get(character_type)
    if not refs:
        raise ValueError('No installed menu animation exists for this character type.')
    env = UnityPy.load(str(directory / 'sharedassets5.assets'))
    file = env.assets[0]
    animations = []
    for index, (external, identity) in enumerate(refs):
        if not identity or index >= len(root['children']):
            continue
        if external != 2:
            raise ValueError('Unsupported menu animation reference.')
        controller = file.objects[identity].read()
        for entry in controller.m_Clips:
            if entry.m_OriginalClip.read().m_Name == 'jazda_idle':
                animation = decode_clip(entry.m_OverrideClip.deref(), root, root['children'][index]['path'])
                if animation: animations.append(animation)
                break
    if not animations:
        raise ValueError('The original character idle pose could not be decoded.')
    # The character-worker array supplies the exact seated offset/scale used by
    # SetPlayerInCorrectPosition. Resolve its reference from the verified record.
    external, identity = struct.unpack_from('<iq', raw, 48)
    if external != 4:
        raise ValueError('Unsupported character-worker reference.')
    workers_env = UnityPy.load(str(directory / 'sharedassets1.assets'))
    workers_file = workers_env.assets[0]
    config = workers_file.objects[identity]
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
        return {'animations':animations,
                'offset':[getattr(transform.m_LocalPosition, axis) for axis in 'xyz'],
                'rotation':[getattr(transform.m_LocalRotation, axis) for axis in 'xyzw'],
                'scale':[getattr(transform.m_LocalScale, axis) for axis in 'xyz']}
    raise ValueError('The installed character seating transform is unavailable.')
