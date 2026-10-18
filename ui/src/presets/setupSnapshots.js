// A bounded, serial queue shared by the lobby cards. Only one temporary WebGL
// context decodes/renders pictures; completed cards are ordinary PNG images.
export function createSnapshotQueue(
  render,
  { maxBytes = 6 * 1024 * 1024, maxEntries = 24 } = {},
) {
  const cache = new Map(),
    pending = new Map();
  let tail = Promise.resolve(),
    bytes = 0,
    disposed = false;
  return {
    get(request, signal) {
      const key = JSON.stringify(request);
      if (disposed) return Promise.reject(new Error("Preview queue closed."));
      if (cache.has(key)) {
        const value = cache.get(key);
        cache.delete(key);
        cache.set(key, value);
        return Promise.resolve(value);
      }
      if (!pending.has(key)) {
        const signals = new Set([signal]);
        const task = tail
          .then(async () => {
            if (disposed || [...signals].every((s) => s?.aborted))
              throw new DOMException("Cancelled", "AbortError");
            const value = await render(request);
            if (disposed) throw new DOMException("Cancelled", "AbortError");
            if (value.length * 2 <= maxBytes) {
              cache.set(key, value);
              bytes += value.length * 2;
              while (bytes > maxBytes || cache.size > maxEntries) {
                const oldest = cache.keys().next().value;
                bytes -= cache.get(oldest).length * 2;
                cache.delete(oldest);
              }
            }
            return value;
          })
          .finally(() => pending.delete(key));
        pending.set(key, { task, signals });
        tail = task.catch(() => {});
      }
      pending.get(key).signals.add(signal);
      return pending.get(key).task;
    },
    dispose() {
      disposed = true;
      cache.clear();
      bytes = 0;
    },
  };
}

export function createSetupSnapshots(loadModel) {
  let viewport, host, loader, idle, loaderRevision;
  let disposed = false;
  async function release() {
    viewport?.dispose();
    viewport = null;
    host?.remove();
    host = null;
  }
  const queue = createSnapshotQueue(async ({ data, revision }) => {
    clearTimeout(idle);
    const [{ createViewport }, { createModelLoader }] = await Promise.all([
      import("./modelViewport.js"),
      import("./modelData.js"),
    ]);
    if (!loader || loaderRevision !== revision) {
      loader = createModelLoader(loadModel, 24 * 1024 * 1024);
      loaderRevision = revision;
    }
    const setup = await loader({ kind: "setup", data, view: "effective" });
    if (disposed) throw new DOMException("Cancelled", "AbortError");
    if (!viewport) {
      host = document.createElement("div");
      host.setAttribute("aria-hidden", "true");
      Object.assign(host.style, {
        position: "fixed",
        width: "360px",
        height: "230px",
        left: "-10000px",
        top: "0",
        pointerEvents: "none",
      });
      document.body.append(host);
      viewport = createViewport(host, () => false);
    }
    viewport.show(setup, "setup");
    const image = await viewport.snapshot();
    // Retain decoded parts briefly for the remaining cards, release the GPU
    // context when the queue goes idle. The PNG LRU remains available.
    idle = setTimeout(release, 2500);
    return image;
  });
  return {
    get: queue.get,
    dispose() {
      disposed = true;
      clearTimeout(idle);
      queue.dispose();
      release();
      loader = null;
    },
  };
}
