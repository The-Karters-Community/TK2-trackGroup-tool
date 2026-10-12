import { useState } from "react";
import { ImageIcon } from "@radix-ui/react-icons";
import officialTracks from "../../../catalog/official-tracks.json";

export function trackName(track) {
  return (
    (track.kind === "official" && officialTracks[track.configId]?.title) ||
    track.title ||
    (track.kind === "official"
      ? `Official track ${track.configId ?? ""}`
      : track.modId || `Workshop track ${track.workshopId || ""}`)
  );
}

export default function TrackPreview({
  track,
  image,
  className = "track-preview",
}) {
  const src =
    track.kind === "official" ? officialTracks[track.configId]?.image : image;
  const [failed, setFailed] = useState(null);
  return (
    <span className={className} aria-hidden="true">
      {src && failed !== src ? (
        <img
          src={encodeURI(src)}
          alt=""
          loading="lazy"
          draggable={false}
          onError={() => setFailed(src)}
        />
      ) : (
        <ImageIcon />
      )}
    </span>
  );
}
