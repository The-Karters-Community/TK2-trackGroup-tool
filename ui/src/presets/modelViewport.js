import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createModel, createSetup, visibleBounds } from "./modelScene.js";

export function framingDistance(size, quaternion, fov, aspect) {
  const vertical = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const horizontal = vertical * aspect;
  const inverse = quaternion.clone().invert();
  let distance = 0;
  for (const x of [-0.5, 0.5])
    for (const y of [-0.5, 0.5])
      for (const z of [-0.5, 0.5]) {
        const point = new THREE.Vector3(
          size.x * x,
          size.y * y,
          size.z * z,
        ).applyQuaternion(inverse);
        distance = Math.max(
          distance,
          point.z + Math.abs(point.x) / horizontal,
          point.z + Math.abs(point.y) / vertical,
        );
      }
  return Math.max(0.5, distance * 1.25);
}

export function centerModel(root) {
  const asset = new THREE.Group();
  asset.add(root);
  const bounds = visibleBounds(THREE, asset);
  const size = bounds.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(longest) || longest <= 0)
    throw new Error("Invalid model dimensions.");
  // Animated roots must retain their authored position. Center a parent
  // wrapper, otherwise the next animation frame undoes the centering.
  const centered = new THREE.Group();
  centered.position.sub(bounds.getCenter(new THREE.Vector3()));
  centered.add(root);
  asset.add(centered);
  asset.scale.setScalar(1.8 / longest);
  asset.scale.x *= -1;

  return { asset, size, longest };
}

export function alphaBounds(pixels, width, height) {
  let left = width,
    right = -1,
    top = height,
    bottom = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] > 8) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  return right < left
    ? null
    : { left, top, width: right - left + 1, height: bottom - top + 1 };
}

