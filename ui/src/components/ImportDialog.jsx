import { useEffect, useRef } from "react";

export default function ImportDialog({ preview, onCancel, onConfirm, busy }) {
  const ref = useRef();
  useEffect(() => {
    ref.current.showModal();
  }, []);
  const previous = preview.previousTracks || [];
  const tracks = preview.group.tracks;
  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <span className="eyebrow">Review before importing</span>
      <h2>{preview.destinationName}</h2>
      <p>
        {preview.outcome === "updated"
          ? "Update the existing group in its current position."
          : preview.outcome === "unchanged"
            ? "This group already matches. Dependencies will still be checked."
            : "Add this group to your custom track groups."}
      </p>
      <div className="review-stats">
        <span>
          <strong>{tracks.length}</strong> tracks
        </span>
        <span>
          <strong>{preview.missingSubscriptions.length}</strong> new
          subscriptions
        </span>
        <span>
          <strong>{preview.pendingDownloads.length}</strong> pending downloads
        </span>
      </div>
      {preview.previousName &&
        preview.previousName !== preview.destinationName && (
          <p className="notice">
            Name: {preview.previousName} → {preview.destinationName}
          </p>
        )}
      {previous.length > 0 && preview.outcome === "updated" && (
        <div className="change-list">
          <h3>Track order changes</h3>
          {Array.from(
            { length: Math.max(previous.length, tracks.length) },
            (_, i) => {
              const old = previous[i];
              const now = tracks[i];
              const before =
                old?.modHashID ||
                (old ? `Official track ${old.configID}` : "—");
              const after =
                now?.modId || (now ? `Official track ${now.configId}` : "—");
              return before === after ? null : (
                <p key={i}>
                  <span>
                    {i + 1}. {before}
                  </span>
                  <strong>→ {now?.title || after}</strong>
                </p>
              );
            },
          )}
        </div>
      )}
      <p className="notice">
        Keep the game closed. Missing tracks will be subscribed and downloaded
        through Steam before the save is changed. A recovery copy is kept
        locally.
      </p>
      <div className="dialog-actions">
        <button onClick={onCancel} disabled={busy}>
          Back
        </button>
        <button className="primary" onClick={onConfirm} disabled={busy}>
          {preview.outcome === "updated" ? "Update group" : "Import group"}
        </button>
      </div>
    </dialog>
  );
}
