"""Read the bounded JSON Addressables catalog shipped with the supported game."""
import base64
import json
from pathlib import Path
import struct


class Addressables:
    def __init__(self, path):
        try:
            self._read(Path(path))
        except (KeyError, TypeError, IndexError, struct.error, UnicodeError) as exc:
            raise ValueError('Malformed installed Addressables catalog.') from exc

    def _read(self, path):
        path = Path(path)
        if path.stat().st_size > 8 * 1024 * 1024:
            raise ValueError('Addressables catalog is too large.')
        data = json.loads(path.read_text(encoding='utf-8'))
        self.root = path.parent
        self.bundle_directory = self.root / 'StandaloneWindows64' if (self.root / 'StandaloneWindows64').is_dir() else self.root
        self.ids = data['m_InternalIds']
        keys = base64.b64decode(data['m_KeyDataString'], validate=True)
        buckets = base64.b64decode(data['m_BucketDataString'], validate=True)
        entries = base64.b64decode(data['m_EntryDataString'], validate=True)
        count = struct.unpack_from('<i', buckets)[0]
        if not 0 <= count <= 100_000:
            raise ValueError('Invalid catalog key count.')
        self.buckets = []
        self.keys = {}
        offset = 4
        for index in range(count):
            key_offset, length = struct.unpack_from('<ii', buckets, offset)
            offset += 8
            if not 0 <= length <= 100_000 or not 0 <= key_offset < len(keys):
                raise ValueError('Invalid catalog bucket.')
            self.buckets.append(struct.unpack_from('<' + 'i' * length, buckets, offset))
            offset += length * 4
            kind = keys[key_offset]
            if kind in (0,1):
                size = struct.unpack_from('<i', keys, key_offset + 1)[0]
                if not 0 <= size <= 64_000 or key_offset + 5 + size > len(keys):
                    raise ValueError('Invalid catalog string.')
                key = keys[key_offset+5:key_offset+5+size].decode('utf-8' if kind == 0 else 'utf-16le')
                self.keys[key] = index
        count = struct.unpack_from('<i', entries)[0]
        if not 0 <= count <= 100_000 or len(entries) != 4 + count * 28:
            raise ValueError('Invalid catalog entry count.')
        self.entries = [struct.unpack_from('<7i', entries, 4 + i * 28) for i in range(count)]
        if any(not 0 <= row < count for bucket in self.buckets for row in bucket):
            raise ValueError('Invalid catalog location index.')
        if any(not 0 <= row[0] < len(self.ids) or not -1 <= row[2] < len(self.buckets) for row in self.entries):
            raise ValueError('Invalid catalog dependency index.')

    def resolve(self, guid, asset=False):
        key = self.keys.get(guid)
        if key is None:
            return None
        candidates = self.buckets[key]
        if not candidates:
            return None
        # InstantiateAsync(key) uses the first matching location. Some shipped
        # Workshop catalogs intentionally register multiple prefabs under a key.
        selected = self.entries[candidates[0]]
        prefab = self.ids[selected[0]]
        if not prefab.casefold().endswith(('.prefab', '.asset') if asset else '.prefab'):
            return None
        seen = set()
        bundles = set()
        def dependencies(row):
            if row in seen:
                return
            if len(seen) > 1000:
                raise ValueError('Model dependency graph is too large.')
            seen.add(row)
            entry = self.entries[row]
            internal = self.ids[entry[0]].replace('\\', '/')
            if internal.endswith('.bundle'):
                name = internal.rsplit('/', 1)[-1]
                file = self.bundle_directory / name
                if file.is_file(): bundles.add(name)
            if entry[2] >= 0:
                for dependency in self.buckets[entry[2]]:
                    dependencies(dependency)
        dependencies(candidates[0])
        return {'directory':str(self.bundle_directory), 'prefab':prefab, 'bundles':sorted(bundles)} if bundles else None
