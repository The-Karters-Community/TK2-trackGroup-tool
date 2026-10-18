"""Independent setup geometry, rigs, animation and decals from installed assets.

No game process or companion is used. Reduced geometry/textures stay in the
owner's bounded local cache; game and Workshop assets never ship with Garage.
"""

import base64
import gzip
import hashlib
from io import BytesIO
import json
from pathlib import Path
import uuid
import threading
from contextvars import ContextVar

CACHE_LIMIT = 96 * 1024 * 1024
CACHE_LOCK = threading.Lock()
TEXTURE_CACHE = ContextVar('model_texture_cache', default=None)


MAX_PACKAGE = 256 * 1024 * 1024
MAX_MESHES = 96
MAX_VERTICES = 300_000
MAX_TOTAL_VERTICES = 600_000
MAX_NODES = 2_000


def _pointer(obj, pointer):
    if not isinstance(pointer, dict) or not pointer.get('m_PathID'):
        return None
    from UnityPy.classes.PPtr import PPtr
    return PPtr(**pointer, assetsfile=obj.assets_file).deref()


def _material(pointer):
    try:
        obj = pointer.deref()
        tree = obj.read_typetree()
        props = tree.get("m_SavedProperties", {})
        colors = dict(props.get("m_Colors", []))
        fire = '_MaskTex' in dict(props.get('m_TexEnvs', [])) and '_FireHeight' in dict(props.get('m_Floats', []))
        value = (colors.get('_BackgroundColor') or {}) if fire else colors.get("_BaseColor") or colors.get("_Color") or {}
        color = [float(value.get(axis, 1)) for axis in "rgb"]
        floats = dict(props.get('m_Floats', []))
        textures = dict(props.get('m_TexEnvs', []))
        texture = None
        uv_scale, uv_offset = [1, 1], [0, 0]
        for key in ('_AlbedoTex', '_BaseMap', '_MainTex'):
            env = textures.get(key, {})
            if env.get("m_Texture", {}).get("m_PathID"):
                target = _pointer(obj, env["m_Texture"])
                if target:
                    texture = _texture_ref(target)
                if texture:
                    uv_scale = [env.get('m_Scale', {}).get(a, 1) for a in 'xy']
                    uv_offset = [env.get('m_Offset', {}).get(a, 0) for a in 'xy']
                    break
        transparent = floats.get('_Mode') in (2, 3) or tree.get('m_CustomRenderQueue', -1) >= 3000
        layers = {}
        for key in ('_SecondaryTex', '_MaskTex', '_NoiseTex', '_EmissionMap', '_EmissionMap2', '_MetallicTex', '_MetallicGlossMap'):
            target = _pointer(obj, textures.get(key, {}).get('m_Texture'))
            if target:
                layers[key] = _texture_ref(target)
        return {"color": color, "texture": texture, 'uvScale':uv_scale, 'uvOffset':uv_offset,
                'layers':layers, 'shaderFloats':floats, 'shaderColors':colors, 'fire':fire,
                'opacity':value.get('a', 1) if transparent else 1, 'transparent':transparent,
                'alphaTest':floats.get('_Cutoff', .5) if '_ALPHATEST_ON' in tree.get('m_ShaderKeywords', '') else 0,
                'metalness':floats.get('_Metallic', 0), 'roughness':1-floats.get('_Glossiness', .15)}
    except (OSError, ValueError, AttributeError, KeyError, TypeError):
        return {"color": [0.75, 0.78, 0.82], "texture": None}


def _texture_ref(obj):
    try:
        if obj.type.name != "Texture2D":
            return None
        cache = TEXTURE_CACHE.get()
        key = (obj.assets_file.name, obj.path_id)
        if cache is not None and key in cache: return cache[key]
        image = obj.read().image
        image.thumbnail((512, 512))
        out = BytesIO()
        image.convert("RGBA").save(out, format="PNG", optimize=True)
        if out.tell() > 768 * 1024:
            return None
        result = base64.b64encode(out.getvalue()).decode("ascii")
        if cache is not None: cache[key] = result
        return result
    except (OSError, ValueError, AttributeError):
        return None


