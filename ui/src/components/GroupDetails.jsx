import {
  Cross2Icon,
  DownloadIcon,
  ExternalLinkIcon,
} from "@radix-ui/react-icons";
import { counts } from "./GroupList.jsx";

export default function GroupDetails({
  group,
  local,
  busy,
  connected,
  onClose,
  onPreview,
  onExport,
  trackStatus = {},
}) {
  const count = counts(group);
  return (
    <aside className="details" aria-label="Group details">
      <div className="flex items-center justify-between">
        <span className="eyebrow">
          {local ? "Your custom group" : "Community group"}
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
      <button
        className="primary w-full"
        disabled={busy || (local ? !group.exportReady : !connected)}
        onClick={() => (local ? onExport(group) : onPreview(group))}
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
      <ol className="track-list">
        {group.tracks.map((track, i) => (
          <li key={`${track.kind}-${track.modId || track.configId || i}`}>
            <span className="ordinal">{String(i + 1).padStart(2, "0")}</span>
            <span>
              <strong>
                {track.title ||
                  (track.kind === "official"
                    ? `Official track ${track.configId ?? ""}`
                    : "Workshop track")}
              </strong>
              <small>
                {track.kind === "official"
                  ? "Built into the game"
                  : trackStatus[track.workshopId]?.ready
                    ? "Workshop · installed"
                    : trackStatus[track.workshopId]?.subscribed
                      ? "Workshop · download pending"
                      : "Steam Workshop · subscription required"}
              </small>
            </span>
            {track.workshopId && (
              <a
                aria-label={`View ${track.title} in Steam`}
                href={`https://steamcommunity.com/sharedfiles/filedetails/?id=${track.workshopId}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLinkIcon />
              </a>
            )}
          </li>
        ))}
      </ol>
    </aside>
  );
}
