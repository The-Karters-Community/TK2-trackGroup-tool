import { modelMaterial } from "./modelMaterials.js";

// Unity-local transforms stay intact until a single handedness conversion at
// the scene root. IDs are strings because Unity path IDs exceed JS safe ints.
export function visibleBounds(THREE, root) {
  const bounds = new THREE.Box3();
  const surfaces = [];
  root.updateMatrixWorld(true);
  root.traverseVisible((object) => {
    if (!object.isMesh) return;
    if (object.isSkinnedMesh) object.computeBoundingBox();
    else if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    const box = object.isSkinnedMesh
      ? object.boundingBox
      : object.geometry.boundingBox;
    const world = box.clone().applyMatrix4(object.matrixWorld);
    if (!world.isEmpty())
      surfaces.push({
        box: world,
        size: world.getSize(new THREE.Vector3()).length(),
      });
  });
  // Some Workshop prefabs retain millimetre-scale helper meshes metres away
  // from the character. They render as subpixels but must not shrink/recenter
  // the entire preview. Compare surface extents, never arbitrary object names.
  const largest = Math.max(0, ...surfaces.map((s) => s.size));
  for (const surface of surfaces)
    if (surface.size >= largest * 0.002) bounds.union(surface.box);
  return bounds;
}

// The game's wheel normalizer resets child 0, includes the origin in renderer
// bounds, then scales that child to one unit high before applying mount size.
export function normalizeWheel(THREE, root) {
  root.position.set(0, 0, 0);
  root.quaternion.identity();
  root.scale.setScalar(1);
  const child = root.children[0];
  if (!child) return;
  child.scale.setScalar(1);
  const bounds = visibleBounds(THREE, root);
  if (bounds.isEmpty()) return;
  bounds.expandByPoint(new THREE.Vector3());
  const height = bounds.getSize(new THREE.Vector3()).y;
  if (!Number.isFinite(height) || height <= 0)
    throw new Error("The selected wheel has invalid dimensions.");
  child.scale.setScalar(1 / height);
}

export function createModel(THREE, data, resources, pose = "seated") {
  resources.geometryCache ||= new WeakMap();
  const nodes = new Map();
  const pending = [];
  let meshCount = 0;
  function build(node) {
    const group = new THREE.Bone();
    group.name = node.name;
    group.position.fromArray(node.position);
    group.quaternion.fromArray(node.rotation);
    group.scale.fromArray(node.scale);
    group.visible = node.active !== false;
    nodes.set(node.id, group);
    if (node.mesh) {
      const source = node.mesh;
      let geometry = resources.geometryCache.get(source);
      if (!geometry) {
        geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(source.positions, 3),
        );
        geometry.setIndex(source.indices);
        if (source.normals.length === source.positions.length)
          geometry.setAttribute(
            "normal",
            new THREE.Float32BufferAttribute(source.normals, 3),
          );
        else geometry.computeVertexNormals();
        if (source.uv.length * 3 === source.positions.length * 2)
          geometry.setAttribute(
            "uv",
            new THREE.Float32BufferAttribute(source.uv, 2),
          );
        for (const [start, count, material] of source.groups)
          geometry.addGroup(start, count, material);
        resources.geometryCache.set(source, geometry);
        resources.push(geometry);
      }
      const materials = source.materials.map((item) =>
        modelMaterial(THREE, item, resources, data.textures),
      );
      if (!materials.length) {
        materials.push(
          new THREE.MeshStandardMaterial({
            color: 0xc8d4d5,
            side: THREE.DoubleSide,
          }),
        );
        resources.push(materials[0]);
      }
      let mesh;
      if (source.bones?.length && source.skinIndices?.length) {
        geometry.setAttribute(
          "skinIndex",
          new THREE.Uint16BufferAttribute(source.skinIndices, 4),
        );
        geometry.setAttribute(
          "skinWeight",
          new THREE.Float32BufferAttribute(source.skinWeights, 4),
        );
        mesh = new THREE.SkinnedMesh(geometry, materials);
        mesh.frustumCulled = false;
        pending.push([mesh, source]);
      } else mesh = new THREE.Mesh(geometry, materials);
      mesh.visible = source.visible !== false;
      group.add(mesh);
      meshCount++;
    }
    for (const child of node.children) group.add(build(child));
    return group;
  }
  const root = build(data.root);
  root.updateMatrixWorld(true);
  for (const [mesh, source] of pending) {
    const bones = source.bones.map((id) => nodes.get(id));
    if (bones.some((bone) => !bone))
      throw new Error("The installed model has unresolved skeleton bones.");
    const skeleton = new THREE.Skeleton(
      bones,
      source.bindPoses.map((matrix) => new THREE.Matrix4().fromArray(matrix)),
    );
    mesh.bind(skeleton, new THREE.Matrix4());
    mesh.normalizeSkinWeights();
    resources.push(skeleton);
  }
  for (const id of data.rig?.hidden || []) {
    const node = nodes.get(id);
    if (node) node.visible = false;
  }
  // Sticker renderers are authoring surfaces, not ordinary vehicle paint.
  // Both isolated vehicles and complete setups start with them hidden; only
  // applyStickers creates the configured layers from their geometry.
  for (const id of data.rig?.stickerSlots || []) {
    nodes.get(id)?.traverse((child) => {
      if (child.isMesh) child.visible = false;
    });
  }
  const mixer = new THREE.AnimationMixer(root);
  const restSize = visibleBounds(THREE, root)
    .getSize(new THREE.Vector3())
    .length();
  const animations =
    pose === "standing"
      ? data.rig?.standingAnimations || []
      : data.rig?.animations || [];
  for (const animation of animations) {
    const tracks = animation.tracks.flatMap((track) => {
      const node = nodes.get(track.node);
      if (!node) return [];
      let values = track.values;
      let property = track.property;
      if (property === "euler") {
        values = [];
        for (let i = 0; i < track.values.length; i += 3) {
          const angles = track.values
            .slice(i, i + 3)
            .map(THREE.MathUtils.degToRad);
          values.push(
            ...new THREE.Quaternion()
              .setFromEuler(new THREE.Euler(...angles, "ZXY"))
              .toArray(),
          );
        }
        property = "quaternion";
      }
      const Track =
        property === "quaternion"
          ? THREE.QuaternionKeyframeTrack
          : THREE.VectorKeyframeTrack;
      return [new Track(`${node.uuid}.${property}`, track.times, values)];
    });
    if (tracks.length)
      mixer
        .clipAction(
          new THREE.AnimationClip(animation.name, animation.duration, tracks),
        )
        .play();
  }
  mixer.update(0);
  const animatedSize = visibleBounds(THREE, root)
    .getSize(new THREE.Vector3())
    .length();
  const warning =
    animatedSize > restSize * 4
      ? "This asset's menu animation needs runtime retargeting; showing its rest pose."
      : "";
  if (warning) mixer.stopAllAction();
  return {
    root,
    nodes,
    mixer,
    meshCount,
    rig: data.rig || {},
    warning,
    animated: animations.length > 0,
  };
}