def _geometry(mesh_pointer, materials):
    from UnityPy.helpers.MeshHelper import MeshHandler

    mesh = mesh_pointer.read()
    handler = MeshHandler(mesh)
    handler.process()
    positions = handler.m_Vertices
    if not positions or len(positions) > MAX_VERTICES:
        return None
    triangles = handler.get_triangles()
    indices = []
    groups = []
    for number, submesh in enumerate(triangles):
        start = len(indices)
        for tri in submesh:
            indices.extend(int(i) for i in tri)
        if len(indices) > 1_800_000:
            return None
        groups.append([start, len(indices) - start, number])
    output = {
        "positions": [round(float(x), 6) for vertex in positions for x in vertex[:3]],
        "normals": [round(float(x), 5) for normal in handler.m_Normals for x in normal[:3]] if len(handler.m_Normals) == len(positions) else [],
        "uv": [round(float(x), 5) for uv in handler.m_UV0 for x in uv[:2]] if len(handler.m_UV0) == len(positions) else [],
        "indices": indices,
        "groups": groups,
        "materials": [_material(materials[i]) if i < len(materials) else {"color": [0.75, 0.78, 0.82], "texture": None}
                      for i in range(len(triangles))],
    }
    # Unity's one-influence optimization omits the weight stream entirely.
    # These are still skinned surfaces (notably separate facial meshes).
    weights = handler.m_BoneWeights
    if not weights and handler.m_BoneIndices and all(len(item) == 1 for item in handler.m_BoneIndices):
        weights = [(1.0,)] * len(handler.m_BoneIndices)
    if handler.m_BoneIndices and weights and mesh.m_BindPose:
        # Unity may store one or two influences per vertex. Three's skin
        # attributes always have four; pad each vertex, not the flattened array.
        output['skinIndices'] = [int(x) for item in handler.m_BoneIndices for x in (list(item) + [0]*4)[:4]]
        output['skinWeights'] = [round(float(x), 6) for item in weights for x in (list(item) + [0]*4)[:4]]
        output['bindPoses'] = [[getattr(matrix, f'e{row}{col}') for col in range(4) for row in range(4)] for matrix in mesh.m_BindPose]
    return output


def _node(game_object, depth, visited, count, path=''):
    if depth > 32 or count[2] >= MAX_NODES or game_object.path_id in visited:
        return None
    visited.add(game_object.path_id)
    count[2] += 1
    tree = game_object.read_typetree()
    components = [_pointer(game_object, c.get("component", {})) for c in tree.get("m_Component", [])]
    components = [c for c in components if c]
    transform = next((c for c in components if c.type.name in ("Transform", "RectTransform")), None)
    if transform is None:
        return None
    position = transform.read_typetree()
    mesh_filter = next((c for c in components if c.type.name == "MeshFilter"), None)
    renderer = next((c for c in components if c.type.name in ("SkinnedMeshRenderer", "MeshRenderer")), None)
    output = {"id":str(transform.path_id), "path":path, "active":bool(tree.get('m_IsActive', 1)),
              "name": tree.get("m_Name", "Part")[:80], "position": [position["m_LocalPosition"][x] for x in "xyz"],
              "rotation": [position["m_LocalRotation"][x] for x in "xyzw"],
              "scale": [position["m_LocalScale"][x] for x in "xyz"], "children": []}
    if renderer and count[0] < MAX_MESHES:
        try:
            rendered = renderer.read()
            mesh = mesh_filter.read().m_Mesh if mesh_filter else rendered.m_Mesh
            geometry = _geometry(mesh, rendered.m_Materials)
            if geometry and count[1] + len(geometry["positions"]) // 3 <= MAX_TOTAL_VERTICES:
                output["mesh"] = geometry
                geometry['visible'] = bool(rendered.m_Enabled)
                if 'skinIndices' in geometry:
                    geometry['bones'] = [str(p.m_PathID) for p in rendered.m_Bones]
                count[0] += 1
                count[1] += len(geometry["positions"]) // 3
        except (OSError, ValueError, AttributeError, KeyError, TypeError):
            pass
    for child in position.get("m_Children", [])[:512]:
        child_transform = _pointer(transform, child)
        if child_transform is None:
            continue
        child_go = _pointer(child_transform, child_transform.read_typetree().get("m_GameObject", {}))
        if child_go is not None:
            child_name = child_go.peek_name()
            node = _node(child_go, depth + 1, visited, count, (path + '/' + child_name).lstrip('/'))
            if node:
                output["children"].append(node)
    # PTK_ModVehicleInfo.HideSuspensionDebugVisuals disables these authoring
    # helpers at runtime. Preserve the nodes for rig references, hide surfaces.
    for component in components:
        if component.type.name != 'MonoBehaviour': continue
        script = component.read_typetree()
        if 'previewMeshes' in script:
            def hide(node):
                if 'mesh' in node: node['mesh']['visible'] = False
                for child in node['children']: hide(child)
            hide(output)
    return output


