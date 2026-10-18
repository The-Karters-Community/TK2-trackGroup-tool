import { expect, it, vi } from "vitest";
import { createSnapshotQueue } from "./setupSnapshots.js";

it("renders one card at a time and reuses identical cosmetics across roster polls", async () => {
  let active = 0,
    peak = 0;
  const render = vi.fn(async (r) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return `png:${r.id}`;
  });
  const queue = createSnapshotQueue(render);
  expect(
    await Promise.all(Array.from({ length: 8 }, (_, id) => queue.get({ id }))),
  ).toHaveLength(8);
  expect(peak).toBe(1);
  await Promise.all(Array.from({ length: 8 }, (_, id) => queue.get({ id })));
  expect(render).toHaveBeenCalledTimes(8);
  await queue.get({ id: 1, revision: "new assets" });
  expect(render).toHaveBeenCalledTimes(9);
  queue.dispose();
});
it("deduplicates pending pictures and bounds its image cache", async () => {
  const render = vi.fn(async (r) => `png:${r.id}`);
  const queue = createSnapshotQueue(render, { maxEntries: 2 });
  await Promise.all([queue.get({ id: 1 }), queue.get({ id: 1 })]);
  expect(render).toHaveBeenCalledTimes(1);
  await queue.get({ id: 2 });
  await queue.get({ id: 3 });
  await queue.get({ id: 1 });
  expect(render).toHaveBeenCalledTimes(4);
  queue.dispose();
  await expect(queue.get({ id: 2 })).rejects.toThrow("closed");
});
it("does not decode cards removed before their turn", async () => {
  const render = vi.fn(async () => "png");
  const queue = createSnapshotQueue(render);
  const abort = new AbortController();
  const task = queue.get({ id: 1 }, abort.signal);
  abort.abort();
  await expect(task).rejects.toHaveProperty("name", "AbortError");
  expect(render).not.toHaveBeenCalled();
});

it("overlaps two asset preparations but keeps one render and bounded prepared models", async () => {
  let prepared = 0,
    peak = 0,
    rendering = 0,
    renderPeak = 0;
  const queue = createSnapshotQueue(
    async (request, model) => {
      rendering++;
      renderPeak = Math.max(renderPeak, rendering);
      expect(model.id).toBe(request.id);
      await new Promise((resolve) => setTimeout(resolve, 5));
      rendering--;
      prepared--;
      return `png:${request.id}`;
    },
    {
      prepare: async ({ id }) => {
        prepared++;
        peak = Math.max(peak, prepared);
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { id };
      },
    },
  );
  await Promise.all(Array.from({ length: 8 }, (_, id) => queue.get({ id })));
  expect(peak).toBe(2);
  expect(renderPeak).toBe(1);
  expect(prepared).toBe(0);
  queue.dispose();
});

it("releases a failed preparation so later cards still render", async () => {
  const queue = createSnapshotQueue(async (_request, image) => image, {
    prepare: async ({ id }) => {
      if (id === 1) throw new Error("Missing model");
      return "png";
    },
  });
  const results = await Promise.allSettled(
    [1, 2, 3].map((id) => queue.get({ id })),
  );
  expect(results.map((r) => r.status)).toEqual([
    "rejected",
    "fulfilled",
    "fulfilled",
  ]);
  queue.dispose();
});
