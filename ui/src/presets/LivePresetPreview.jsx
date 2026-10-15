import { useEffect, useState } from "react";
import PresetPreview from "./PresetPreview.jsx";

// One native render after a settled edit, never a per-frame screenshot stream.
export default function LivePresetPreview({
  data,
  view,
  source,
  changed,
  loadImage,
  renderPreview,
}) {
  const [rotation, setRotation] = useState(0);
  const [frame, setFrame] = useState(null);
  const [message, setMessage] = useState("");
  const key = JSON.stringify({ data, view, rotation });
  useEffect(
    () => () => {
      if (frame?.url) URL.revokeObjectURL(frame.url);
    },
    [frame?.url],
  );
  useEffect(() => {
    if (!renderPreview) return;
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
  }, [key, renderPreview]);
  const current = frame?.key === key;
  return (
    <div className="live-preview">
      {frame ? (
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
        {current
          ? "Live game render · unsaved preview"
          : frame
            ? "Previous game render · updating selection"
            : changed
              ? "Saved image · your current selections differ"
              : "Saved in-game render"}
      </p>
      {renderPreview && (
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
            preset. Close the game before saving edits.
          </p>
        </>
      )}
    </div>
  );
}
