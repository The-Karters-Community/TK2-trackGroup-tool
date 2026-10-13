import { useState } from "react";
import { Cross2Icon, PersonIcon, StackIcon } from "@radix-ui/react-icons";
import Dialog from "../components/Dialog.jsx";
import { moddedReferences } from "./model.js";
import { setupTitle, setupDescription } from "./appearance.js";

export default function PresetImportReview({
  review,
  appearance,
  groups,
  busy,
  editable,
  browser,
  onChange,
  onClose,
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const conflicts = review.groups.filter((g) =>
    groups.some((existing) => existing.id === g.id),
  );
  return (
    <Dialog
      className="preset-dialog"
      aria-label="Review preset import"
      onClose={() => onClose()}
      dismissDisabled={busy}
    >
      <header className="detail-heading">
        <div>
          <span className="eyebrow">Review before importing</span>
          <h2>
            {review.presets.length} presets · {review.groups.length} groups
          </h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close preset import"
          disabled={busy}
          onClick={() => onClose()}
        >
          <Cross2Icon />
        </button>
      </header>
      <p>
        Identical setups are reused. New setups receive new IDs. Existing group
        order in the library is preserved.
      </p>
      <ul className="preset-import-list">
        {review.presets.map((p) => (
          <li key={p.key}>
            <PersonIcon />
            <strong>{p.key}</strong>
            <span>
              Character {p.data.iCharacterSkinMaterialID} · Vehicle{" "}
              {p.data.iVehicleMaterialID} · Wheels {p.data.iWheelMaterialID}
            </span>
            <small>
              {moddedReferences(p.data).length
                ? "Matching modded assets required · unverified"
                : "Original configurations"}
            </small>
          </li>
        ))}
      </ul>
      {review.groups.map((g) => (
        <p key={g.id}>
          <StackIcon /> {g.name} · {g.presets.length} presets
        </p>
      ))}
      <label className="check-label">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
        />
        I will ensure matching cosmetic assets are installed. This import does
        not subscribe or bundle them; the game may replace missing cosmetics.
      </label>
      {conflicts.length > 0 && (
        <label className="check-label">
          <input
            type="checkbox"
            checked={confirmUpdate}
            onChange={(e) => setConfirmUpdate(e.target.checked)}
          />
          Update {conflicts.length} existing groups with the same ID
        </label>
      )}
      <footer className="preset-actions">
        <button disabled={busy} onClick={() => onClose()}>
          Cancel
        </button>
        <button
          className="primary"
          disabled={
            !editable ||
            !acknowledged ||
            (conflicts.length > 0 && !confirmUpdate)
          }
          onClick={async () => {
            if (
              await onChange({
                mode: "import",
                pack: review,
                confirmUpdate,
              })
            )
              onClose();
          }}
        >
          {browser ? "Apply to edited save" : "Import presets"}
        </button>
      </footer>
    </Dialog>
  );
}
