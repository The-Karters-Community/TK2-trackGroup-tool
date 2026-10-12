import { Cross2Icon, DownloadIcon } from "@radix-ui/react-icons";
import { counts } from "./GroupList.jsx";
import TrackList from "./TrackList.jsx";

export default function GroupDetails({
  group,
  local,
  busy,
  connected,
  onClose,
  onPreview,
  onExport,
  onRename,
  trackStatus = {},
}) {
  const count = counts(group);
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
          onClick={onClose}
        >
          <Cross2Icon />
        </button>
      </div>
      <h2>{group.name}</h2>
      <p>
        {group.tracks.length} tracks in racing order. {count.official} official
        · {count.workshop} Workshop
      </p>
      {group.description && <p>{group.description}</p>}
      {local && (
        <button
          className="w-full"
          disabled={busy || !connected}
          onClick={() => onRename(group)}
        >
          Rename group
        </button>
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
    </aside>
  );
}
