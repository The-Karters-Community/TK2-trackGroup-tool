import { useEffect, useMemo, useRef, useState } from "react";
import { createModelLoader } from "./modelData.js";

export default function ModelViewer({
  kind,
  id,
  loadModel,
  refreshModels,
  preset,
  view,
  revision = "",
}) {
  const host = useRef(null),
    viewport = useRef(null),
    playing = useRef(true);
  const [message, setMessage] = useState("Loading installed models…");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [warning, setWarning] = useState("");
  const [hasMotion, setHasMotion] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [choices, setChoices] = useState([]);
  const [selection, setSelection] = useState(null);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [animated, setAnimated] = useState(
    () => !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  playing.current = animated;
  const load = useMemo(
    () => createModelLoader(loadModel),
    [loadModel, revision, retry],
  );
  const identity = `${revision}:${view}:${preset?.[view === "modded" ? "iCharacterSkinMaterialID_Modded" : "iCharacterSkinMaterialID"]}`;
  const selected = selection?.identity === identity ? selection.clip : "";
  const request = JSON.stringify(
    kind === "setup"
      ? {
          kind,
          data: preset,
          view,
          ...(selected ? { animation: selected } : {}),
        }
      : { kind, id },
  );

  useEffect(() => {
    let disposed = false,
      instance;
    viewport.current = import("./modelViewport.js").then(
      ({ createViewport }) => {
        if (disposed) return null;
        instance = createViewport(host.current, () => playing.current);
        return instance;
      },
    );
    return () => {
      disposed = true;
      instance?.dispose();
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const abort = new AbortController();
    setMessage("Updating preview…");
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const [instance, data] = await Promise.all([
          viewport.current,
          load(JSON.parse(request), abort.signal),
        ]);
        if (disposed || !instance) return;
        const result = instance.show(data, kind);
        instance.setSpeed?.(speed);
        setChoices(result.choices || []);
        setProgress(0);
        setHasMotion(result.motion);
        setWarning(result.warning);
        setMessage("");
      } catch (error) {
        if (!disposed)
          setMessage(error.message || "Model preview unavailable.");
      } finally {
        if (!disposed) setLoading(false);
      }
    }, 100);
    return () => {
      disposed = true;
      abort.abort();
      clearTimeout(timer);
    };
  }, [request, kind, load, retry]);

  useEffect(() => {
    if (!animated || !hasMotion) return;
    const timer = setInterval(async () => {
      if (document.hidden) return;
      const instance = await viewport.current;
      if (instance?.progress) setProgress(instance.progress());
    }, 200);
    return () => clearInterval(timer);
  }, [animated, hasMotion]);

  return (
    <>
      <div
        className={`model-viewer${expanded ? " expanded" : ""}`}
        aria-busy={loading}
      >
        <div className="model-canvas" ref={host} />
        {message && (
          <div
            className="preview-loading preview-loading-overlay"
            role={loading ? "status" : "alert"}
          >
            {loading && <span className="loading-spinner" />}
            {message}
            {!loading && (
              <button
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  setMessage("Checking installed assets…");
                  try {
                    await refreshModels?.();
                    setRetry((n) => n + 1);
                  } catch (err) {
                    setMessage(err.message);
                    setLoading(false);
                  }
                }}
              >
                Rescan & retry
              </button>
            )}
          </div>
        )}
        <div className="model-tools">
          <button onClick={async () => (await viewport.current)?.reset()}>
            Reset view
          </button>
          <button
            aria-pressed={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Smaller" : "Enlarge"}
          </button>
          {hasMotion && (
            <button
              aria-pressed={animated}
              onClick={() => setAnimated((v) => !v)}
            >
              {animated ? "Pause motion" : "Play motion"}
            </button>
          )}
        </div>
        <p
          className={message ? "model-message" : "model-hint"}
          role={message ? "status" : undefined}
        >
          {loading
            ? "Previous setup stays visible while loading."
            : "Drag to rotate · Scroll to zoom"}
        </p>
      </div>
      {kind === "setup" && choices.length > 0 && (
        <section className="motion-browser" aria-label="Animation showcase">
          <label>
            Animation
            <select
              aria-label="Preview animation"
              value={selected}
              disabled={loading}
              onChange={(e) => {
                setSelection({ identity, clip: e.target.value });
                setAnimated(true);
              }}
            >
              <option value="">Seated idle · default</option>
              {[...new Set(choices.map((c) => c.category))].map((category) => (
                <optgroup key={category} label={category}>
                  {choices
                    .filter((c) => c.category === category)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="motion-timeline">
            <input
              aria-label="Animation position"
              type="range"
              min="0"
              max="1"
              step="0.002"
              value={progress}
              disabled={loading}
              onChange={async (e) => {
                const value = Number(e.target.value);
                setAnimated(false);
                setProgress(value);
                (await viewport.current)?.seek(value);
              }}
            />
            <select
              aria-label="Playback speed"
              value={speed}
              onChange={async (e) => {
                const value = Number(e.target.value);
                setSpeed(value);
                (await viewport.current)?.setSpeed(value);
              }}
            >
              {[0.25, 0.5, 1, 1.5, 2].map((n) => (
                <option key={n} value={n}>
                  {n}×
                </option>
              ))}
            </select>
          </div>
        </section>
      )}
      {warning && !message && (
        <p className="hint" role="status">
          {warning}
        </p>
      )}
    </>
  );
}