def _rig(prefab, root):
    """Read only attachment and idle-animation fields; never execute game code."""
    from .unity_animation import decode_clip
    output = {'animations':[], 'standingAnimations':[], 'hidden':[], 'hideVehicle':False, 'offset':[0,0,0]}
    trees = []
    for component in prefab.read_typetree().get('m_Component', []):
        obj = _pointer(prefab, component['component'])
        if obj and obj.type.name == 'MonoBehaviour':
            trees.append((obj, obj.read_typetree()))
    for obj, tree in trees:
        if 'bHideVehicleAndWheels' in tree:
            output['hideVehicle'] = bool(tree['bHideVehicleAndWheels'])
        if 'bHideWheels' in tree:
            output['hideWheels'] = bool(tree['bHideWheels'])
        if 'previewParent' in tree:
            target = _pointer(obj, tree['previewParent'])
            if target:
                tr = _pointer(target, target.read_typetree()['m_Component'][0]['component'])
                output['hidden'].append(str(tr.path_id))
        if 'characterSocketBone' in tree:
            output['characterSocket'] = str(tree['characterSocketBone']['m_PathID'])
            output['wheels'] = [{'node':str(tree[f'{side}_Bone']['m_PathID']), 'scale':tree[f'{side}_WheelSize']}
                                for side in ('fl','fr','bl','br')]
            stickers = _pointer(obj, tree.get('stickersManager'))
            if stickers:
                output['stickerSlots'] = []
                for pointer in stickers.read_typetree().get('vehicleStickers', []):
                    info = _pointer(stickers, pointer)
                    go = _pointer(info, info.read_typetree()['m_GameObject'])
                    transform = _pointer(go, go.read_typetree()['m_Component'][0]['component'])
                    output['stickerSlots'].append(str(transform.path_id))
            clip = _pointer(obj, tree.get('defaultAnim'))
            if clip:
                # Vehicle clips are relative to the animator's GameObject.
                animator = _pointer(obj, tree.get('vehicleAnimator'))
                go = _pointer(animator, animator.read_typetree()['m_GameObject']) if animator else None
                prefix = go.peek_name() if go else ''
                animation = decode_clip(clip, root, prefix)
                if animation: output['animations'].append(animation)
        if 'charAnimationsListSO' in tree:
            config = _pointer(obj, tree['charAnimationsListSO'])
            if config:
                animation_tree = config.read_typetree()
                for number, category in enumerate(('CharacterA','CharacterB','CharacterC')):
                    if number >= len(root['children']): break
                    # inKart_IdleTrigger selects jazda_idle in the native menu
                    # controller. Its Workshop override is Driving_idle, not the
                    # standing Idle_Menu clip used by the separate standing state.
                    for section, name, target in (('Driving', 'driving_idle', 'animations'), ('Menu', 'idle_menu', 'standingAnimations')):
                        for pointer in animation_tree.get(category, {}).get(section, []):
                            clip = _pointer(config, pointer)
                            if clip and clip.peek_name().casefold() == name:
                                animation = decode_clip(clip, root, root['children'][number]['path'])
                                if animation: output[target].append(animation)
    return output


def _source(appearance, kind, identity):
    if kind not in ("characters", "vehicles", "wheels", "stickers") or type(identity) is not int:
        raise ValueError("This appearance cannot be displayed in 3D.")
    with appearance.lock:
        reference = appearance.model_refs.get(f"{kind}:{identity}")
        game = appearance.game
        installed = getattr(appearance, 'items', {}).get(kind, {}).get(str(identity))
        loading = getattr(appearance, 'loading', False)
    if not reference or not game:
        if loading:
            raise ValueError("Installed appearances are still being indexed. The preview will refresh when the scan finishes.")
        if installed:
            raise ValueError("This appearance is installed, but its model is not supported by the local viewer yet. Its saved game image remains available.")
        raise ValueError(f"The selected {kind.rstrip('s')} asset is not installed or could not be resolved. Install its Workshop/local content or choose another appearance.")
    directory = Path(reference["directory"]).resolve()
    root = Path(game).resolve()
    workshop = (root.parent.parent / "workshop/content/2269950").resolve()
    official = root / 'TheKarters2_Data/StreamingAssets/aa/StandaloneWindows64'
    if not (directory.is_relative_to(root / "Mods") or directory.is_relative_to(workshop) or directory == official):
        raise ValueError("The model path is outside installed game content.")
    bundles = sorted((directory / name for name in reference['bundles']) if 'bundles' in reference else directory.glob('*.bundle'))
    if any(not p.resolve().is_relative_to(directory) or not p.is_file() for p in bundles):
        raise ValueError('An installed model dependency is unavailable.')
    if not bundles or sum(p.stat().st_size for p in bundles) > MAX_PACKAGE or any(p.stat().st_size > 64 * 1024 * 1024 for p in bundles):
        raise ValueError("This model package is too large for the lightweight viewer.")
    native_files = [root / 'TheKarters2_Data' / name for name in ('level5','globalgamemanagers.assets','sharedassets5.assets','sharedassets1.assets','sharedassets0.assets')] if 'characterType' in reference else []
    signature = hashlib.sha256(json.dumps([14 if native_files else 13, reference,
        *[(p.name,p.stat().st_size,p.stat().st_mtime_ns) for p in native_files],
        *[(str(p), p.stat().st_size, p.stat().st_mtime_ns) for p in bundles]]).encode()).hexdigest()
    cache = appearance.folder / "models" / (signature + ".json.gz")
    return reference, root, bundles, cache


