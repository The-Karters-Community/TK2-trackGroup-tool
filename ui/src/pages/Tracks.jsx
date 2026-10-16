import { useState } from "react";
import TrackPicker from "../components/TrackPicker.jsx";

export default function Tracks({ state, busy, onCreate }) {
  const [selected, setSelected] = useState([]);
  const summary = state.trackSummary || {};
  return (
    <section className="tracks-page">
      <header className="library-heading">
        <div>
          <span className="eyebrow">Your track library</span>
          <h1>My tracks</h1>
        </div>
      </header>
      <p className="hint">
        {summary.downloaded || 0} subscribed Workshop tracks downloaded ·{" "}
        {summary.pendingDownloads || 0} waiting for download. Cosmetic items are
        counted separately from tracks.
      </p>
      {state.libraryLoading && (
        <p role="status" className="preview-loading">
          <span className="loading-spinner" />
          Updating Workshop library…
        </p>
      )}
      <TrackPicker
        tracks={state.tracks}
        selected={selected}
        onChange={setSelected}
        busy={busy}
      />
      <div className="track-selection-footer">
        <span>{selected.length} tracks selected</span>
        <button
          className="primary"
          disabled={busy || !selected.length}
          onClick={() => onCreate(selected)}
        >
          Create group with selected tracks
        </button>
      </div>
    </section>
  );
}
