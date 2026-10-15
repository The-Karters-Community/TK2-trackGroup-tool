import { useEffect, useRef, useState } from "react";

// The model data comes from locally installed Unity bundles. Three.js is loaded
// only when the user opens this viewer; no game meshes ship with the app.
export default function ModelViewer({ kind, id, loadModel }) {
  const host = useRef(null);
  const [message, setMessage] = useState("Loading installed model…");
  useEffect(() => {
    if (!host.current) return;
    let disposed = false;
    let cleanup = () => {};
    const abort = new AbortController();
    async function start() {
      try {
        const [THREE, { OrbitControls }, data] = await Promise.all([
          import("three"),
          import("three/addons/controls/OrbitControls.js"),
          loadModel({ kind, id }, abort.signal),
        ]);
        if (disposed || !host.current) return;
        const canvas = document.createElement("canvas");
        canvas.setAttribute(
          "aria-label",
          `Interactive ${kind.slice(0, -1)} model`,
        );
        host.current.replaceChildren(canvas);
        const renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: true,
          alpha: true,
        });
        cleanup = () => {
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
        const resources = [];
        let meshCount = 0;
        function build(node) {
          const group = new THREE.Group();
          group.position.fromArray(node.position);
          group.quaternion.fromArray(node.rotation);
          group.scale.fromArray(node.scale);
          if (node.mesh) {
            const source = node.mesh;
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute(
              "position",
              new THREE.Float32BufferAttribute(source.positions, 3),
            );
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
            geometry.setIndex(source.indices);
            for (const [start, count, material] of source.groups)
              geometry.addGroup(start, count, material);
            const materials = source.materials.map((item) => {
              const m = new THREE.MeshStandardMaterial({
                color: new THREE.Color().setRGB(...item.color),
                roughness: 0.85,
                side: THREE.DoubleSide,
              });
              if (item.texture) {
                const texture = new THREE.TextureLoader().load(
                  `data:image/png;base64,${item.texture}`,
                );
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
                m.map = texture;
                resources.push(texture);
              }
              resources.push(m);
              return m;
            });
            if (!materials.length) {
              materials.push(
                new THREE.MeshStandardMaterial({
                  color: 0xc8d4d5,
                  side: THREE.DoubleSide,
                }),
              );
              resources.push(materials[0]);
            }
            group.add(new THREE.Mesh(geometry, materials));
            resources.push(geometry);
            meshCount += 1;
          }
          for (const child of node.children) group.add(build(child));
          return group;
        }
        const modelRoot = build(data.root);
        asset.add(modelRoot);
        scene.add(asset);
        if (!meshCount)
          throw new Error("This model contains no supported meshes.");
        const bounds = new THREE.Box3().setFromObject(asset);
        const size = bounds.getSize(new THREE.Vector3());
        const longest = Math.max(size.x, size.y, size.z);
        if (!Number.isFinite(longest) || longest <= 0)
          throw new Error("Invalid model dimensions.");
        const center = bounds.getCenter(new THREE.Vector3());
        modelRoot.position.sub(center);
        asset.scale.setScalar(1.8 / longest);
        // Unity assets use a left-handed coordinate system. Reflect as a group,
        // while two-sided materials keep submeshes visible during inspection.
        asset.scale.x *= -1;
        camera.position.set(0, 0.1, 3.4);
        const controls = new OrbitControls(camera, canvas);
        controls.enableDamping = true;
        controls.enablePan = false;
        controls.minDistance = 1.4;
        controls.maxDistance = 8;
        const resize = new ResizeObserver(() => {
          if (!host.current) return;
          const width = host.current.clientWidth;
          const height = host.current.clientHeight;
          if (width && height) {
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height, false);
          }
        });
        resize.observe(host.current);
        let frame;
        function draw() {
          frame = requestAnimationFrame(draw);
          controls.update();
          renderer.render(scene, camera);
        }
        draw();
        setMessage("");
        cleanup = () => {
          cancelAnimationFrame(frame);
          resize.disconnect();
          controls.dispose();
          resources.forEach((resource) => resource.dispose());
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
  }, [kind, id, loadModel]);
  return (
    <div className="model-viewer">
      <div className="model-canvas" ref={host} />
      {message && (
        <p className="model-message" role="status">
          {message}
        </p>
      )}
      {!message && (
        <span className="model-hint">Drag to rotate · Scroll to zoom</span>
      )}
    </div>
  );
}
