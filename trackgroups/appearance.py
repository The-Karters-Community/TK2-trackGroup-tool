"""Read installed cosmetic variant metadata into a local, bounded display cache.

Game assets stay on the owner's machine. No upload keys, descriptions, author
account data or raw bundle trees enter application state or portable exports.
"""

import hashlib
import json
import os
from pathlib import Path
import re
import threading
import tempfile

from .runtime import write_json

KINDS = {9: "characters", 12: "vehicles", 14: "wheels", 16: "stickers"}


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
                ]
    for kind in ("vehicles", "wheels", "stickers"):
        for item in content.get(kind, []):
            for variant in item.get("colorVariants", []):
                yield kind, variant, [
                    item.get("strItemDirName", ""),
                    variant.get("strVariantDirName", ""),
                ]


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
        self.warning = ""
        self.signature = ""
        self.files = {}
        self.preview_error = ""

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

    def refresh(self, game):
        with self.lock:
            self.requested_game = game
            if self.loading:
                return
            self.loading = True
        threading.Thread(target=self._build, args=(game,), daemon=True).start()

    def _build(self, game):
        try:
            sources = self.sources(game)
            signature = hashlib.sha256(
                json.dumps(
                    [
                        (str(p.resolve()), p.stat().st_size, p.stat().st_mtime_ns)
                        for p, _ in sources
                    ]
                ).encode()
            ).hexdigest()
            if signature == self.signature and game == self.game:
                return
            cache = self.folder / "index.json"
            try:
                saved = json.loads(cache.read_text(encoding="utf-8"))
                if (
                    saved.get("version") == 4
                    and saved.get("signature") == signature
                    and not saved.get("previewError")
                ):
                    self.items = saved["items"]
                    self.signature = signature
                    self.game = game
                    return
            except (OSError, ValueError, KeyError):
                pass
            import UnityPy

            self.preview_error = ""

            result = {kind: {} for kind in KINDS.values()}
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
                            result[kind][str(identity)] = entry
                        elif isinstance(tree.get("modContentInfo"), dict):
                            thumbs = {
                                t.get("strObjDirName_AddressableKey"): t.get(
                                    "spriteThumbnail", {}
                                )
                                for t in tree.get("thumbnailsForObjects", [])
                            }
                            for kind, variant, parts in mod_variants(
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
                                    "entity": parts[0] if parts else "Custom appearance",
                                    "skin": parts[1] if len(parts) > 1 else "Default",
                                    "variant": parts[2] if len(parts) > 2 else "Default",
                                }
                                entry["image"] = self._sprite(
                                    file,
                                    objects,
                                    thumbs.get(
                                        variant.get("strPrefabFileName_AddressableKey"),
                                        {},
                                    ),
                                    identity,
                                )
                                result[kind][str(identity)] = entry
                            finished.add(file.parent)
                except Exception:
                    # One damaged/unavailable package must not hide the library.
                    continue
            write_json(
                cache,
                {
                    "version": 4,
                    "signature": signature,
                    "items": result,
                    "previewError": self.preview_error,
                },
            )
            with self.lock:
                self.items = result
                self.signature = signature if not self.preview_error else ""
                self.game = game
                self.warning = (
                    "Some appearance thumbnails are unavailable. Saved setup previews can still be used."
                    if self.preview_error
                    else ""
                )
        except Exception as exc:
            with self.lock:
                self.warning = (
                    "Appearance labels could not be refreshed: " + str(exc)[:200]
                )
        finally:
            with self.lock:
                self.loading = False
                next_game = self.requested_game
            if next_game is not None and next_game != game:
                self.refresh(next_game)

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
            if not path.is_file():
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
                "warning": self.warning,
            }
            images = {}
            for p in presets:
                for mode in ("original", "modded"):
                    name = (
                        f'Icon_PresetID_{p["id"]}'
                        + ("_Modded" if mode == "modded" else "")
                        + ".png"
                    )
                    path = self.profiles / "PresetIcons" / name
                    if (
                        path.is_file()
                        and path.resolve().is_relative_to(self.profiles.resolve())
                        and path.stat().st_size <= 4 * 1024 * 1024
                    ):
                        key = name
                        self.files[key] = path
                        images.setdefault(str(p["id"]), {})[mode] = (
                            "/api/preset-image/"
                            + key
                            + "?v="
                            + str(path.stat().st_mtime_ns)
                        )
            stale = []
            fields = ("iCharacterSkinMaterialID", "iVehicleMaterialID", "iWheelMaterialID", "iCharacterSkinMaterialID_Modded", "iVehicleMaterialID_Modded", "iWheelMaterialID_Modded")
            for p in presets:
                marker = self.profiles / "PresetIcons" / f'Icon_PresetID_{p["id"]}.hash'
                try:
                    saved = marker.read_text(encoding="utf-8").strip().split("_")[:6]
                    if saved != [str(p["data"][key]) for key in fields]:
                        stale.append(p["id"])
                except (OSError, KeyError):
                    pass
            result["stalePreviews"] = stale
            result["previews"] = images
            return result

    def image(self, name):
        if not re.fullmatch(
            r"(?:[a-f0-9]{64}|Icon_PresetID_-?\d+(?:_Modded)?)\.png", name
        ):
            raise ValueError("Invalid preview.")
        path = self.files.get(name) or self.folder / name
        if not path.is_file() or path.stat().st_size > 4 * 1024 * 1024:
            raise ValueError("Preview not found.")
        root = self.profiles if name.startswith("Icon_") else self.folder
        if not path.resolve().is_relative_to(root.resolve()):
            raise ValueError("Invalid preview path.")
        raw = path.read_bytes()
        if not raw.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ValueError("Invalid PNG preview.")
        return raw
