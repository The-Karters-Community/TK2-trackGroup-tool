import { Cross2Icon, DownloadIcon, FilePlusIcon } from "@radix-ui/react-icons";
import Dialog from "../components/Dialog.jsx";
import { counts } from "../components/GroupList.jsx";
import TrackList from "../components/TrackList.jsx";
import EditGroup from "../components/EditGroup.jsx";

export default function GroupDetails({
  group,
  local,
  hasProfile,
  onClose,
  onImport,
  onExport,
  onSave,
  onDirty,
}) {
  const { official, workshop } = counts(group);
  return (
    <Dialog
      className="import-dialog web-group-dialog"
      aria-labelledby="group-title"
      onClose={onClose}
    >
      <div className="details">
        <div className="list-heading">
          <span className="eyebrow">
            {local ? "Your custom group" : "Selected collection"}
          </span>
          <button
            className="icon-button"
            aria-label="Close group details"
            onClick={onClose}
          >
            <Cross2Icon />
          </button>
        </div>
        <h2 id="group-title">{group.name}</h2>
        <p>
          {group.tracks.length} tracks in racing order · {official} official ·{" "}
          {workshop} Workshop
        </p>
        {!local && (
          <button className="primary web-wide" onClick={() => onImport(group)}>
            <FilePlusIcon />
            {hasProfile ? "Review save update" : "Add to game save"}
          </button>
        )}
        {local && (
          <button
            className="web-wide"
            disabled={group.unresolvedTracks > 0}
            onClick={() => onExport(group)}
          >
            <DownloadIcon />
            Download group file
          </button>
        )}
        {group.unresolvedTracks > 0 && (
          <p className="notice">
            Some Workshop IDs aren't in this site's catalog. Open the original
            group file to resolve them before exporting. Existing tracks can
            still be renamed or reordered.
          </p>
        )}
        {local ? (
          <EditGroup
            key={group.id}
            group={group}
            connected={group.editable}
            busy={false}
            onSave={onSave}
            onDirty={onDirty}
            editJob={{ state: "completed" }}
            browser
          />
        ) : (
          <TrackList
            tracks={group.tracks}
            images={group.previewImages}
            browser
          />
        )}
      </div>
    </Dialog>
  );
}
