// A bounded, serial queue shared by the lobby cards. Only one temporary WebGL
// context decodes/renders pictures; completed cards are ordinary PNG images.
export function createSnapshotQueue(
  render,
  { maxBytes = 6 * 1024 * 1024, maxEntries = 24, prepare } = {},
) {
  const cache = new Map(),
    pending = new Map();
  let tail = Promise.resolve(),
    bytes = 0,
    disposed = false;
  // Overlap at most two asset preparations. Keep the lease until its picture
  // is rendered so completed models cannot accumulate for an entire roster.
  let preparing = 0;
  const waiters = [];
  async function acquire() {
    if (preparing >= 2) await new Promise((resolve) => waiters.push(resolve));
    else preparing++;
    return () => {
      if (waiters.length) waiters.shift()();
      else preparing--;
    };
  }
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
        let release;
        const prepared = prepare
          ? acquire().then(async (unlock) => {
              release = unlock;
              if (disposed || [...signals].every((s) => s?.aborted))
                return { error: new DOMException("Cancelled", "AbortError") };
              try {
                return { value: await prepare(request) };
              } catch (error) {
                return { error };
              }
            })
          : Promise.resolve({});
        const task = tail
          .then(async () => {
            const input = await prepared;
            if (disposed || [...signals].every((s) => s?.aborted))
              throw new DOMException("Cancelled", "AbortError");
            if (input.error) throw input.error;
            const value = await render(request, input.value);
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
          .finally(() => {
            release?.();
            pending.delete(key);
          });
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

export function createSetupSnapshots(loadModel, pictures = {}) {
  let viewport, host, loader, idle, loaderRevision;
  let disposed = false;
  async function release() {
    viewport?.dispose();
    viewport = null;
    host?.remove();
    host = null;
  }
  const queue = createSnapshotQueue(
    async (request, setup) => {
      clearTimeout(idle);
      const { createViewport } = await import("./modelViewport.js");
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
      pictures.write?.(request, image).catch(() => {});
      // Retain decoded parts briefly for the remaining cards, release the GPU
      // context when the queue goes idle. The PNG LRU remains available.
      idle = setTimeout(release, 2500);
      return image;
    },
    {
      prepare: async ({ data, revision }) => {
        const { createModelLoader } = await import("./modelData.js");
        if (!loader || loaderRevision !== revision) {
          loader = createModelLoader(loadModel, 24 * 1024 * 1024);
          loaderRevision = revision;
        }
        return loader({ kind: "setup", data, view: "effective" });
      },
    },
  );
  return {
    async get(request, signal) {
      const image = await pictures.read?.(request, signal).catch(() => null);
      signal?.throwIfAborted();
      if (image) return image;
      return queue.get(request, signal);
    },
    dispose() {
      disposed = true;
      clearTimeout(idle);
      queue.dispose();
      release();
      loader = null;
    },
  };
}
