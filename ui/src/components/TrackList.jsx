import { ExternalLinkIcon } from "@radix-ui/react-icons";

export function trackName(track) {
  return (
    track.title ||
    (track.kind === "official"
      ? `Official track ${track.configId ?? ""}`
      : track.modId || `Workshop track ${track.workshopId || ""}`)
  );
}

export function trackState(
  track,
  status,
  { rename = false, checking = false } = {},
) {
  if (track.kind === "official") return "Included with the game";
  if (rename) return "Track unchanged";
  if (checking) return "Checking Steam";
  if (!track.workshopId)
    return "Workshop ID unresolved · import the original group file to recover it";
  if (!status) return "Refresh Steam to check installation";
  if (!status.subscribed)
    return "Missing subscription · subscribe and download";
  if (status.ready) return "Installed";
  if (status.total)
    return `Downloading · ${Math.round((status.downloaded / status.total) * 100)}%`;
  return "Subscribed · download required";
}

export default function TrackList({
  tracks,
  statuses = {},
  rename = false,
  checking = false,
}) {
  return (
    <ol className="track-list" aria-label="Tracks in racing order">
      {tracks.map((track, i) => (
        <li key={`${track.kind}-${track.modId || track.configId || i}`}>
          <span className="ordinal">{String(i + 1).padStart(2, "0")}</span>
          <span>
            <strong>{trackName(track)}</strong>
            <small>
              {trackState(track, statuses[track.workshopId], {
                rename,
                checking,
              })}
            </small>
          </span>
          {track.workshopId && (
            <a
              aria-label={`View ${trackName(track)} in Steam`}
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
  );
}
