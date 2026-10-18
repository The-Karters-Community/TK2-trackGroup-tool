import TrackPreview, { trackName } from "./TrackPreview.jsx";
import { ArrowRightIcon } from "@radix-ui/react-icons";

export function counts(group) {
  return {
    official: group.tracks.filter((t) => t.kind === "official").length,
    workshop: group.tracks.filter((t) => t.kind === "workshop").length,
  };
}

export default function GroupList({
  groups,
  onSelect,
  selected,
  local = false,
  gallery = false,
  checked = [],
  onCheck,
}) {
  return (
    <div className={`group-list ${gallery ? "group-gallery" : ""}`}>
      {groups.map((group) => {
        const { official, workshop } = counts(group);
        return (
          <div className="group-choice" key={group.id}>
            {onCheck && (
              <input
                type="checkbox"
                aria-label={`Select ${group.name}`}
                checked={checked.includes(group.id)}
                onChange={() => onCheck(group.id)}
              />
            )}
            <button
              className={`group-row ${selected?.id === group.id ? "selected" : ""}`}
              key={group.id}
              onClick={() => onSelect(group)}
            >
              {gallery && (
                <span className="gallery-preview" aria-hidden="true">
                  {group.tracks.slice(0, 4).map((t, i) => (
                    <span key={i}>
                      <TrackPreview
                        track={t}
                        image={group.previewImages?.[i]}
                        className="tile-preview"
                      />
                      <small className="preview-label">{trackName(t)}</small>
                    </span>
                  ))}
                </span>
              )}
              <span className="track-count">
                {group.tracks.length}
                <small>tracks</small>
              </span>
              <span className="group-copy">
                <strong>{group.name}</strong>
                <span>
                  {official ? `${official} official` : ""}
                  {official && workshop ? " · " : ""}
                  {workshop ? `${workshop} Workshop` : ""}
                </span>
              </span>
              <span className="group-status">
                {group.statusText ??
                  (local
                    ? group.unresolvedTracks > 0
                      ? `${group.unresolvedTracks} unresolved tracks`
                      : group.missingTracks === null
                        ? "Refresh Steam to check"
                        : group.missingTracks > 0
                          ? `${group.missingTracks} missing tracks`
                          : "Tracks ready"
                    : {
                        installed: "Imported",
                        "update-available": "Changes available",
                        "not-imported": "Not imported",
                      }[group.importState])}
              </span>
              <ArrowRightIcon aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