def _load_asset(reference, bundles):
    import UnityPy
    env = UnityPy.load(*map(str, bundles))
    prefab = None
    for obj in env.objects:
        if obj.type.name != "AssetBundle":
            continue
        for path, entry in obj.read_typetree().get("m_Container", []):
            if path == reference["prefab"]:
                prefab = _pointer(obj, entry["asset"])
                break
        if prefab:
            break
    if prefab is None:
        raise ValueError("The installed prefab could not be resolved.")
    return env, prefab


def _cache(cache, raw):
    cache.parent.mkdir(exist_ok=True)
    temporary = cache.with_name(cache.name + "." + uuid.uuid4().hex + ".tmp")
    try:
        temporary.write_bytes(raw)
        with CACHE_LOCK:
            temporary.replace(cache)
            files = sorted(cache.parent.glob('*.gz'), key=lambda p:p.stat().st_mtime_ns, reverse=True)
            total = 0
            for file in files:
                total += file.stat().st_size
                if total > CACHE_LIMIT and file != cache: file.unlink(missing_ok=True)
    finally:
        temporary.unlink(missing_ok=True)


def _read_cache(cache):
    with CACHE_LOCK:
        if cache.is_file() and cache.stat().st_size < 8 * 1024 * 1024:
            raw = cache.read_bytes()
            cache.touch()
            return raw
    return None


def model(appearance, kind, identity):
    if kind == 'stickers':
        if type(identity) is not int:
            raise ValueError('Invalid sticker identity.')
        return gzip.compress(json.dumps({'texture':sticker_texture(appearance, identity)}).encode())
    reference, root, bundles, cache = _source(appearance, kind, identity)
    cached = _read_cache(cache)
    if cached: return cached
    env, prefab = _load_asset(reference, bundles)
    if prefab.type.name != 'GameObject':
        raise ValueError('The installed model is not a GameObject.')
    context = TEXTURE_CACHE.set({})
    try:
        tree = _node(prefab, 0, set(), [0, 0, 0])
    finally:
        TEXTURE_CACHE.reset(context)
    def mesh_count(node):
        return (1 if node.get("mesh") else 0) + sum(mesh_count(x) for x in node["children"])
    if not tree or mesh_count(tree) == 0:
        raise ValueError("This prefab does not contain a supported mesh.")
    rig = _rig(prefab, tree)
    if kind == 'characters':
        from .animation_library import choices
        rig['animationChoices'] = choices(prefab, tree)
    if kind == 'characters' and 'characterType' in reference:
        from .native_menu import character_presentation
        rig.update(character_presentation(root, reference['characterType'], tree))
    # Character offsets are part of the character's configuration, not guessed
    # from its mesh bounds. Packages with one CharacterInfo are unambiguous.
    infos = [o.read_typetree()['charInfo'] for o in env.objects if kind == 'characters' and 'characterType' not in reference and o.type.name == 'MonoBehaviour'
             and ('characterInfo' not in reference or str(o.path_id) == reference['characterInfo'])
             and 'charInfo' in o.read_typetree()]
    if kind == 'characters' and 'characterType' not in reference and len(infos) == 1:
        offset = infos[0].get('vCharOffsetPosInVehicle', {})
        rig['offset'] = [offset.get(axis, 0) for axis in 'xyz']
    textures = _pack_textures(tree)
    raw = gzip.compress(json.dumps({"kind": kind, "id": identity, "root": tree, "rig":rig, 'textures':textures}, separators=(",", ":")).encode(), compresslevel=6)
    if len(raw) > 8 * 1024 * 1024:
        raise ValueError("This model exceeds the preview size limit.")
    _cache(cache, raw)
    return raw


