import TrackList, { trackName } from "./TrackList.jsx";

export default function ImportReview({
  preview,
  job,
  confirmed,
  onBack,
  onConfirm,
  onCancel,
  onDone,
}) {
  const running = confirmed && job?.state === "running";
  const done = confirmed && job?.state === "completed";
  const failed = confirmed && job?.state === "failed";
  const rename = preview.mode === "rename";
  const repair = preview.mode === "repair";
  const tracks = preview.group.tracks;
  const statuses = { ...preview.trackStatus, ...job?.items };
  if (done && !rename) {
    tracks.forEach((t) => {
      if (t.workshopId)
        statuses[t.workshopId] = { subscribed: true, ready: true };
    });
  }
  const previous = preview.previousTracks || [];
  const key = (t) => (t ? `${t.kind}:${t.modId || t.configId}` : "none");
  const changedOrder =
    (preview.outcome === "updated" &&
      previous.some((t, i) => key(t) !== key(tracks[i]))) ||
    (previous.length > 0 && previous.length !== tracks.length);
  return (
    <section className="workflow-page">
      <header className="page-heading">
        <span className="eyebrow">
          {repair
            ? done
              ? "Tracks ready"
              : running
                ? "Restoring Workshop tracks"
                : "Review missing tracks"
            : done
              ? "Saved to My track groups"
              : running
                ? rename
                  ? "Saving group name"
                  : "Adding to My track groups"
                : rename
                  ? "Review name change"
                  : "Review before adding to My track groups"}
        </span>
        <h1>{preview.destinationName}</h1>
        <p>
          {repair
            ? "Restore missing subscriptions and downloads. Your group name, track order and save will remain unchanged."
            : rename
              ? "Track references and order stay unchanged."
              : preview.outcome === "unchanged"
                ? "Already in My track groups. This checks and downloads any missing tracks without adding another copy."
                : preview.outcome === "updated"
                  ? "Update your existing group in its current position."
                  : "Add this collection to My track groups and the game's custom Track Groups. The curated library stays unchanged."}
        </p>
      </header>
      {preview.previousName &&
        preview.previousName !== preview.destinationName && (
          <p className="notice">
            Name: {preview.previousName} → {preview.destinationName}
          </p>
        )}
      <div className="review-summary">
        <strong>{tracks.length} tracks in racing order</strong>
        {!rename && (
          <span>
            {preview.missingSubscriptions.length} to subscribe ·{" "}
            {preview.pendingDownloads.length} to download
          </span>
        )}
      </div>
      {!confirmed && (
        <p className="hint">
          {rename
            ? "Confirm to save the name to your local and Steam profile."
            : "Nothing has been downloaded or saved yet. After confirmation, download progress appears here for each track."}{" "}
          The running game applies library changes to the next selection.
        </p>
      )}
      {confirmed && (
        <div
          className={`review-progress ${failed ? "error" : ""}`}
          role="status"
        >
          <strong>{job?.message || "Starting…"}</strong>
          {running && job?.total > 0 && (
            <progress
              aria-label="Tracks ready"
              value={job.completed || 0}
              max={job.total}
            />
          )}
          {failed && (
            <p>
              Your group was not saved, or recovery instructions are shown
              above. Completed Steam subscriptions remain. Go back and review
              again before retrying.
            </p>
          )}
        </div>
      )}
      {changedOrder && (
        <details className="order-changes">
          <summary>Review changes to track order</summary>
          {Array.from(
            { length: Math.max(previous.length, tracks.length) },
            (_, i) =>
              key(previous[i]) === key(tracks[i]) ? null : (
                <p key={i}>
                  {i + 1}. {previous[i] ? trackName(previous[i]) : "Empty"} →{" "}
                  {tracks[i] ? trackName(tracks[i]) : "Removed"}
                </p>
              ),
          )}
        </details>
      )}
      <TrackList
        tracks={tracks}
        statuses={statuses}
        images={preview.group.previewImages}
        rename={rename}
        checking={running && job?.phase === "checking"}
      />
      <div className="workflow-actions">
        {done ? (
          <button className="primary" onClick={onDone}>
            View in My track groups
          </button>
        ) : running ? (
          <button disabled={job?.phase === "saving"} onClick={onCancel}>
            Cancel import
          </button>
        ) : failed ? (
          <button onClick={onBack}>Back to My track groups</button>
        ) : (
          <>
            <button onClick={onBack}>Back</button>
            <button className="primary" onClick={onConfirm}>
              {repair
                ? "Download missing tracks"
                : rename
                  ? "Save name"
                  : preview.outcome === "unchanged"
                    ? "Check installed tracks"
                    : preview.outcome === "updated"
                      ? "Update My track groups"
                      : "Add to My track groups"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
