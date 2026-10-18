"""Read installed cosmetic variant metadata into a local, bounded display cache.

Game assets stay on the owner's machine. No upload keys, descriptions, author
account data or raw bundle trees enter application state or portable exports.
"""

import hashlib
import json
import os
from functools import lru_cache
from pathlib import Path
import re
import threading
import tempfile
import time

from .runtime import write_json

KINDS = {9: "characters", 12: "vehicles", 14: "wheels", 16: "stickers"}
INDEX_VERSION = 13
PNG_HEADER = b"\x89PNG\r\n\x1a\n"


def file_stamp(path):
    """A missing or concurrently replaced download is a changed source too."""
    try:
        info = path.stat()
        return (str(path), info.st_mtime_ns, info.st_size)
    except OSError:
        return (str(path), None, None)


def valid_png(path):
    try:
        if not 8 < path.stat().st_size <= 4 * 1024 * 1024:
            return False
        with path.open('rb') as stream:
            return stream.read(8) == PNG_HEADER
    except OSError:
        return False


def package_origin(game, file):
    """Trust the Steam library layout, never a numeric local mod folder name."""
    workshop = Path(game).resolve().parent.parent/'workshop/content/2269950'
    try:
        relative = Path(file).resolve().relative_to(workshop.resolve())
        identity = relative.parts[0]
        if len(relative.parts) > 1 and identity.isascii() and identity.isdigit():
            return {'workshopId': identity, 'localOnly': False}
    except (OSError, ValueError, IndexError):
        pass
    return {'localOnly': True}


def clean_name(value):
    value = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", str(value))
    return re.sub(r"\s+", " ", re.sub(r"[_\\/]+", " ", value)).strip()[:160]


def mod_variants(content, character_names=None):
    """Only the public variant identifiers and names; never return the input tree."""
    for char in content.get("characters", []):
        for outfit in char.get("outfits", []):
            for variant in outfit.get("materialVariants", []):
                name = (character_names or {}).get(
                    char.get("inGameCharacterInfo", {}).get("m_PathID")
                )
                yield "characters", variant, [
                    name or char.get("strCharacterDirName", ""),
                    outfit.get("strOutfitDirName", ""),
                    variant.get("strOutfitMaterialDirName", ""),
                ], [char.get("strCharacterDirName", ""), outfit.get("strOutfitDirName", ""), variant.get("strOutfitMaterialDirName", "")]
    for kind in ("vehicles", "wheels", "stickers"):
        for item in content.get(kind, []):
            for variant in item.get("colorVariants", []):
                yield kind, variant, [
                    item.get("strItemDirName", ""),
                    variant.get("strVariantDirName", ""),
                ], [item.get("strItemDirName", ""), variant.get("strVariantDirName", "")]


def model_prefab(directory, kind, raw_parts):
    directory = Path(directory)
    try:
        stat = (directory / "catalog_config.json").stat()
    except OSError:
        return None
    return _model_prefab(directory, kind, tuple(raw_parts), stat.st_mtime_ns, stat.st_size)


@lru_cache(maxsize=4096)
def _model_prefab(directory, kind, raw_parts, _modified, _size):
    """Match a config variant to its exact local prefab; never guess by label."""
    try:
        ids = json.loads((directory / "catalog_config.json").read_text(encoding="utf-8"))["m_InternalIds"]
    except (OSError, ValueError, KeyError, TypeError):
        return None
    prefix = {"characters": "Characters", "vehicles": "Vehicles", "wheels": "Wheels"}.get(kind)
    if not prefix or any(not isinstance(p, str) or not p for p in raw_parts):
        return None
    expected = ([prefix, raw_parts[0], "Outfits", raw_parts[1], "Color Variations", raw_parts[2]]
                if kind == "characters" else [prefix, raw_parts[0], "Color Variations", raw_parts[1]])
    def normal(part):
        return re.sub(r"[^a-z0-9]", "", part.casefold())
    normalized = [normal(part) for part in expected]
    matches = []
    for path in ids:
        if not isinstance(path, str) or not path.lower().endswith(".prefab"):
            continue
        parts = path.replace("\\", "/").split("/")
        for start in range(len(parts) - len(expected) + 1):
            if [normal(p) for p in parts[start:start + len(expected)]] == normalized:
                matches.append(path)
                break
    return sorted(set(matches))[0] if len(set(matches)) == 1 else None


