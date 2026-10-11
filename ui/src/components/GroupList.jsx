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
}) {
  return (
    <div className="group-list">
      {groups.map((group) => {
        const { official, workshop } = counts(group);
        return (
          <button
            className={`group-row ${selected?.id === group.id ? "selected" : ""}`}
            key={group.id}
            onClick={() => onSelect(group)}
          >
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
              {local
                ? group.exportReady
                  ? "Ready to export"
                  : "Connect Steam"
                : {
                    installed: "Imported",
                    "update-available": "Changes available",
                    "not-imported": "Not imported",
                  }[group.importState]}
            </span>
            <ArrowRightIcon aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
