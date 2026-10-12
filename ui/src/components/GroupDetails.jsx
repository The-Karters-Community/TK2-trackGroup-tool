import { Cross2Icon, DownloadIcon } from "@radix-ui/react-icons";
import { counts } from "./GroupList.jsx";
import TrackList from "./TrackList.jsx";
import { useState, useEffect } from "react";
import EditGroup from "./EditGroup.jsx";

export default function GroupDetails({
  group,
  local,
  busy,
  connected,
  onClose,
  onPreview,
  onExport,
  onEdit,
  onRepair,
  editJob,
  trackStatus = {},
}) {
  const count = counts(group);
  const [editing, setEditing] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    if (submitted && !busy) {
      if (editJob?.state === "completed") setEditing(false);
      setSubmitted(false);
    }
  }, [busy, submitted, editJob]);
  function preview() {
    const { format, version, id, revision, name, description, tracks } = group;
    onPreview({
      format,
      version,
      id,
      revision,
      name,
      tracks,
      ...(description === undefined ? {} : { description }),
    });
  }
  return (
    <aside className="details" aria-label="Group details">
      <div className="flex items-center justify-between">
        <span className="eyebrow">
          {local
            ? "Your custom group"
            : group.category === "speedrun"
              ? "Speedrun category"
              : "Community group"}
        </span>
        <button
          className="icon-button"
          aria-label="Close details"
          disabled={busy || editing}
          onClick={onClose}
        >
          <Cross2Icon />
        </button>
      </div>
      <h2>{group.name}</h2>
      {editing ? (
        <EditGroup
          group={group}
          busy={busy}
          onCancel={() => setEditing(false)}
          onSave={async (body) => {
            if (await onEdit(body)) setSubmitted(true);
          }}
        />
      ) : (
        <>
          <p>
            {group.tracks.length} tracks in racing order. {count.official}{" "}
            official · {count.workshop} Workshop
          </p>
          {group.description && <p>{group.description}</p>}
          {local && (
            <button
              className="w-full"
              disabled={busy || !connected}
              onClick={() => setEditing(true)}
            >
              Edit name & track order
            </button>
          )}
          {local && connected && group.missingTracks > 0 && (
            <p className="notice">
              {group.missingTracks} tracks need subscription or download.
              <button
                className="primary w-full"
                disabled={busy || !group.exportReady}
                onClick={() => onRepair(group)}
              >
                Repair missing tracks
              </button>
            </p>
          )}
          <button
            className="primary w-full"
            disabled={busy || (local ? !group.exportReady : !connected)}
            onClick={() => (local ? onExport(group) : preview())}
          >
            <DownloadIcon />
            {local ? "Export group" : "Preview import"}
          </button>
          {!connected && (
            <p className="hint">
              Connect Steam to verify track dependencies and your game profile.
            </p>
          )}
          {group.reason && <p className="notice">{group.reason}</p>}
          <TrackList tracks={group.tracks} statuses={trackStatus} />
        </>
      )}
    </aside>
  );
}
