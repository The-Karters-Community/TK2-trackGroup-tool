import { useEffect, useMemo, useRef, useState } from "react";
import { createModelLoader } from "./modelData.js";

export default function ModelViewer({ kind, id, loadModel, preset, view }) {
  const host = useRef(null),
    viewport = useRef(null),
    playing = useRef(true);
  const [message, setMessage] = useState("Loading installed models…");
  const [warning, setWarning] = useState("");
  const [hasMotion, setHasMotion] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [animated, setAnimated] = useState(
    () => !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  playing.current = animated;
  const load = useMemo(() => createModelLoader(loadModel), [loadModel]);
  const request = JSON.stringify(
    kind === "setup" ? { kind, data: preset, view } : { kind, id },
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
    const timer = setTimeout(async () => {
      try {
        const [instance, data] = await Promise.all([
          viewport.current,
          load(JSON.parse(request), abort.signal),
        ]);
        if (disposed || !instance) return;
        const result = instance.show(data, kind);
        setHasMotion(result.motion);
        setWarning(result.warning);
        setMessage("");
      } catch (error) {
        if (!disposed)
          setMessage(error.message || "Model preview unavailable.");
      }
    }, 100);
    return () => {
      disposed = true;
      abort.abort();
      clearTimeout(timer);
    };
  }, [request, kind, load]);

  return (
    <>
      <div
        className={`model-viewer${expanded ? " expanded" : ""}`}
        aria-busy={Boolean(message)}
      >
        <div className="model-canvas" ref={host} />
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
          {message || "Drag to rotate · Scroll to zoom"}
        </p>
      </div>
      {warning && !message && (
        <p className="hint" role="status">
          {warning}
        </p>
      )}
    </>
  );
}
