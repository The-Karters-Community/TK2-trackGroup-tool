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