class Appearance:
    def __init__(self, folder, profiles):
        self.folder = Path(folder)
        self.folder.mkdir(parents=True, exist_ok=True)
        # Windows packaged hosts can redirect file handles while resolve() on
        # the directory itself still returns the unredirected path. Resolve an
        # exclusively created file to establish the actual app-owned cache root.
        with tempfile.NamedTemporaryFile(dir=self.folder, prefix="path-", suffix=".tmp") as probe:
            self.folder = Path(probe.name).resolve().parent
        self.profiles = Path(profiles)
        self.lock = threading.RLock()
        self.loading = False
        self.game = None
        self.requested_game = None
        self.items = {kind: {} for kind in KINDS.values()}
        self.model_refs = {}
        self.warning = ""
        self.signature = ""
        self.revision = ""
        self.files = {}
        self.preview_error = ""
        self._observed = None
        self._checked = 0
        self._requested_generation = 0
        self._retry_at = None

    def observe(self, game):
        """Notice completed/new Workshop and local packages without decoding them."""
        now = time.monotonic()
        if now - self._checked < 2: return
        self._checked = now
        root = Path(game)
        stamps = []
        for location in (root / 'Mods', root.parent.parent / 'workshop/content/2269950'):
            try:
                for package in sorted(location.iterdir())[:2000]:
                    if not package.is_dir(): continue
                    for path in (package, package/'catalog_config.json', package/'StandaloneWindows64/catalog_config.json'):
                        stamps.append(file_stamp(path))
                    directory = package/'StandaloneWindows64' if (package/'StandaloneWindows64').is_dir() else package
                    # Steam writes existing bundle files in place. Their parent
                    # directory and unchanged catalog do not get a new mtime.
                    stamps.extend(file_stamp(p) for p in sorted(directory.glob('*.bundle')))
            except OSError: pass
        official = root/'TheKarters2_Data/StreamingAssets/aa'
        stamps.append(file_stamp(official/'catalog.json'))
        stamps.extend(file_stamp(p) for p in sorted((official/'StandaloneWindows64').glob('*thekartersgameconfig*.bundle')))
        stamp = (str(root), tuple(stamps))
        retry = self._retry_at is not None and now >= self._retry_at and not self.loading
        if stamp != self._observed or retry:
            self._observed = stamp
            self.refresh(game)

    def sources(self, game):
        root = Path(game).resolve()
        official = root / "TheKarters2_Data/StreamingAssets/aa/StandaloneWindows64"
        result = [
            (p, "official") for p in official.glob("*thekartersgameconfig*.bundle")
        ]
        locations = [root / "Mods", root.parent.parent / "workshop/content/2269950"]
        for location in locations:
            if not location.is_dir():
                continue
            for package in sorted(location.iterdir())[:2000]:
                if not package.is_dir() or not package.resolve().is_relative_to(
                    location.resolve()
                ):
                    continue
                directory = (
                    package / "StandaloneWindows64"
                    if (package / "StandaloneWindows64").is_dir()
                    else package
                )
                catalog = directory / "catalog_config.json"
                if not catalog.is_file() or catalog.stat().st_size > 1024 * 1024:
                    continue
                try:
                    ids = json.loads(catalog.read_text(encoding="utf-8")).get(
                        "m_InternalIds", []
                    )
                    if not any(
                        isinstance(p, str)
                        and any(
                            "/" + k + "/" in p.replace("\\", "/")
                            for k in ("Characters", "Vehicles", "Wheels", "Stickers")
                        )
                        for p in ids
                    ):
                        continue
                except (OSError, ValueError, AttributeError):
                    continue
                # Smallest first: the config is usually a tiny dedicated bundle.
                total = 0
                for file in sorted(
                    directory.glob("*.bundle"), key=lambda p: p.stat().st_size
                ):
                    if not file.resolve().is_relative_to(location.resolve()):
                        continue
                    size = file.stat().st_size
                    if size > 64 * 1024 * 1024 or total + size > 128 * 1024 * 1024:
                        continue
                    total += size
                    result.append((file, package.name))
        return result

    def refresh(self, game, *, force=False):
        with self.lock:
            if force:
                self.signature = ''
                (self.folder / 'index.json').unlink(missing_ok=True)
            self.requested_game = game
            self._requested_generation += 1
            if self.loading:
                return
            self.loading = True
        threading.Thread(target=self._build, args=(game,), daemon=True).start()

    def _build(self, game):
        with self.lock:
            generation = self._requested_generation
        try:
            sources = self.sources(game)
            dependencies = sorted({p for file, _ in sources for p in file.parent.glob('*.bundle')})
            signature = hashlib.sha256(
                json.dumps(
                    [
                        (file_stamp(p.resolve()), file_stamp(p.parent / "catalog_config.json"))
                        for p, _ in sources
                    ] + [file_stamp(p) for p in dependencies]
                      + ([file_stamp(Path(game)/'TheKarters2_Data/StreamingAssets/aa/catalog.json')]
                         if (Path(game)/'TheKarters2_Data/StreamingAssets/aa/catalog.json').is_file() else [])
                ).encode()
            ).hexdigest()
            if signature == self.signature and game == self.game:
                return
            cache = self.folder / "index.json"
            try:
                saved = json.loads(cache.read_text(encoding="utf-8"))
                if (
                    saved.get("version") == INDEX_VERSION
                    and saved.get("signature") == signature
                    and not saved.get("previewError")
                    and self._cached_images_valid(saved.get('items', {}))
                ):
                    with self.lock:
                        self.items = saved["items"]
                        self.model_refs = saved.get("modelRefs", {})
                        self.signature = signature
                        self.revision = hashlib.sha256(json.dumps([signature, self.items, self.model_refs], sort_keys=True).encode()).hexdigest()
                        self.game = game
                        self.warning = ''
                        self._retry_at = None
                    return
            except (OSError, ValueError, KeyError):
                pass
            import UnityPy

            self.preview_error = ""
            decode_error = False
            _model_prefab.cache_clear()

            result = {kind: {} for kind in KINDS.values()}
            model_refs = {}
            from .addressables import Addressables
            try:
                official_catalog = Addressables(Path(game) / 'TheKarters2_Data/StreamingAssets/aa/catalog.json')
            except (OSError, ValueError, KeyError):
                official_catalog = None
            finished = set()
            names = {}
            for file, source in sources:
                if source != "official" and file.parent in finished:
                    continue
                try:
                    env = UnityPy.load(str(file))
                    objects = {o.path_id: o for o in env.objects}
                    trees = {
                        i: o.read_typetree()
                        for i, o in objects.items()
                        if o.type.name == "MonoBehaviour"
                    }
                    for tree in trees.values():
                        name = tree.get("charInfo", {}).get("strCharNameForUI")
                        if name and name != "Default Name":
                            for path_id, candidate in trees.items():
                                if candidate is tree:
                                    names.setdefault(file.parent, {})[path_id] = (
                                        clean_name(name)
                                    )
                        if source == "official":
                            kind = KINDS.get(
                                tree.get("pixelSerializedData", {}).get(
                                    "eConfigTypeSerialized"
                                )
                            )
                            if not kind:
                                continue
                            if official_catalog:
                                reference_field = {'characters':'CharacterSkinMaterialPrefabAssetReference', 'vehicles':'KartSkinMaterialPrefabAssetReference', 'wheels':'WheelPrefabAssetReference', 'stickers':'StickerPrefabAssetReference_canBeNull'}[kind]
                                ref = official_catalog.resolve(tree.get(reference_field, {}).get('m_AssetGUID'), asset=kind=='stickers')
                                if ref:
                                    if kind == 'characters': ref['characterType'] = tree.get('CharacterType')
                                    model_refs[f"{kind}:{tree['iMainScriptableObjectConfigIDUnique']}"] = ref
                            chain = [tree]
                            parent = tree.get("objectParentConfig", {}).get("m_PathID")
                            while parent in trees and len(chain) < 5:
                                chain.append(trees[parent])
                                parent = (
                                    chain[-1]
                                    .get("objectParentConfig", {})
                                    .get("m_PathID")
                                )
                            base = next(
                                (
                                    clean_name(t.get("DisplayName"))
                                    for t in reversed(chain)
                                    if t.get("DisplayName")
                                ),
                                clean_name(chain[-1].get("m_Name", "")).replace(
                                    "Config", ""
                                ),
                            )
                            skin = re.search(
                                r"_Model_(\d+)_Material_(\d+)", tree.get("m_Name", "")
                            )
                            parts = [base]
                            if skin:
                                parts += [
                                    "Skin " + str(int(skin[1])),
                                    "Variant " + str(int(skin[2]) + 1),
                                ]
                            identity = tree.get("iMainScriptableObjectConfigIDUnique")
                            entry = {
                                "name": base,
                                "label": " · ".join(parts),
                                "source": "official",
                                "entity": base,
                                "skin": "Skin " + str(int(skin[1])) if skin else "Default",
                                "variant": "Variant " + str(int(skin[2]) + 1) if skin else "Default",
                            }
                            entry["image"] = self._sprite(
                                file, objects, tree.get("configSprite", {}), identity
                            )
                            entry['thumbnailUnavailable'] = not tree.get('configSprite', {}).get('m_PathID')
                            result[kind][str(identity)] = entry
                        elif isinstance(tree.get("modContentInfo"), dict):
                            try:
                                package_catalog = Addressables(file.parent / 'catalog_config.json')
                            except (OSError, ValueError, KeyError):
                                package_catalog = None
                            thumbs = {
                                t.get("strObjDirName_AddressableKey"): t.get(
                                    "spriteThumbnail", {}
                                )
                                for t in tree.get("thumbnailsForObjects", [])
                            }
                            origin = {**package_origin(game, file), 'package': clean_name(tree.get('ModName') or source)}
                            for kind, variant, parts, raw_parts in mod_variants(
                                tree["modContentInfo"], names.get(file.parent)
                            ):
                                identity = variant.get("iGeneratedTargetUniqueConfigID")
                                if type(identity) != int:
                                    continue
                                parts = list(
                                    dict.fromkeys(clean_name(p) for p in parts if p)
                                )
                                entry = {
                                    "name": parts[0] if parts else "Custom appearance",
                                    "label": " · ".join(parts),
                                    "source": "mod",
                                    "addedAt": int(getattr(file.parent.stat(), "st_birthtime", file.parent.stat().st_mtime) * 1000),
                                    "entity": parts[0] if parts else "Custom appearance",
                                    "skin": parts[1] if len(parts) > 1 else "Default",
                                    "variant": parts[2] if len(parts) > 2 else "Default",
                                    **origin,
                                }
                                pointer = thumbs.get(variant.get('strPrefabFileName_AddressableKey'), {})
                                entry["image"] = self._sprite(
                                    file,
                                    objects,
                                    pointer,
                                    identity,
                                )
                                entry['thumbnailUnavailable'] = not pointer.get('m_PathID')
                                result[kind][str(identity)] = entry
                                reference = package_catalog.resolve(variant.get('strPrefabFileName_AddressableKey'), asset=kind=='stickers') if package_catalog else None
                                if not reference and kind != 'stickers':
                                    prefab = model_prefab(file.parent, kind, raw_parts)
                                    if prefab: reference = {"directory": str(file.parent), "prefab": prefab}
                                if reference:
                                    # Include package metadata needed for exact character offsets.
                                    if kind == 'characters':
                                        char = next(c for c in tree['modContentInfo']['characters'] if c.get('strCharacterDirName') == raw_parts[0])
                                        reference['characterInfo'] = str(char.get('inGameCharacterInfo', {}).get('m_PathID', 0))
                                        # Small metadata bundles can be separate from the model's dependency chain.
                                        if 'bundles' in reference:
                                            reference['bundles'] = sorted(set(reference['bundles']) | {p.name for p in file.parent.glob('*.bundle') if p.stat().st_size < 128 * 1024})
                                    model_refs[f"{kind}:{identity}"] = reference
                            finished.add(file.parent)
                except Exception:
                    # One damaged/unavailable package must not hide the library.
                    # A transient Steam download must not become a permanently
                    # successful, incomplete on-disk index.
                    decode_error = True
                    continue
            write_json(
                cache,
                {
                    "version": INDEX_VERSION,
                    "signature": signature,
                    "items": result,
                    "modelRefs": model_refs,
                    "previewError": self.preview_error or ('Package still downloading or unavailable.' if decode_error else ''),
                },
            )
            with self.lock:
                self.items = result
                self.model_refs = model_refs
                self.revision = hashlib.sha256(json.dumps([signature, result, model_refs], sort_keys=True).encode()).hexdigest()
                incomplete = bool(self.preview_error or decode_error)
                self.signature = signature if not incomplete else ""
                self._retry_at = time.monotonic() + 5 if incomplete else None
                self.game = game
                self.warning = (
                    "Some installed content is still downloading or unavailable. Garage will retry automatically."
                    if decode_error else
                    "Some appearance thumbnails are unavailable. Garage will retry automatically."
                    if self.preview_error else ""
                )
        except Exception as exc:
            with self.lock:
                self.warning = (
                    "Appearance labels could not be refreshed: " + str(exc)[:200]
                )
                self._retry_at = time.monotonic() + 5
        finally:
            with self.lock:
                self.loading = False
                next_game = self.requested_game
                newer_request = self._requested_generation > generation
            if next_game is not None and (next_game != game or newer_request):
                self.refresh(next_game)

    def _cached_images_valid(self, items):
        if not isinstance(items, dict): return False
        for entries in items.values():
            if not isinstance(entries, dict): return False
            for entry in entries.values():
                if not isinstance(entry, dict): return False
                image = entry.get('image', '')
                if not image:
                    continue  # Some mods intentionally ship no thumbnail.
                name = image.removeprefix('/api/preset-image/')
                if not re.fullmatch(r'[a-f0-9]{64}\.png', name) or not valid_png(self.folder/name):
                    return False
        return True

    def _sprite(self, bundle, objects, pointer, identity):
        if pointer.get("m_FileID", 0) != 0 or pointer.get("m_PathID") not in objects:
            return ""
        obj = objects[pointer["m_PathID"]]
        if obj.type.name != "Sprite":
            return ""
        key = (
            hashlib.sha256(
                f"{bundle.resolve()}:{bundle.stat().st_mtime_ns}:{identity}".encode()
            ).hexdigest()
            + ".png"
        )
        path = self.folder / key
        try:
            if not valid_png(path):
                image = obj.read().image
                image.thumbnail((160, 160))
                temporary = path.with_suffix(".tmp")
                image.save(temporary, format="PNG")
                os.replace(temporary, path)
            return "/api/preset-image/" + key
        except Exception as exc:
            if not self.preview_error:
                self.preview_error = str(exc)
                write_json(self.folder / "preview-error.json", {"message": str(exc)})
            return ""

    def snapshot(self, presets):
        with self.lock:
            result = {
                "items": self.items,
                "loading": self.loading,
                "revision": self.revision,
                "warning": self.warning,
                "models": {kind: [int(key.split(":", 1)[1]) for key in self.model_refs if key.startswith(kind + ":")]
                           for kind in ("characters", "vehicles", "wheels")},
            }
            images = {}
            preview_stamps = []
            for p in presets:
                for mode in ("original", "modded"):
                    name = (
                        f'Icon_PresetID_{p["id"]}'
                        + ("_Modded" if mode == "modded" else "")
                        + ".png"
                    )
                    path = self.profiles / "PresetIcons" / name
                    stamp = file_stamp(path)
                    preview_stamps.append(stamp)
                    if (stamp[1] is not None
                        and path.resolve().is_relative_to(self.profiles.resolve())
                        and valid_png(path)):
                        key = name
                        self.files[key] = path
                        images.setdefault(str(p["id"]), {})[mode] = (
                            "/api/preset-image/"
                            + key
                            + "?v="
                            + str(stamp[1]) + '-' + str(stamp[2])
                        )
            stale = []
            stale_views = {}
            fields = ("iCharacterSkinMaterialID", "iVehicleMaterialID", "iWheelMaterialID", "iCharacterSkinMaterialID_Modded", "iVehicleMaterialID_Modded", "iWheelMaterialID_Modded")
            for p in presets:
                marker = self.profiles / "PresetIcons" / f'Icon_PresetID_{p["id"]}.hash'
                preview_stamps.append(file_stamp(marker))
                try:
                    saved = marker.read_text(encoding="utf-8").strip().split("_")[:6]
                    expected = [str(p["data"][key]) for key in fields]
                    mismatch = [mode for mode, start in [('original', 0), ('modded', 3)]
                                if saved[start:start+3] != expected[start:start+3]]
                    if mismatch:
                        stale.append(p["id"])
                        stale_views[str(p['id'])] = mismatch
                except (OSError, KeyError, UnicodeError):
                    pass
            result["stalePreviews"] = stale
            result['staleViews'] = stale_views
            result['previewRevision'] = hashlib.sha256(json.dumps(preview_stamps).encode()).hexdigest()
            result["previews"] = images
            return result

    def image(self, name):
        if not re.fullmatch(
            r"(?:[a-f0-9]{64}|Icon_PresetID_-?\d+(?:_Modded)?)\.png", name
        ):
            raise ValueError("Invalid preview.")
        path = self.profiles/'PresetIcons'/name if name.startswith('Icon_') else self.folder/name
        if not path.is_file() or path.stat().st_size > 4 * 1024 * 1024:
            raise ValueError("Preview not found.")
        root = self.profiles if name.startswith("Icon_") else self.folder
        if not path.resolve().is_relative_to(root.resolve()):
            raise ValueError("Invalid preview path.")
        raw = path.read_bytes()
        if not raw.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ValueError("Invalid PNG preview.")
        return raw
