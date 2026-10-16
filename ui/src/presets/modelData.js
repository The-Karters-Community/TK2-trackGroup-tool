// Reuse parts instead of transferring entire combinations after each change.
export function createModelLoader(load, limit = 48 * 1024 * 1024) {
  const cache = new Map(),
    pending = new Map();
  let bytes = 0;
  async function part(kind, id, extra = {}) {
    const key = `${kind}:${id}:${extra.animation || ""}`;
    if (cache.has(key)) {
      const entry = cache.get(key);
      cache.delete(key);
      cache.set(key, entry);
      return entry.data;
    }
    if (pending.has(key)) return pending.get(key);
    const task = load({ kind, id, ...extra })
      .then((data) => {
        const size = JSON.stringify(data).length * 2;
        if (size <= limit) {
          cache.set(key, { data, size });
          bytes += size;
          while (bytes > limit) {
            const oldest = cache.keys().next().value;
            bytes -= cache.get(oldest).size;
            cache.delete(oldest);
          }
        }
        return data;
      })
      .finally(() => pending.delete(key));
    pending.set(key, task);
    return task;
  }
  return async function model(request, signal) {
    if (request.kind !== "setup") return part(request.kind, request.id);
    const plan = await load({ ...request, kind: "setup-plan" }, signal);
    signal?.throwIfAborted();
    const characters = await part("characters", plan.parts.characters);
    signal?.throwIfAborted();
    const parts = { characters };
    if (!characters.rig.hideVehicle) {
      parts.vehicles = await part("vehicles", plan.parts.vehicles);
      signal?.throwIfAborted();
      if (!parts.vehicles.rig.hideWheels)
        parts.wheels = await part("wheels", plan.parts.wheels);
    }
    signal?.throwIfAborted();
    const slots = (parts.vehicles?.rig.stickerSlots?.length || 0) * 2;
    const stickers = await Promise.all(
      (plan.stickers || []).slice(0, slots).map(async (slot) => ({
        texture: (await part("stickers", slot.id)).texture,
        settings: slot.settings,
      })),
    );
    if (request.animation) {
      const clip = await part("animation", plan.parts.characters, {
        animation: request.animation,
      });
      parts.characters = {
        ...characters,
        rig: { ...characters.rig, animations: clip.animations },
      };
    }
    return { ...plan, parts, stickers };
  };
}
