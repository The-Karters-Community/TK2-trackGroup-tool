import { it, expect, vi } from "vitest";
import * as THREE from "three";
import { modelMaterial, shiftHue } from "./modelMaterials.js";

it("retains HSV saturation and value when shifting the fire's hot color", () => {
  shiftHue([1, 0, 0], 1 / 3).forEach((value, i) =>
    expect(value).toBeCloseTo([0, 1, 0][i]),
  );
  expect(shiftHue([0.5, 0.5, 0.5], 0.3)).toEqual([0.5, 0.5, 0.5]);
});

it("resolves shared images and applies authored UV and alpha properties", () => {
  const load = vi
    .spyOn(THREE.TextureLoader.prototype, "load")
    .mockImplementation(() => new THREE.Texture());
  const resources = [];
  try {
    const material = modelMaterial(
      THREE,
      {
        color: [1, 1, 1],
        texture: "@image",
        uvScale: [2, 3],
        uvOffset: [0.2, 0.4],
        transparent: true,
        opacity: 0.6,
        alphaTest: 0.2,
      },
      resources,
      { image: "image-data" },
    );
    expect(load).toHaveBeenCalledWith("data:image/png;base64,image-data");
    expect(material.map.repeat.toArray()).toEqual([2, 3]);
    expect(material.map.offset.toArray()).toEqual([0.2, 0.4]);
    expect(material.opacity).toBe(0.6);
    expect(material.alphaTest).toBe(0.2);
    expect(material.transparent).toBe(true);
  } finally {
    load.mockRestore();
    resources.forEach((r) => r.dispose());
  }
});
