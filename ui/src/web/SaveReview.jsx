import { useEffect, useRef, useState } from "react";
import { CheckIcon, Cross2Icon } from "@radix-ui/react-icons";
import TrackList from "../components/TrackList.jsx";

export default function SaveReview({ review, images, onClose, onConfirm }) {
  const dialog = useRef();
  const { group, existing, sameName, unchanged } = review;
  const [targetId, setTargetId] = useState(
    existing?.GroupDefinition.UniqueID || "",
  );
  const [confirmed, setConfirmed] = useState(false);
  const target =
    existing || sameName.find((c) => c.GroupDefinition.UniqueID === targetId);
  useEffect(() => {
    dialog.current.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="import-dialog web-review"
      aria-labelledby="review-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <button
        className="icon-button dialog-close"
        aria-label="Close save review"
        onClick={onClose}
      >
        <Cross2Icon />
      </button>
      <div className="workflow-page">
        <span className="eyebrow">Review save change</span>
        <h1 id="review-title">{group.name}</h1>
        <p>
          {unchanged
            ? "This group already matches your selected save."
            : target
              ? `Replace ${target.groupItems.length} tracks with ${group.tracks.length}, keeping the group's position and local ID.`
              : "Add this group at the end of your custom groups. Your other groups stay unchanged."}
        </p>
        {!existing && sameName.length > 0 && (
          <label className="web-field">
            A group already has this name
            <select
              value={targetId}
              onChange={(e) => {
                setTargetId(e.target.value);
                setConfirmed(false);
              }}
            >
              <option value="">Add a separate, numbered copy</option>
              {sameName.map((c) => (
                <option
                  key={c.GroupDefinition.UniqueID}
                  value={c.GroupDefinition.UniqueID}
                >
                  Update existing group · {c.groupItems.length} tracks · ID{" "}
                  {c.GroupDefinition.UniqueID.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="notice">
          This edits a copy in this tab. Nothing is written to your game or
          Steam. Subscribe to Workshop tracks using their Steam links before
          playing.
        </p>
        {target && !unchanged && (
          <label className="web-check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Replace this group's name and track order
          </label>
        )}
        <TrackList tracks={group.tracks} images={images} browser />
        <div className="workflow-actions">
          <button onClick={onClose}>Back</button>
          <button
            className="primary"
            disabled={unchanged || Boolean(target && !confirmed)}
            onClick={() =>
              onConfirm({
                targetId,
                confirmUpdate: Boolean(target && confirmed),
              })
            }
          >
            <CheckIcon />
            {target ? "Update edited save" : "Add to edited save"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
