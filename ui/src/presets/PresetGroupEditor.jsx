import { useEffect, useState } from "react";
import {
  Cross2Icon,
  DownloadIcon,
  TrashIcon,
  PlusIcon,
} from "@radix-ui/react-icons";
import Dialog from "../components/Dialog.jsx";
import OrderedPresets from "./OrderedPresets.jsx";
import PresetPreview from "./PresetPreview.jsx";
import { setupTitle, setupMatches } from "./appearance.js";

export default function PresetGroupEditor({
  group,
  presets,
  busy,
  onClose,
  onChange,
  onExport,
  onDirty,
  appearance,
  loadImage,
}) {
  const [name, setName] = useState(group.name);
  const [members, setMembers] = useState(group.members);
  const [template, setTemplate] = useState(String(presets[0]?.id || ""));
  const [query, setQuery] = useState("");
  const dirty =
    name !== group.name ||
    JSON.stringify(members) !== JSON.stringify(group.members);
  useEffect(() => {
    onDirty?.(dirty);
    return () => onDirty?.(false);
  }, [dirty, onDirty]);
  const selected = members
    .map((id) => presets.find((p) => p.id === id))
    .filter(Boolean);
  const missing = members.filter((id) => !presets.some((p) => p.id === id));
  function close() {
    if (
      !busy &&
      (!dirty || window.confirm("Discard the unsaved group changes?"))
    )
      onClose();
  }
  async function save() {
    if (await onChange({ mode: "group", groupId: group.id, name, members }))
      onClose();
  }
  return (
    <Dialog
      className="preset-dialog"
      aria-label={group.new ? "Create preset group" : "Edit preset group"}
      onClose={close}
      dismissDisabled={busy}
    >
      <header className="detail-heading">
        <div>
          <span className="eyebrow">Preset group</span>
          <h2>{group.new ? "Create a group" : group.name}</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close preset group"
          onClick={close}
          disabled={busy}
        >
          <Cross2Icon />
        </button>
      </header>
      <label>
        Group name
        <input
          maxLength={200}
          value={name}
          disabled={busy || !group.editable}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className="preset-save-slot">
        {(dirty || group.new) && (
          <>
            <button
              disabled={busy}
              onClick={() => {
                setName(group.name);
                setMembers(group.members);
              }}
            >
              Discard
            </button>
            <button
              className="primary"
              disabled={
                busy ||
                !group.editable ||
                !name.trim() ||
                !members.length ||
                missing.length > 0
              }
              onClick={save}
            >
              {group.new ? "Create group" : "Save changes"}
            </button>
          </>
        )}
      </div>
      <h3>Preset order · {members.length} setups</h3>
      {missing.length > 0 && (
        <p className="notice">
          Missing preset references: {missing.join(", ")}. Remove them before
          saving.
          <button
            onClick={() =>
              setMembers(members.filter((id) => !missing.includes(id)))
            }
          >
            Remove missing references
          </button>
        </p>
      )}
      <OrderedPresets
        items={selected}
        disabled={busy || !group.editable}
        onChange={setMembers}
        appearance={appearance}
        loadImage={loadImage}
        positions={Object.fromEntries(presets.map((p, i) => [p.id, i]))}
      />
      <details open={group.new}>
        <summary>Add or remove presets</summary>
        <input
          type="search"
          aria-label="Find preset"
          placeholder="Find a character or appearance"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="membership-list">
          {presets
            .filter((p) =>
              setupMatches(p, appearance, presets.indexOf(p), query),
            )
            .map((p) => (
              <label className="check-label" key={p.id}>
                <input
                  type="checkbox"
                  disabled={busy || !group.editable}
                  checked={members.includes(p.id)}
                  aria-label={`Include ${setupTitle(p, appearance, presets.indexOf(p))}`}
                  onChange={(e) =>
                    setMembers(
                      e.target.checked
                        ? [...members, p.id]
                        : members.filter((id) => id !== p.id),
                    )
                  }
                />
                <PresetPreview
                  source={appearance?.previews?.[p.id]?.modded}
                  loadImage={loadImage}
                  alt="Saved modded setup"
                />
                <span>{setupTitle(p, appearance, presets.indexOf(p))}</span>
              </label>
            ))}
        </div>
      </details>
      {!group.new && (
        <footer className="preset-actions">
          <button disabled={busy || dirty} onClick={onExport}>
            <DownloadIcon />
            Export group
          </button>
          <button
            disabled={busy || dirty || !group.editable}
            onClick={async () => {
              if (
                window.confirm(
                  "Delete this group? Its presets will stay in your library.",
                ) &&
                (await onChange({ mode: "delete-group", groupId: group.id }))
              )
                onClose();
            }}
          >
            <TrashIcon />
            Delete group
          </button>
          <label>
            Template
            <select
              value={template}
              disabled={busy || dirty}
              onChange={(e) => setTemplate(e.target.value)}
            >
              {presets.map((p) => (
                <option value={p.id} key={p.id}>
                  {setupTitle(p, appearance, presets.indexOf(p))}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={busy || dirty || !template || !group.editable}
            onClick={async () => {
              if (
                await onChange({
                  mode: "duplicate",
                  presetId: Number(template),
                  groupId: group.id,
                })
              )
                onClose();
            }}
          >
            <PlusIcon />
            Create preset here
          </button>
        </footer>
      )}
    </Dialog>
  );
}
