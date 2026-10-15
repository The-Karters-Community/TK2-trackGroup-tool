"""Local-only Unity prefab geometry for the optional Three.js appearance viewer.

This is a mesh inspection preview, not the game's skinned/animated renderer. It
reads installed bundles on demand, never bundles game or Workshop assets, and
keeps generated geometry in the user's application cache.
"""

import base64
import gzip
import hashlib
from io import BytesIO
import json
from pathlib import Path
import uuid


MAX_PACKAGE = 256 * 1024 * 1024
MAX_MESHES = 96
MAX_VERTICES = 300_000
MAX_TOTAL_VERTICES = 600_000
MAX_NODES = 2_000


def _pointer(obj, pointer):
    if not isinstance(pointer, dict) or pointer.get("m_FileID") != 0:
        return None
    return obj.assets_file.objects.get(pointer.get("m_PathID"))


def _material(pointer):
    try:
        obj = pointer.deref()
        tree = obj.read_typetree()
        props = tree.get("m_SavedProperties", {})
        colors = dict(props.get("m_Colors", []))
        value = colors.get("_BaseColor") or colors.get("_Color") or {}
        color = [float(value.get(axis, 1)) for axis in "rgb"]
        texture = None
        for key, env in props.get("m_TexEnvs", []):
            if key in ("_MainTex", "_BaseMap") and env.get("m_Texture", {}).get("m_PathID"):
                target = _pointer(obj, env["m_Texture"])
                if target:
                    texture = _texture_ref(target)
                if texture:
                    break
        return {"color": color, "texture": texture}
    except (OSError, ValueError, AttributeError, KeyError, TypeError):
        return {"color": [0.75, 0.78, 0.82], "texture": None}


def _texture_ref(obj):
    try:
        if obj.type.name != "Texture2D":
            return None
        image = obj.read().image
        image.thumbnail((512, 512))
        out = BytesIO()
        image.convert("RGBA").save(out, format="PNG", optimize=True)
        if out.tell() > 768 * 1024:
            return None
        return base64.b64encode(out.getvalue()).decode("ascii")
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
    return {
        "positions": [round(float(x), 6) for vertex in positions for x in vertex[:3]],
        "normals": [round(float(x), 5) for normal in handler.m_Normals for x in normal[:3]] if len(handler.m_Normals) == len(positions) else [],
        "uv": [round(float(x), 5) for uv in handler.m_UV0 for x in uv[:2]] if len(handler.m_UV0) == len(positions) else [],
        "indices": indices,
        "groups": groups,
        "materials": [_material(materials[i]) if i < len(materials) else {"color": [0.75, 0.78, 0.82], "texture": None}
                      for i in range(len(triangles))],
    }


def _node(game_object, depth, visited, count):
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
    output = {"name": tree.get("m_Name", "Part")[:80], "position": [position["m_LocalPosition"][x] for x in "xyz"],
              "rotation": [position["m_LocalRotation"][x] for x in "xyzw"],
              "scale": [position["m_LocalScale"][x] for x in "xyz"], "children": []}
    if renderer and count[0] < MAX_MESHES:
        try:
            rendered = renderer.read()
            mesh = mesh_filter.read().m_Mesh if mesh_filter else rendered.m_Mesh
            geometry = _geometry(mesh, rendered.m_Materials)
            if geometry and count[1] + len(geometry["positions"]) // 3 <= MAX_TOTAL_VERTICES:
                output["mesh"] = geometry
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
            node = _node(child_go, depth + 1, visited, count)
            if node:
                output["children"].append(node)
    return output


def model(appearance, kind, identity):
    if kind not in ("characters", "vehicles", "wheels") or type(identity) is not int:
        raise ValueError("This appearance cannot be displayed in 3D.")
    with appearance.lock:
        reference = appearance.model_refs.get(f"{kind}:{identity}")
        game = appearance.game
    if not reference or not game:
        raise ValueError("No installed model is available for this appearance.")
    directory = Path(reference["directory"]).resolve()
    root = Path(game).resolve()
    workshop = (root.parent.parent / "workshop/content/2269950").resolve()
    if not (directory.is_relative_to(root / "Mods") or directory.is_relative_to(workshop)):
        raise ValueError("The model path is outside installed game content.")
    bundles = sorted(p for p in directory.glob("*.bundle") if p.resolve().is_relative_to(directory))
    if not bundles or sum(p.stat().st_size for p in bundles) > MAX_PACKAGE or any(p.stat().st_size > 64 * 1024 * 1024 for p in bundles):
        raise ValueError("This model package is too large for the lightweight viewer.")
    signature = hashlib.sha256(json.dumps([2, reference["prefab"],
        *[(str(p), p.stat().st_size, p.stat().st_mtime_ns) for p in bundles]]).encode()).hexdigest()
    cache = appearance.folder / "models" / (signature + ".json.gz")
    if cache.is_file() and cache.stat().st_size < 8 * 1024 * 1024:
        return cache.read_bytes()
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
    if prefab is None or prefab.type.name != "GameObject":
        raise ValueError("The installed prefab could not be resolved.")
    tree = _node(prefab, 0, set(), [0, 0, 0])
    def mesh_count(node):
        return (1 if node.get("mesh") else 0) + sum(mesh_count(x) for x in node["children"])
    if not tree or mesh_count(tree) == 0:
        raise ValueError("This prefab does not contain a supported mesh.")
    raw = gzip.compress(json.dumps({"kind": kind, "id": identity, "root": tree}, separators=(",", ":")).encode(), compresslevel=6)
    if len(raw) > 8 * 1024 * 1024:
        raise ValueError("This model exceeds the preview size limit.")
    cache.parent.mkdir(exist_ok=True)
    temporary = cache.with_name(cache.name + "." + uuid.uuid4().hex + ".tmp")
    try:
        temporary.write_bytes(raw)
        temporary.replace(cache)
    finally:
        temporary.unlink(missing_ok=True)
    return raw