// One renderer and lighting environment per editor. Keep the previous setup
// interactive while fetching a selection; only model resources are replaced.
export function createViewport(host, isPlaying) {
  let activeHost = host;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  host.replaceChildren(renderer.domElement);
  renderer.domElement.setAttribute(
    "aria-label",
    "Interactive installed model: drag to rotate, scroll to zoom",
  );
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  const scene = new THREE.Scene();
  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const lighting = pmrem.fromScene(environment, 0.04);
  scene.environment = lighting.texture;
  scene.environmentIntensity = 0.45;
  environment.dispose();
  pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 1.2;
  controls.maxDistance = 8;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x61756c, 0.8));
  const key = new THREE.DirectionalLight(0xffe5c7, 2);
  key.position.set(3, 5, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xaecaff, 0.5);
  fill.position.set(-3, 1, -2);
  scene.add(fill);
  let current,
    frame,
    dirty = true,
    lastFit = 0,
    speed = 1;
  function reframe(resetZoom = false) {
    if (!current) return;
    const offset = camera.position.clone().sub(controls.target);
    const zoom = resetZoom || !lastFit ? 1 : offset.length() / lastFit;
    const fit = framingDistance(
      current.size,
      camera.quaternion,
      camera.fov,
      camera.aspect,
    );
    camera.position
      .copy(controls.target)
      .add(offset.normalize().multiplyScalar(fit * zoom));
    controls.minDistance = fit * 0.25;
    controls.maxDistance = fit * 4;
    lastFit = fit;
    dirty = true;
  }
  function reset() {
    camera.position.set(2.2, 1.3, 3.1);
    controls.target.set(0, 0, 0);
    controls.update();
    reframe(true);
    dirty = true;
  }
  reset();
  function fitHost() {
    const width = activeHost.clientWidth,
      height = activeHost.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    reframe();
    dirty = true;
  }
  const resize = new ResizeObserver(fitHost);
  resize.observe(host);
  fitHost();
  const clock = new THREE.Clock();
  function draw() {
    frame = requestAnimationFrame(draw);
    const delta = Math.min(clock.getDelta(), 0.05);
    if (document.hidden) return;
    if (current && isPlaying()) {
      current.models.forEach((m) => m.mixer.update(delta * speed));
      current.resources.forEach((r) => {
        if (r.userData?.clock) r.userData.clock.value += delta;
      });
    }
    const moved = controls.update();
    if (moved || dirty || (current?.motion && isPlaying())) {
      renderer.render(scene, camera);
      dirty = false;
    }
  }
  draw();
  function release(entry) {
    if (!entry) return;
    entry.models.forEach((m) => {
      m.mixer.stopAllAction();
      m.mixer.uncacheRoot(m.root);
    });
    entry.resources.forEach((r) => r.dispose());
    scene.remove(entry.asset);
  }
  return {
    reset,
    async snapshot() {
      // Serialize only after images have decoded, then render/copy in the same
      // task. No preserveDrawingBuffer or continuously rendered card canvases.
      const target = current;
      if (!target) throw new Error("The setup is not ready yet.");
      const deadline = performance.now() + 5000;
      while (target.resources.some((r) => r.isTexture && !r.image)) {
        if (performance.now() >= deadline)
          throw new Error("Setup textures are still loading.");
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      if (target !== current)
        throw new Error("The setup changed before its picture was ready.");
      reset();
      renderer.render(scene, camera);
      // Card pictures should use their space, rather than inherit the orbit
      // viewer's conservative camera margins. Trim only transparent pixels.
      const source = renderer.domElement;
      const copy = document.createElement("canvas");
      copy.width = source.width;
      copy.height = source.height;
      const context = copy.getContext("2d", { willReadFrequently: true });
      context.drawImage(source, 0, 0);
      const bounds = alphaBounds(
        context.getImageData(0, 0, copy.width, copy.height).data,
        copy.width,
        copy.height,
      );
      if (!bounds)
        throw new Error("The setup did not produce a visible image.");
      const padding = Math.max(
        6,
        Math.ceil(Math.max(bounds.width, bounds.height) * 0.06),
      );
      const picture = document.createElement("canvas");
      picture.width = bounds.width + padding * 2;
      picture.height = bounds.height + padding * 2;
      picture
        .getContext("2d")
        .drawImage(
          copy,
          bounds.left,
          bounds.top,
          bounds.width,
          bounds.height,
          padding,
          padding,
          bounds.width,
          bounds.height,
        );
      return picture.toDataURL("image/png");
    },
    // Enlarging moves the existing canvas into a native top-layer dialog.
    // Retain the scene, animation position and GPU resources during the move.
    attach(nextHost) {
      if (!nextHost || nextHost === activeHost) return;
      resize.disconnect();
      delete activeHost.dataset.meshes;
      delete activeHost.dataset.animated;
      activeHost = nextHost;
      activeHost.replaceChildren(renderer.domElement);
      if (current) {
        activeHost.dataset.meshes = String(current.meshCount);
        activeHost.dataset.animated = String(current.motion);
      }
      resize.observe(activeHost);
      fitHost();
    },
    setSpeed(value) {
      speed = value;
    },
    seek(fraction) {
      if (!current) return;
      current.models.forEach((m) =>
        m.mixer.setTime(current.duration * fraction),
      );
      dirty = true;
    },
    progress() {
      return current?.duration
        ? (current.models[0].mixer.time % current.duration) / current.duration
        : 0;
    },
    show(data, kind) {
      const resources = [];
      resources.invalidate = () => {
        dirty = true;
      };
      let result;
      try {
        result =
          kind === "setup"
            ? createSetup(THREE, data, resources)
            : createModel(
                THREE,
                data,
                resources,
                kind === "characters" ? "standing" : "seated",
              );
        if (!result.meshCount)
          throw new Error("This model contains no supported meshes.");
        const { asset, size, longest } = centerModel(result.root);
        const models = result.models || [result];
        const motion =
          models.some((m) => !m.warning && m.animated) ||
          resources.some((r) => r.userData?.clock);
        release(current);
        current = {
          asset,
          models,
          resources,
          motion,
          meshCount: result.meshCount,
          size: size.multiplyScalar(1.8 / longest),
          duration: Math.max(
            ...(kind === "characters"
              ? models[0].rig.standingAnimations || []
              : models[0].rig.animations || []
            ).map((a) => a.duration),
            0.01,
          ),
        };
        scene.add(asset);
        reframe();
        dirty = true;
        activeHost.dataset.meshes = String(result.meshCount);
        activeHost.dataset.animated = String(motion);
        return {
          motion,
          warning: models.find((m) => m.warning)?.warning || "",
          choices: models[0].rig.animationChoices || [],
        };
      } catch (error) {
        if (result)
          (result.models || [result]).forEach((m) => m.mixer.stopAllAction());
        resources.forEach((r) => r.dispose());
        throw error;
      }
    },
    dispose() {
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.dispose();
      release(current);
      current = null;
      lighting.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
