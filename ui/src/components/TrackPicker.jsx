import { useState } from "react";
import TrackPreview, { trackName } from "./TrackPreview.jsx";
import { RowControls, useRowPagination } from "./RowPage.jsx";

export const trackKey = (track) =>
  track.kind === "official"
    ? `official:${track.configId}`
    : `workshop:${track.workshopId}`;
export const portableTrack = ({ kind, configId, workshopId, modId, title }) =>
  kind === "official"
    ? { kind, configId, title }
    : { kind, workshopId, modId, title };

export default function TrackPicker({
  tracks = [],
  selected = [],
  onChange,
  busy = false,
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("downloaded");
  const keys = new Set(selected.map(trackKey));
  const filtered = tracks.filter(
    (t) =>
      trackName(t).toLowerCase().includes(query.toLowerCase()) &&
      (filter === "all" ||
        (filter === "downloaded" && t.ready) ||
        (filter === "official" && t.kind === "official") ||
        (filter === "workshop" && t.kind === "workshop")),
  );
  const paging = useRowPagination(filtered, `${query}:${filter}`, 150, 12);
  function toggle(track) {
    const key = trackKey(track);
    onChange(
      keys.has(key)
        ? selected.filter((t) => trackKey(t) !== key)
        : [...selected, portableTrack(track)],
    );
  }
  return (
    <div
      className="track-picker"
      ref={paging.host}
      style={{ "--collection-columns": paging.columns }}
    >
      <div className="toolbar">
        <input
          aria-label="Find tracks"
          placeholder="Search your tracks…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
        />
        <div className="view-switch" aria-label="Track source">
          {[
            ["downloaded", "Downloaded"],
            ["all", "All known"],
            ["official", "Official"],
            ["workshop", "Workshop"],
          ].map(([id, label]) => (
            <button
              type="button"
              key={id}
              aria-pressed={filter === id}
              onClick={() => {
                setFilter(id);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="hint">
        {filtered.length} tracks · {selected.length} selected. Tracks join the
        group in selection order.
      </p>
      <RowControls paging={paging} label="Tracks" />
      <div className="track-picker-grid">
        {paging.items.map((track) => (
          <label
            className={`track-picker-card ${keys.has(trackKey(track)) ? "selected" : ""}`}
            key={trackKey(track)}
          >
            <input
              type="checkbox"
              disabled={busy}
              checked={keys.has(trackKey(track))}
              onChange={() => toggle(track)}
              aria-label={`Select ${trackName(track)}`}
            />
            <TrackPreview track={track} image={track.image} />
            <strong>{trackName(track)}</strong>
            <small>
              {track.kind === "official"
                ? "Included with game"
                : track.ready
                  ? "Downloaded"
                  : track.subscribed
                    ? "Subscribed · download pending"
                    : "Not subscribed"}
            </small>
          </label>
        ))}
      </div>
      {!filtered.length && (
        <p className="empty">
          No matching tracks. Refresh Steam after subscribing, or paste Workshop
          links below.
        </p>
      )}
    </div>
  );
}
