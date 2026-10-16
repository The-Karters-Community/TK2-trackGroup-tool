"""Decode generic Unity transform clips from the owner's installed bundles.

The streamed/dense/constant channel layout follows Unity's serialized clip
format. Humanoid muscle retargeting and arbitrary script curves are unsupported.
"""
import bisect
import math
import struct
import zlib


def streamed_channels(data, count):
    raw = struct.pack('<' + 'I' * len(data), *data)
    channels = [[] for _ in range(count)]
    offset = 0
    while offset + 8 <= len(raw):
        time, keys = struct.unpack_from('<fi', raw, offset)
        offset += 8
        if not 0 <= keys <= count or offset + keys * 20 > len(raw):
            raise ValueError('Invalid streamed animation data.')
        for _ in range(keys):
            index, *coefficients = struct.unpack_from('<i4f', raw, offset)
            offset += 20
            if not 0 <= index < count:
                raise ValueError('Invalid animation channel.')
            channels[index].append((time, coefficients))
    return channels


def decode_clip(clip, root, animation_root=''):
    tree = clip.read_typetree()
    muscle = tree.get('m_MuscleClip', {})
    source = muscle.get('m_Clip', {}).get('data', {})
    if not source:
        return None
    streamed = source['m_StreamedClip']
    dense = source['m_DenseClip']
    constant = source.get('m_ConstantClip', {}).get('data', [])
    channels = streamed_channels(streamed['data'], streamed['curveCount'])
    times = [[frame[0] for frame in channel] for channel in channels]
    paths = {}
    def collect(node):
        path = node['path']
        if path == animation_root or path.startswith(animation_root + '/') or not animation_root:
            relative = path[len(animation_root):].lstrip('/') if animation_root else path
            paths[zlib.crc32(relative.encode()) & 0xffffffff] = node['id']
        for child in node['children']:
            collect(child)
    collect(root)
    start = max(0., float(muscle.get('m_StartTime', 0)))
    duration = min(10., max(.01, float(muscle.get('m_StopTime', 0)) - start))
    sample_times = [round(start + i * duration / max(1, math.ceil(duration * 15)), 6)
                    for i in range(math.ceil(duration * 15) + 1)]
    def value(index, time):
        if index < len(channels):
            frames = channels[index]
            if not frames:
                return 0.
            at = max(0, bisect.bisect_right(times[index], time) - 1)
            key_time, (a, b, c, d) = frames[at]
            dt = time - key_time if math.isfinite(key_time) else 0.
            return ((a * dt + b) * dt + c) * dt + d
        index -= len(channels)
        width = dense['m_CurveCount']
        if index < width:
            frame = max(0., min(dense['m_FrameCount'] - 1., (time - dense['m_BeginTime']) * dense['m_SampleRate']))
            lo = int(frame); hi = min(lo + 1, dense['m_FrameCount'] - 1)
            samples = dense['m_SampleArray']
            return samples[lo * width + index] * (1 - frame + lo) + samples[hi * width + index] * (frame - lo)
        index -= width
        if index >= len(constant):
            raise ValueError('Animation binding exceeds its channel data.')
        return constant[index]
    tracks = []
    index = 0
    for binding in tree.get('m_ClipBindingConstant', {}).get('genericBindings', []):
        attribute = binding['attribute']
        width = {1:3, 2:4, 3:3, 4:3}.get(attribute, 1) if binding['typeID'] == 4 else 1
        node = paths.get(binding['path'])
        if node and binding['typeID'] == 4 and attribute in (1, 2, 3, 4):
            values = [round(value(index + c, time), 6) for time in sample_times for c in range(width)]
            if not all(math.isfinite(x) for x in values):
                raise ValueError('Nonfinite animation values.')
            tracks.append({'node':node, 'property':{1:'position', 2:'quaternion', 3:'scale', 4:'euler'}[attribute],
                           'times':[round(t - start, 6) for t in sample_times], 'values':values})
        index += width
    if not tracks:
        return None
    return {'name':tree.get('m_Name', 'Idle'), 'duration':duration, 'tracks':tracks}
