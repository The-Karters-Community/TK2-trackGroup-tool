import { lazy, Suspense, useEffect, useState } from "react";
import PresetPreview from "./PresetPreview.jsx";

const ModelViewer = lazy(() => import("./ModelViewer.jsx"));

// Independent Three.js is the default; native reference frames are opt-in.
export default function LivePresetPreview({
  data,
  view,
  source,
  changed,
  loadImage,
  renderPreview,
  loadModel,
  refreshModels,
  modelKind,
  modelId,
  modelAvailable = false,
  appearanceLoading = false,
  revision = "",
}) {
  const [mode, setMode] = useState("setup");
  const [rotation, setRotation] = useState(0);
  const [frame, setFrame] = useState(null);
  const [message, setMessage] = useState("");
  const key = JSON.stringify({ data, view, rotation });
  const showModel = Boolean(
    loadModel && (mode === "setup" || (modelAvailable && mode === "model")),
  );
  useEffect(
    () => () => {
      if (frame?.url) URL.revokeObjectURL(frame.url);
    },
    [frame?.url],
  );
  useEffect(() => {
    if (!renderPreview || showModel) return;
    const abort = new AbortController();
    let timer;
    async function render() {
      setMessage("Rendering selection…");
      try {
        const result = await renderPreview(JSON.parse(key), abort.signal);
        if (abort.signal.aborted) return;
        if (!result.ready) {
          setMessage(result.message || "Game renderer unavailable.");
          timer = setTimeout(render, 3000);
          return;
        }
        const bytes = Uint8Array.from(atob(result.png), (c) => c.charCodeAt(0));
        const url = URL.createObjectURL(
          new Blob([bytes], { type: "image/png" }),
        );
        setFrame({ key, url });
        setMessage("");
      } catch (err) {
        if (!abort.signal.aborted) {
          setMessage(err.message);
          timer = setTimeout(render, 3000);
        }
      }
    }
    timer = setTimeout(render, 300);
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [key, renderPreview, showModel]);
  const current = frame?.key === key;
  return (
    <div className="live-preview">
      {loadModel && (
        <div className="preview-mode" aria-label="Preview mode">
          <button
            className={mode === "setup" ? "active" : ""}
            aria-pressed={mode === "setup"}
            onClick={() => setMode("setup")}
          >
            Full setup
          </button>
          {modelAvailable && (
            <button
              className={mode === "model" ? "active" : ""}
              aria-pressed={mode === "model"}
              onClick={() => setMode("model")}
            >
              Selected part
            </button>
          )}
          {renderPreview && (
            <button
              className={!showModel ? "active" : ""}
              aria-pressed={!showModel}
              onClick={() => setMode("full")}
            >
              Game reference
            </button>
          )}
        </div>
      )}
      {showModel && appearanceLoading && !revision ? (
        <p className="preview-loading" role="status">
          <span className="loading-spinner" />
          Reading installed appearances…
        </p>
      ) : showModel ? (
        <Suspense fallback={<p className="hint">Opening 3D viewer…</p>}>
          <ModelViewer
            kind={mode === "setup" ? "setup" : modelKind}
            id={modelId}
            loadModel={loadModel}
            refreshModels={refreshModels}
            preset={data}
            view={view}
            revision={revision}
          />
        </Suspense>
      ) : frame ? (
        <span className="preset-preview preset-hero">
          <img
            src={frame.url}
            alt={
              current
                ? "Current selection rendered by the game"
                : "Previous game render while selection updates"
            }
          />
        </span>
      ) : (
        <PresetPreview
          className="preset-hero"
          source={source}
          loadImage={loadImage}
          alt="Saved in-game setup preview"
        />
      )}
      <p className="hint" role="status">
        {showModel
          ? mode === "setup"
            ? "Local 3D setup · no game connection required"
            : "Installed appearance · unsaved selection"
          : current
            ? "Live game render · unsaved preview"
            : frame
              ? "Previous game render · updating selection"
              : changed
                ? "Saved image · your current selections differ"
                : "Saved in-game render"}
      </p>
      {renderPreview && !showModel && (
        <>
          <label className="preview-rotation">
            Rotate preview
            <input
              type="range"
              min="-180"
              max="180"
              step="15"
              value={rotation}
              onChange={(e) => setRotation(Number(e.target.value))}
            />
          </label>
          {message && (
            <p className="hint" role="status">
              {message}
            </p>
          )}
          <p className="hint">
            Keep the game at its main menu. Previewing never creates or saves a
            preset. With the optional companion, changes to one preset can be
            saved through the running game.
          </p>
        </>
      )}
    </div>
  );
}
