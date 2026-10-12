import {
  Cross2Icon,
  DownloadIcon,
  PersonIcon,
  StackIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";

import { useState } from "react";

import { counts } from "./GroupList.jsx";

import TrackList from "./TrackList.jsx";

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

  const [dirty, setDirty] = useState(false);

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
        <span className="eyebrow label-with-icon">
          {local ? <PersonIcon /> : <StackIcon />}

          {local
            ? "Your custom group"
            : group.category === "speedrun"
              ? "Speedrun category"
              : "Community group"}
        </span>

        <button
          className="icon-button"
          aria-label="Close details"
          disabled={busy || dirty}
          title={dirty ? "Save or discard your changes first" : "Close details"}
          onClick={onClose}
        >
          <Cross2Icon />
        </button>
      </div>

      <h2>{group.name}</h2>

      <p>
        {group.tracks.length} tracks in racing order. {count.official} official
        {"\u00b7"} {count.workshop} Workshop
      </p>

      {group.description && <p>{group.description}</p>}

      <div className="group-tools">
        {local && connected && group.missingTracks > 0 && (
          <p className="notice">
            {group.missingTracks} tracks need subscription or download.
            <button
              className="primary w-full"
              disabled={busy || dirty || !group.exportReady}
              onClick={() => onRepair(group)}
            >
              <ReloadIcon /> Repair missing tracks
            </button>
          </p>
        )}

        <button
          className="w-full"
          disabled={busy || dirty || (local ? !group.exportReady : !connected)}
          onClick={() => (local ? onExport(group) : preview())}
        >
          <DownloadIcon />

          {local ? "Export group" : "Preview import"}
        </button>
      </div>

      {!connected && (
        <p className="hint">
          Connect Steam to verify track dependencies and your game profile.
        </p>
      )}

      {group.reason && <p className="notice">{group.reason}</p>}

      {local ? (
        <EditGroup
          group={group}
          busy={busy}
          connected={connected}
          onSave={onEdit}
          editJob={editJob}
          statuses={trackStatus}
          onDirty={setDirty}
        />
      ) : (
        <TrackList
          tracks={group.tracks}
          statuses={trackStatus}
          images={group.previewImages}
        />
      )}
    </aside>
  );
}