export function createSetup(THREE, data, resources) {
  const root = new THREE.Group();
  const character = createModel(THREE, data.parts.characters, resources);
  const models = [character];
  if (character.rig.hideVehicle) root.add(character.root);
  else {
    const vehicle = createModel(THREE, data.parts.vehicles, resources);
    models.push(vehicle);
    root.add(vehicle.root);
    const socket = vehicle.nodes.get(vehicle.rig.characterSocket);
    if (!socket)
      throw new Error(
        "The selected vehicle has no supported character socket.",
      );
    socket.add(character.root);
    character.root.position.fromArray(character.rig.offset || [0, 0, 0]);
    character.root.quaternion.fromArray(character.rig.rotation || [0, 0, 0, 1]);
    if (character.rig.scale)
      character.root.scale.fromArray(character.rig.scale);
    for (const [index, mount] of (vehicle.rig.hideWheels
      ? []
      : vehicle.rig.wheels || []
    ).entries()) {
      const node = vehicle.nodes.get(mount.node);
      if (!node)
        throw new Error("The selected vehicle has an unresolved wheel socket.");
      const wheel = createModel(THREE, data.parts.wheels, resources);
      normalizeWheel(THREE, wheel.root);
      if (index % 2) wheel.root.rotation.y = Math.PI;
      wheel.root.scale.setScalar(mount.scale);
      node.add(wheel.root);
      models.push(wheel);
    }
    if (!vehicle.rig.hideWheels && !vehicle.rig.wheels?.length)
      throw new Error("The selected vehicle has no supported wheel mounts.");
    applyStickers(THREE, vehicle, data.stickers || [], resources);
  }
  root.updateMatrixWorld(true);
  return {
    root,
    models,
    meshCount: models.reduce((sum, item) => sum + item.meshCount, 0),
  };
}

export function stickerSettings(packed) {
  const values =
    packed === -1
      ? [3, 15, 15, 0, 0, 0]
      : [
          packed & 15,
          (packed >>> 4) & 31,
          (packed >>> 9) & 31,
          (packed >>> 14) & 15,
          (packed >>> 18) & 15,
          (packed >>> 22) & 3,
        ];
  return {
    repeat: 4 / (values[0] + 1),
    offset: [0.5 - (values[1] + 1) / 32, 0.5 - (values[2] + 1) / 32],
    rotation: (values[3] * Math.PI) / 8,
    color: values[4],
    opacity: 1 - values[5] / 3,
  };
}

function applyStickers(THREE, vehicle, stickers, resources) {
  resources.stickerTextures ||= new Map();
  for (const [index, id] of (vehicle.rig.stickerSlots || []).entries()) {
    const node = vehicle.nodes.get(id);
    if (!node) continue;
    const surfaces = [];
    node.traverse((child) => {
      if (child.isMesh) surfaces.push(child);
    });
    surfaces.forEach((surface) => {
      surface.visible = false;
    });
    for (let layer = 0; layer < 2; layer++) {
      const sticker = stickers[index * 2 + layer];
      if (!sticker?.texture) continue;
      node.visible = true;
      const settings = stickerSettings(sticker.settings);
      const key = `${sticker.settings}:${sticker.texture}`;
      let texture = resources.stickerTextures.get(key);
      if (!texture) {
        texture = new THREE.TextureLoader().load(
          `data:image/png;base64,${sticker.texture}`,
          resources.invalidate,
        );
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.center.set(0.5, 0.5);
        texture.repeat.setScalar(settings.repeat);
        texture.offset.fromArray(settings.offset);
        texture.rotation = settings.rotation;
        resources.stickerTextures.set(key, texture);
        resources.push(texture);
      }
      const material = new THREE.MeshStandardMaterial({
        map: texture,
        color: 0xffffff,
        transparent: true,
        opacity: settings.opacity,
        alphaTest: 0.01,
        depthWrite: false,
        roughness: 0.9,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -(layer + 1),
        polygonOffsetUnits: -(layer + 1),
      });
      resources.push(material);
      for (const surface of surfaces) {
        const decal = new THREE.Mesh(surface.geometry, material);
        decal.position.copy(surface.position);
        decal.quaternion.copy(surface.quaternion);
        decal.scale.copy(surface.scale);
        decal.renderOrder = 10 + layer;
        surface.parent.visible = true;
        surface.parent.add(decal);
      }
    }
  }
}
