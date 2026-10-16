import { useState, useEffect, useRef } from "react";
import Sortable from "sortablejs";
import TrackPicker, { portableTrack, trackKey } from "./TrackPicker.jsx";
import { reorder } from "./EditGroup.jsx";
import { DragHandleDots2Icon } from "@radix-ui/react-icons";
import { trackName } from "./TrackPreview.jsx";

export default function GroupEditor({
  group,
  tracks = [],
  initialTracks = [],
  busy,
  onCancel,
  onSubmit,
}) {
  const [name, setName] = useState(group?.name || "");
  const [items, setItems] = useState("");
  const rename = Boolean(group);
  const [selected, setSelected] = useState(initialTracks);
  const [mode, setMode] = useState("library");
  const list = useRef(),
    current = useRef(selected);
  current.current = selected;
  useEffect(() => {
    if (!list.current) return;
    const sortable = new Sortable(list.current, {
      handle: ".track-grip",
      animation: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 160,
      onEnd: ({ oldIndex, newIndex }) => {
        sortable.sort(current.current.map(trackKey), false);
        setSelected(reorder(current.current, oldIndex, newIndex));
      },
    });
    return () => sortable.destroy();
  }, [mode, rename]);
  return (
    <section className="workflow-page">
      <header className="page-heading">
        <span className="eyebrow">My track groups</span>
        <h1>{rename ? "Rename group" : "Create a track group"}</h1>
        <p>
          {rename
            ? "Only the name changes. Track order and your position in the game's group list stay the same."
            : "Choose downloaded or official tracks, then arrange the racing order. Workshop links also work."}
        </p>
      </header>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(
            rename ? "rename" : "create",
            rename
              ? { id: group.id, name }
              : mode === "library"
                ? { name, tracks: selected.map(portableTrack) }
                : { name, items },
          );
        }}
      >
        <label>
          Group name
          <input
            autoFocus
            required
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
        </label>
        {!rename && (
          <>
            <div className="tabs">
              <button
                type="button"
                aria-pressed={mode === "library"}
                onClick={() => setMode("library")}
              >
                Choose tracks
              </button>
              <button
                type="button"
                aria-pressed={mode === "links"}
                onClick={() => setMode("links")}
              >
                Paste Workshop links
              </button>
            </div>
            {mode === "library" && (
              <>
                <ol
                  ref={list}
                  className="selected-tracks"
                  aria-label="Selected racing order"
                >
                  {selected.map((track, index) => (
                    <li key={trackKey(track)} data-id={trackKey(track)}>
                      <button
                        type="button"
                        className="track-grip icon-button"
                        disabled={busy}
                        aria-label={`Drag ${trackName(track)} to reorder`}
                      >
                        <DragHandleDots2Icon />
                      </button>
                      <span>
                        {index + 1}. {trackName(track)}
                      </span>
                      <button
                        type="button"
                        disabled={index === 0}
                        aria-label={`Move ${trackName(track)} up`}
                        onClick={() =>
                          setSelected((list) => {
                            const next = [...list];
                            [next[index - 1], next[index]] = [
                              next[index],
                              next[index - 1],
                            ];
                            return next;
                          })
                        }
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${trackName(track)}`}
                        onClick={() =>
                          setSelected((list) =>
                            list.filter((_, i) => i !== index),
                          )
                        }
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ol>
                <TrackPicker
                  tracks={tracks}
                  selected={selected}
                  onChange={setSelected}
                  busy={busy}
                />
              </>
            )}
          </>
        )}
        {!rename && mode === "links" && (
          <label>
            Workshop item IDs or links
            <textarea
              aria-label="Workshop item IDs or links"
              aria-describedby="workshop-items-help"
              required
              rows={8}
              value={items}
              onChange={(e) => setItems(e.target.value)}
              disabled={busy}
              placeholder={
                "3263970719\n3279611598\nOr paste Steam Workshop links"
              }
            />
            <span className="hint" id="workshop-items-help">
              One per line, or separate IDs with spaces or commas. Duplicate
              tracks are rejected.
            </span>
          </label>
        )}
        <div className="workflow-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={
              busy ||
              !name.trim() ||
              (!rename && (mode === "links" ? !items.trim() : !selected.length))
            }
          >
            {busy
              ? rename
                ? "Preparing review…"
                : "Checking tracks…"
              : "Review changes"}
          </button>
        </div>
      </form>
    </section>
  );
}
