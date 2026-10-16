import { it, expect, vi } from "vitest";
import { createModelLoader } from "./modelData.js";

it("fetches only changed parts across setup combinations and selected-part views", async () => {
  const load = vi.fn(async (request) =>
    request.kind === "setup-plan"
      ? {
          parts: { characters: 1, vehicles: 2, wheels: request.data.wheel },
          stickers: [],
        }
      : { kind: request.kind, id: request.id, rig: {} },
  );
  const model = createModelLoader(load);
  await model({ kind: "setup", data: { wheel: 3 } });
  await model({ kind: "setup", data: { wheel: 4 } });
  await model({ kind: "characters", id: 1 });
  expect(load.mock.calls.map(([r]) => `${r.kind}:${r.id || ""}`)).toEqual([
    "setup-plan:",
    "characters:1",
    "vehicles:2",
    "wheels:3",
    "setup-plan:",
    "wheels:4",
  ]);
});

it("deduplicates in-flight requests, retries failures and evicts bounded data", async () => {
  const load = vi
    .fn()
    .mockRejectedValueOnce(new Error("retry"))
    .mockImplementation(async (r) => ({ id: r.id }));
  const model = createModelLoader(load, 20);
  await expect(model({ kind: "wheels", id: 1 })).rejects.toThrow("retry");
  await Promise.all([
    model({ kind: "wheels", id: 1 }),
    model({ kind: "wheels", id: 1 }),
  ]);
  expect(load).toHaveBeenCalledTimes(2);
  await model({ kind: "wheels", id: 2 });
  await model({ kind: "wheels", id: 1 });
  expect(load).toHaveBeenCalledTimes(4);
});

it("resolves only mounted stickers and reuses their textures across settings changes", async () => {
  const load = vi.fn(async (r) => {
    if (r.kind === "setup-plan")
      return {
        parts: { characters: 1, vehicles: 2, wheels: 3 },
        stickers: [
          { id: 4, settings: r.data.setting },
          { id: 4, settings: 0 },
          { id: 999, settings: 0 },
        ],
      };
    if (r.kind === "stickers") return { texture: "image" };
    return {
      rig:
        r.kind === "vehicles"
          ? { hideWheels: true, stickerSlots: ["slot"] }
          : {},
    };
  });
  const model = createModelLoader(load);
  await model({ kind: "setup", data: { setting: 1 } });
  const result = await model({ kind: "setup", data: { setting: 2 } });
  expect(result.stickers).toEqual([
    { texture: "image", settings: 2 },
    { texture: "image", settings: 0 },
  ]);
  expect(
    load.mock.calls.filter(([r]) => r.kind === "stickers").map(([r]) => r.id),
  ).toEqual([4]);
  expect(load.mock.calls.some(([r]) => r.kind === "wheels")).toBe(false);
});
