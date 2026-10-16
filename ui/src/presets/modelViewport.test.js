import { it, expect } from "vitest";
import * as THREE from "three";
import { framingDistance } from "./modelViewport.js";

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
