"""Inspect IL2CPP capabilities without loading or fingerprinting a game DLL."""
from functools import lru_cache
from pathlib import Path
import struct


CORE_EXPORTS = frozenset(('il2cpp_domain_get', 'il2cpp_class_from_name', 'il2cpp_runtime_invoke'))


@lru_cache(maxsize=8)
def _inspect(path, modified, size):
    # Read only bounded PE metadata. Never LoadLibrary GameAssembly into Garage.
    with Path(path).open('rb') as stream:
        def read(offset, length):
            if offset < 0 or length < 0 or offset + length > size:
                raise ValueError('The game runtime has incomplete PE metadata.')
            stream.seek(offset)
            data = stream.read(length)
            if len(data) != length:
                raise ValueError('The game runtime changed while being inspected. Retry the operation.')
            return data

        dos = read(0, 64)
        if dos[:2] != b'MZ':
            raise ValueError('GameAssembly.dll is not a Windows runtime library.')
        start = struct.unpack_from('<I', dos, 60)[0]
        header = read(start, 24)
        if header[:4] != b'PE\0\0' or struct.unpack_from('<H', header, 4)[0] != 0x8664:
            raise ValueError('The native bridge requires the x64 Windows game runtime.')
        sections_count = struct.unpack_from('<H', header, 6)[0]
        optional_size = struct.unpack_from('<H', header, 20)[0]
        if not 1 <= sections_count <= 96 or not 120 <= optional_size <= 4096:
            raise ValueError('The game runtime has an unsupported PE header.')
        optional = read(start + 24, optional_size)
        if struct.unpack_from('<H', optional)[0] != 0x20b:
            raise ValueError('The native bridge requires a PE32+ game runtime.')
        headers_size = struct.unpack_from('<I', optional, 60)[0]
        sections = []
        for i in range(sections_count):
            section = read(start + 24 + optional_size + i * 40, 40)
            virtual_size, address, raw_size, offset = struct.unpack_from('<IIII', section, 8)
            sections.append((address, virtual_size, raw_size, offset))

        def rva(address, length):
            if 0 <= address and address + length <= headers_size:
                return read(address, length)
            for base, virtual_size, raw_size, offset in sections:
                if base <= address and address + length <= base + raw_size:
                    return read(offset + address - base, length)
            raise ValueError('The game runtime has an invalid export reference.')

        export_rva, export_size = struct.unpack_from('<II', optional, 112)
        if not export_rva or export_size < 40:
            raise ValueError('The game runtime does not expose IL2CPP integration APIs.')
        exports = rva(export_rva, 40)
        count = struct.unpack_from('<I', exports, 24)[0]
        if not 0 < count <= 65536:
            raise ValueError('The game runtime has an invalid export table.')
        names = rva(struct.unpack_from('<I', exports, 32)[0], count * 4)
        missing = set(CORE_EXPORTS)
        for (address,) in struct.iter_unpack('<I', names):
            name = bytearray()
            for i in range(256):
                char = rva(address + i, 1)
                if char == b'\0':
                    break
                name += char
            else:
                raise ValueError('The game runtime has an invalid export name.')
            missing.discard(name.decode('ascii', errors='replace'))
            if not missing:
                return ''
        raise ValueError('The game runtime is missing IL2CPP APIs: ' + ', '.join(sorted(missing)))


def runtime_problem(game):
    try:
        path = Path(game) / 'GameAssembly.dll'
        info = path.stat()
        return _inspect(str(path), info.st_mtime_ns, info.st_size)
    except (OSError, ValueError, struct.error) as exc:
        return str(exc) if isinstance(exc, ValueError) else 'Select an installed game folder containing a readable GameAssembly.dll.'