def _pack_textures(root):
    """Reference shared images once, including layers used by several surfaces."""
    textures = {}
    def ref(value):
        if not value: return value
        key = hashlib.sha256(value.encode('ascii')).hexdigest()
        textures[key] = value
        return '@' + key
    def walk(node):
        for material in node.get('mesh', {}).get('materials', []):
            material['texture'] = ref(material.get('texture'))
            material['layers'] = {key:ref(value) for key,value in material.get('layers', {}).items()}
        for child in node.get('children', []): walk(child)
    walk(root)
    return textures


def sticker_texture(appearance, identity):
    # The supported build's explicit empty-sticker config has no asset GUID.
    if identity in (-1, 0, 868534): return None
    reference, _, bundles, cache = _source(appearance, 'stickers', identity)
    cached = _read_cache(cache)
    if cached:
        return json.loads(gzip.decompress(cached))['texture']
    _, asset = _load_asset(reference, bundles)
    texture = _pointer(asset, asset.read_typetree().get('textureClamp'))
    result = _texture_ref(texture) if texture else None
    if not result: raise ValueError('The installed sticker texture could not be resolved.')
    _cache(cache, gzip.compress(json.dumps({'texture':result}).encode()))
    return result


SETUP_FIELDS = (
    ('characters', 'iCharacterSkinMaterialID'),
    ('vehicles', 'iVehicleMaterialID'),
    ('wheels', 'iWheelMaterialID'),
)


def effective_ids(appearance, data):
    """Resolve the setup the game displays, without changing saved selections.

    Verified build 0.1.4.18's PTK_PlayerPreviewItem.Resolved*ConfigId methods
    use a modded field only when its flag is enabled and ContainsConfigID is
    true. An indexed config with unsupported geometry is still recognized;
    model_refs must never decide whether a valid selected mod gets replaced.
    Explicit Original/Modded editor previews deliberately bypass this helper.
    """
    with appearance.lock:
        installed = {kind: set(appearance.items.get(kind, {})) for kind, _ in SETUP_FIELDS}
    return {
        kind: data[field + '_Modded']
        if data['bUsingModdedVersion'] and str(data[field + '_Modded']) in installed[kind]
        else data[field]
        for kind, field in SETUP_FIELDS
    }


def setup(appearance, body):
    from .presets import cosmetic
    data = cosmetic(body.get('data'), strict=True)
    view = body.get('view')
    if view not in ('original','modded', 'effective'):
        raise ValueError('Choose In game, Original or Modded for the 3D setup.')
    suffix = '_Modded' if view == 'modded' or (view == 'effective' and data['bUsingModdedVersion']) else ''
    selected = effective_ids(appearance, data) if view == 'effective' else {kind:data[field+suffix] for kind, field in SETUP_FIELDS}
    parts = {}
    for kind, _ in SETUP_FIELDS:
        if kind == 'wheels' and parts['vehicles']['rig'].get('hideWheels'): continue
        parts[kind] = json.loads(gzip.decompress(model(appearance, kind, selected[kind])))
        if kind == 'characters' and parts[kind]['rig']['hideVehicle']:
            break
    stickers = []
    if 'vehicles' in parts:
        textures = {}
        for slot in data['stickersData'][:len(parts['vehicles']['rig'].get('stickerSlots', []))*2]:
            identity = slot['iStickerMaterialID' + suffix]
            if identity not in textures: textures[identity] = sticker_texture(appearance, identity)
            stickers.append({'texture':textures[identity], 'settings':slot['iStickerMaterialID' + suffix + '_SettingsPacked']})
    raw = gzip.compress(json.dumps({'kind':'setup', 'parts':parts, 'stickers':stickers}, separators=(',',':')).encode(), compresslevel=6)
    if len(raw) > 20 * 1024 * 1024:
        raise ValueError('This setup exceeds the lightweight preview size limit.')
    return raw


def setup_plan(appearance, body):
    """Small setup descriptor; clients reuse unchanged, independently cached parts."""
    from .presets import cosmetic
    data = cosmetic(body.get('data'), strict=True)
    view = body.get('view')
    if view not in ('original', 'modded', 'effective'):
        raise ValueError('Choose In game, Original or Modded for the 3D setup.')
    suffix = '_Modded' if view == 'modded' or (view == 'effective' and data['bUsingModdedVersion']) else ''
    parts = effective_ids(appearance, data) if view == 'effective' else {kind:data[field + suffix] for kind, field in SETUP_FIELDS}
    stickers = []
    for slot in data['stickersData']:
        identity = slot['iStickerMaterialID' + suffix]
        stickers.append({'id':identity, 'settings':slot['iStickerMaterialID' + suffix + '_SettingsPacked']})
    return gzip.compress(json.dumps({'kind':'setup', 'parts':parts, 'stickers':stickers}, separators=(',', ':')).encode())
