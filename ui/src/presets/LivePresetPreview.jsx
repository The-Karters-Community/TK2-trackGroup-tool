import { lazy, Suspense, useState } from "react";
import PresetPreview from "./PresetPreview.jsx";

const ModelViewer = lazy(() => import("./ModelViewer.jsx"));

// Saved images come only from PresetIcons. Interactive previews stay independent.
export default function LivePresetPreview({
  data,
  view,
  source,
  changed,
  loadImage,
  loadModel,
  refreshModels,
  modelKind,
  modelId,
  modelAvailable = false,
  appearanceLoading = false,
  revision = "",
  imageRevision = "",
}) {
  const [mode, setMode] = useState(loadModel ? "setup" : "saved");
  const effectiveMode = mode === "model" && !modelAvailable ? "setup" : mode;
  const showModel = Boolean(loadModel && effectiveMode !== "saved");
  return (
    <div className="live-preview">
      {loadModel && (
        <div className="preview-mode" aria-label="Preview mode">
          <button
            className={effectiveMode === "setup" ? "active" : ""}
            aria-pressed={effectiveMode === "setup"}
            onClick={() => setMode("setup")}
          >
            Full setup
          </button>
          <button
            className={effectiveMode === "model" ? "active" : ""}
            aria-pressed={effectiveMode === "model"}
            disabled={!modelAvailable}
            title={
              modelAvailable
                ? "View the selected part"
                : "Choose an installed character, vehicle or wheel"
            }
            onClick={() => setMode("model")}
          >
            Selected part
          </button>
          <button
            className={effectiveMode === "saved" ? "active" : ""}
            aria-pressed={effectiveMode === "saved"}
            onClick={() => setMode("saved")}
          >
            Saved image
          </button>
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
            kind={effectiveMode === "setup" ? "setup" : modelKind}
            id={modelId}
            loadModel={loadModel}
            refreshModels={refreshModels}
            preset={data}
            view={
              effectiveMode === "setup" && view === "modded"
                ? "effective"
                : view
            }
            revision={revision}
            assetsLoading={appearanceLoading}
          />
        </Suspense>
      ) : source ? (
        <PresetPreview
          className="preset-hero"
          source={source}
          loadImage={loadImage}
          alt="Saved in-game setup preview"
          revision={imageRevision}
        />
      ) : (
        <div className="saved-image-empty">
          No saved image yet. Open this setup in the game to create one.
        </div>
      )}
      <p className="hint" role="status">
        {showModel
          ? effectiveMode === "setup"
            ? "Interactive 3D setup"
            : "Selected part"
          : changed
            ? "Last game-generated image. Preview unsaved changes in 3D."
            : "Saved game image"}
      </p>
      {!showModel && (
        <p className="hint">Open the game to update this image.</p>
      )}
    </div>
  );
}
