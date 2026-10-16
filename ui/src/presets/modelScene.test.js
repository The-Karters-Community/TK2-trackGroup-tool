import { it, expect } from "vitest";
import * as THREE from "three";
import {
  createModel,
  createSetup,
  stickerSettings,
  visibleBounds,
  normalizeWheel,
} from "./modelScene.js";

function node(id, position = [0, 0, 0], children = []) {
  return {
    id,
    name: id,
    path: id,
    position,
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
    children,
  };
}
function model(root, rig = {}) {
  return { root, rig: { animations: [], hidden: [], ...rig } };
}

it("normalizes centimetre-sized wheel geometry like the game's wheel loader", () => {
  const root = new THREE.Group(),
    child = new THREE.Group();
  child.add(new THREE.Mesh(new THREE.BoxGeometry(80, 140, 140)));
  child.scale.setScalar(0.01);
  root.add(child);
  normalizeWheel(THREE, root);
  expect(visibleBounds(THREE, root).getSize(new THREE.Vector3()).y).toBeCloseTo(
    1,
  );
  expect(child.scale.x).toBeCloseTo(1 / 140);
});

it("fits only visible geometry, excluding hidden preview helpers", () => {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2)));
  const hidden = new THREE.Group();
  hidden.visible = false;
  const helper = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100));
  helper.position.y = 1000;
  hidden.add(helper);
  root.add(hidden);
  expect(
    visibleBounds(THREE, root).getSize(new THREE.Vector3()).toArray(),
  ).toEqual([2, 2, 2]);
});

it("ignores distant negligible authoring surfaces when framing a character", () => {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(2, 6, 2)));
  const helper = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.004));
  helper.position.set(14, 0, 0);
  root.add(helper);
  const box = visibleBounds(THREE, root);
  expect(box.getCenter(new THREE.Vector3()).toArray()).toEqual([0, 0, 0]);
  expect(box.getSize(new THREE.Vector3()).toArray()).toEqual([2, 6, 2]);
  expect(helper.visible).toBe(true);
});

it("labels a clip requiring unsupported retargeting and restores the rest pose", () => {
  const surface = () => ({
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    normals: [],
    uv: [],
    indices: [0, 1, 2],
    groups: [[0, 3, 0]],
    materials: [],
  });
  const fixed = node("fixed"),
    moving = node("moving");
  fixed.mesh = surface();
  moving.mesh = surface();
  const result = createModel(
    THREE,
    model(node("root", [0, 0, 0], [fixed, moving]), {
      animations: [
        {
          name: "runtime",
          duration: 1,
          tracks: [
            {
              node: "moving",
              property: "position",
              times: [0, 1],
              values: [0, 1000, 0, 0, 1000, 0],
            },
          ],
        },
      ],
    }),
    [],
  );
  expect(result.warning).toContain("retargeting");
  expect(result.nodes.get("moving").position.y).toBe(0);
});

it("deforms a skinned vertex with the decoded bone animation and bind pose", () => {
  const bone = node("bone", [2, 0, 0]);
  const surface = node("surface");
  surface.mesh = {
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    normals: [],
    uv: [],
    indices: [0, 1, 2],
    groups: [[0, 3, 0]],
    materials: [],
    skinIndices: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    skinWeights: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    bones: ["bone"],
    bindPoses: [new THREE.Matrix4().makeTranslation(-2, 0, 0).toArray()],
  };
  const data = model(node("root", [0, 0, 0], [bone, surface]), {
    animations: [
      {
        name: "idle",
        duration: 1,
        tracks: [
          {
            node: "bone",
            property: "position",
            times: [0, 1],
            values: [3, 0, 0, 5, 0, 0],
          },
        ],
      },
    ],
  });
  const resources = [];
  const result = createModel(THREE, data, resources);
  result.root.updateMatrixWorld(true);
  const mesh = result.nodes.get("surface").children[0];
  expect(mesh.isSkinnedMesh).toBe(true);
  expect(mesh.applyBoneTransform(0, new THREE.Vector3()).x).toBeCloseTo(1);
  result.mixer.update(0.5);
  result.root.updateMatrixWorld(true);
  expect(mesh.applyBoneTransform(0, new THREE.Vector3()).x).toBeCloseTo(2);
  resources.forEach((r) => r.dispose());
});

it("attaches character and four wheels to the authored sockets without a game renderer", () => {
  const character = model(node("character"), { offset: [0, 0.5, 0] });
  const sockets = [
    node("fl", [-1, 0, 1]),
    node("fr", [1, 0, 1]),
    node("bl", [-1, 0, -1]),
    node("br", [1, 0, -1]),
  ];
  const vehicle = model(
    node("vehicle", [0, 0, 0], [node("seat", [0, 1, 0]), ...sockets]),
    {
      characterSocket: "seat",
      wheels: sockets.map((n) => ({ node: n.id, scale: 2 })),
    },
  );
  const result = createSetup(
    THREE,
    {
      parts: {
        characters: character,
        vehicles: vehicle,
        wheels: model(node("wheel")),
      },
    },
    [],
  );
  expect(result.models).toHaveLength(6);
  expect(
    result.models[0].root.getWorldPosition(new THREE.Vector3()).y,
  ).toBeCloseTo(1.5);
  for (const wheel of result.models.slice(2))
    expect(wheel.root.scale.x).toBe(2);
  expect(
    result.models[2].root.getWorldPosition(new THREE.Vector3()).toArray(),
  ).toEqual([-1, 0, 1]);
});

it("honors a character that intentionally hides the vehicle and wheels", () => {
  const result = createSetup(
    THREE,
    { parts: { characters: model(node("hoverboard"), { hideVehicle: true }) } },
    [],
  );
  expect(result.models).toHaveLength(1);
  expect(result.root.children[0].name).toBe("hoverboard");
});

it("does not attach separate wheels when the vehicle hides them", () => {
  const result = createSetup(
    THREE,
    {
      parts: {
        characters: model(node("character")),
        vehicles: model(node("vehicle", [0, 0, 0], [node("seat")]), {
          characterSocket: "seat",
          hideWheels: true,
          wheels: [{ node: "missing", scale: 1 }],
        }),
      },
    },
    [],
  );
  expect(result.models).toHaveLength(2);
});

it("decodes default and customized packed sticker transforms", () => {
  expect(stickerSettings(-1)).toEqual({
    repeat: 1,
    offset: [0, 0],
    rotation: 0,
    color: 0,
    opacity: 1,
  });
  const packed = 7 | (23 << 4) | (7 << 9) | (4 << 14) | (2 << 18) | (1 << 22);
  const result = stickerSettings(packed);
  expect(result.repeat).toBe(0.5);
  expect(result.offset).toEqual([-0.25, 0.25]);
  expect(result.rotation).toBeCloseTo(Math.PI / 2);
  expect(result.color).toBe(2);
  expect(result.opacity).toBeCloseTo(2 / 3);
});

it("uses the standing menu clip only for the selected character part", () => {
  const clip = (name, y) => ({
    name,
    duration: 1,
    tracks: [
      {
        node: "body",
        property: "position",
        times: [0, 1],
        values: [0, y, 0, 0, y, 0],
      },
    ],
  });
  const data = model(node("body"), {
    animations: [clip("seated", 1)],
    standingAnimations: [clip("menu", 2)],
  });
  const seated = createModel(THREE, data, []);
  const standing = createModel(THREE, data, [], "standing");
  expect(seated.root.position.y).toBe(1);
  expect(standing.root.position.y).toBe(2);
  expect(standing.animated).toBe(true);
});
