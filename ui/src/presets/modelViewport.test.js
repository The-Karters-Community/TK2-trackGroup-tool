import { it, expect } from "vitest";
import * as THREE from "three";
import { framingDistance, centerModel, alphaBounds } from "./modelViewport.js";

it("trims only transparent snapshot margins without cutting visible edges", () => {
  const pixels = new Uint8ClampedArray(8 * 6 * 4);
  pixels[(1 * 8 + 2) * 4 + 3] = 255;
  pixels[(4 * 8 + 7) * 4 + 3] = 9;
  expect(alphaBounds(pixels, 8, 6)).toEqual({ left: 2, top: 1, width: 6, height: 4 });
  expect(alphaBounds(new Uint8ClampedArray(8 * 6 * 4), 8, 6)).toBeNull();
});

it("fits every setup corner in narrow and wide previews without clipping", () => {
  for (const aspect of [0.45, 1, 1.8]) {
    const size = new THREE.Vector3(1.8, 1.2, 1.6);
    const camera = new THREE.PerspectiveCamera(40, aspect, 0.01, 100);
    const direction = new THREE.Vector3(2.2, 1.3, 3.1).normalize();
    camera.position.copy(direction);
    camera.lookAt(0, 0, 0);
    camera.position
      .copy(direction)
      .multiplyScalar(framingDistance(size, camera.quaternion, 40, aspect));
    camera.updateMatrixWorld(true);
    for (const x of [-0.5, 0.5])
      for (const y of [-0.5, 0.5])
        for (const z of [-0.5, 0.5]) {
          const screen = new THREE.Vector3(
            size.x * x,
            size.y * y,
            size.z * z,
          ).project(camera);
          expect(Math.abs(screen.x)).toBeLessThan(1);
          expect(Math.abs(screen.y)).toBeLessThan(1);
        }
  }
});

it("centers a wrapper without changing an animated root's authored transform", () => {
  const root = new THREE.Group();
  root.position.set(1000, 2000, -500);
  root.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2)));
  const { asset } = centerModel(root);
  expect(root.position.toArray()).toEqual([1000, 2000, -500]);
  root.position.set(1000, 2000, -500); // a subsequent animation frame
  asset.updateMatrixWorld(true);
  const center = new THREE.Box3()
    .setFromObject(asset)
    .getCenter(new THREE.Vector3());
  expect(center.length()).toBeLessThan(0.00001);
});
