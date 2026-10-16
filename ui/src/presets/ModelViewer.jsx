import { useEffect, useRef, useState } from "react";
import { createModel, createSetup, visibleBounds } from "./modelScene.js";

export default function ModelViewer({ kind, id, loadModel, preset, view }) {
  const host = useRef(null);
  const cameraState = useRef(null);
  const [message, setMessage] = useState("Loading installed models…");
  const [warning, setWarning] = useState("");
  const [hasMotion, setHasMotion] = useState(false);
  const [animated, setAnimated] = useState(
    () => !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  const playing = useRef(animated);
  playing.current = animated;
  const request = JSON.stringify(
    kind === "setup" ? { kind, data: preset, view } : { kind, id },
  );
  useEffect(() => {
    if (!host.current) return;
    let disposed = false;
    let cleanup = () => {};
    const abort = new AbortController();
    const resources = [];
    async function start() {
      setMessage("Loading installed models…");
      setWarning("");
      try {
        const [THREE, { OrbitControls }, data] = await Promise.all([
          import("three"),
          import("three/addons/controls/OrbitControls.js"),
          loadModel(JSON.parse(request), abort.signal),
        ]);
        if (disposed || !host.current) return;
        const canvas = document.createElement("canvas");
        canvas.setAttribute(
          "aria-label",
          kind === "setup"
            ? "Interactive full setup"
            : `Interactive ${kind.slice(0, -1)} model`,
        );
        host.current.replaceChildren(canvas);
        const renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: true,
          alpha: true,
        });
        cleanup = () => {
          resources.forEach((r) => r.dispose());
          renderer.dispose();
          renderer.forceContextLoss();
          canvas.remove();
        };
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x61756c, 2.2));
        const key = new THREE.DirectionalLight(0xffffff, 2.1);
        key.position.set(3, 5, 4);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0xaecaff, 1);
        fill.position.set(-3, 1, -2);
        scene.add(fill);
        const asset = new THREE.Group();
        const result =
          kind === "setup"
            ? createSetup(THREE, data, resources)
            : createModel(THREE, data, resources);
        const models = result.models || [result];
        const motion = models.some(
          (m) => !m.warning && m.rig.animations?.length,
        );
        setHasMotion(motion);
        setWarning(models.find((m) => m.warning)?.warning || "");
        asset.add(result.root);
        scene.add(asset);
        if (!result.meshCount)
          throw new Error("This model contains no supported meshes.");
        scene.updateMatrixWorld(true);
        const bounds = visibleBounds(THREE, asset);
        const size = bounds.getSize(new THREE.Vector3());
        const longest = Math.max(size.x, size.y, size.z);
        if (!Number.isFinite(longest) || longest <= 0)
          throw new Error("Invalid model dimensions.");
        result.root.position.sub(bounds.getCenter(new THREE.Vector3()));
        asset.scale.setScalar(1.8 / longest);
        asset.scale.x *= -1;
        camera.position.fromArray(
          cameraState.current?.position || [2.2, 1.3, 3.1],
        );
        const controls = new OrbitControls(camera, canvas);
        controls.enableDamping = true;
        controls.enablePan = true;
        controls.minDistance = 1.2;
        controls.maxDistance = 8;
        if (cameraState.current)
          controls.target.fromArray(cameraState.current.target);
        const resize = new ResizeObserver(() => {
          if (!host.current) return;
          const width = host.current.clientWidth,
            height = host.current.clientHeight;
          if (width && height) {
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height, false);
          }
        });
        resize.observe(host.current);
        const clock = new THREE.Clock();
        let frame;
        function draw() {
          frame = requestAnimationFrame(draw);
          const delta = Math.min(clock.getDelta(), 0.05);
          if (document.hidden) return;
          if (playing.current)
            models.forEach((model) => model.mixer.update(delta));
          controls.update();
          renderer.render(scene, camera);
        }
        draw();
        setMessage("");
        host.current.dataset.meshes = String(result.meshCount);
        host.current.dataset.animated = String(motion);
        cleanup = () => {
          cameraState.current = {
            position: camera.position.toArray(),
            target: controls.target.toArray(),
          };
          cancelAnimationFrame(frame);
          resize.disconnect();
          controls.dispose();
          models.forEach((m) => {
            m.mixer.stopAllAction();
            m.mixer.uncacheRoot(m.root);
          });
          resources.forEach((r) => r.dispose());
          renderer.dispose();
          renderer.forceContextLoss();
          canvas.remove();
        };
      } catch (error) {
        cleanup();
        if (!disposed)
          setMessage(error.message || "Model preview unavailable.");
      }
    }
    start();
    return () => {
      disposed = true;
      abort.abort();
      cleanup();
    };
  }, [request, kind, loadModel]);
  return (
    <>
      <div className="model-viewer">
        <div className="model-canvas" ref={host} />
        {message ? (
          <p className="model-message" role="status">
            {message}
          </p>
        ) : (
          <>
            <span className="model-hint">Drag to rotate · Scroll to zoom</span>
            {hasMotion && (
              <button
                className="model-motion"
                aria-pressed={animated}
                onClick={() => setAnimated((v) => !v)}
              >
                {animated ? "Pause motion" : "Play motion"}
              </button>
            )}
          </>
        )}
      </div>
      {warning && !message && (
        <p className="hint" role="status">
          {warning}
        </p>
      )}
    </>
  );
}
