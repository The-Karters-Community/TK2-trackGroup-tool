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
import Pagination, { usePagination } from "../components/Pagination.jsx";

export default function PresetGroupEditor({
  group,
  presets,
  busy,
  canSave = true,
  onClose,
  onChange,
  onExport,
  onDirty,
  appearance,
  loadImage,
  onOpenPreset,
  browser = false,
  library,
  presetKey = (id) => `preset:${id}`,
}) {
  const [name, setName] = useState(group.name);
  const [members, setMembers] = useState(group.members);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
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
  const memberPaging = usePagination(selected, group.id);
  const availablePaging = usePagination(
    presets.filter(
      (p) =>
        !members.includes(p.id) &&
        setupMatches(p, appearance, presets.indexOf(p), query),
    ),
    `${group.id}:${query}`,
  );
  function close() {
    if (
      !busy &&
      (!dirty || window.confirm("Discard the unsaved group changes?"))
    )
      onClose();
  }
  async function act(change) {
    setError("");
    try {
      if (await onChange(change)) onClose();
      else setError("Group was not saved. Your changes are still here.");
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <Dialog
      className="preset-dialog editor-shell"
      aria-label={group.new ? "Create preset group" : "Edit preset group"}
      onClose={close}
      dismissDisabled={busy}
    >
      <header className="detail-heading editor-header">
        <div>
          <span className="eyebrow">Preset group</span>
          <h2>{group.new ? "Create a group" : group.name}</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close preset group"
          disabled={busy}
          onClick={close}
        >
          <Cross2Icon />
        </button>
      </header>
      <div className="editor-body">
        <label>
          Group name
          <input
            maxLength={200}
            value={name}
            disabled={busy || !group.editable}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <h3>Racing order · {members.length} setups</h3>
        <p className="hint">
          Click a setup to edit it. Remove only takes it out of this group; it
          stays in All presets.
        </p>
        {missing.length > 0 && (
          <p className="notice">
            Some presets no longer exist.
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
          items={memberPaging.items}
          isFavorite={(id) => library?.favorite(presetKey(id))}
          onFavorite={
            library ? (id) => library.toggle(presetKey(id)) : undefined
          }
          offset={memberPaging.start}
          disabled={busy || !group.editable}
          onChange={(changed) => {
            const ids = new Set(changed);
            let index = 0;
            setMembers(
              members.map((id) => (ids.has(id) ? changed[index++] : id)),
            );
          }}
          onOpen={onOpenPreset}
          onRemove={(id) =>
            setMembers(members.filter((member) => member !== id))
          }
          appearance={appearance}
          loadImage={loadImage}
          positions={Object.fromEntries(presets.map((p, i) => [p.id, i]))}
        />
        <Pagination paging={memberPaging} label="Group members" />
        {!members.length && (
          <p className="empty-state">
            Add at least one preset to save this group.
          </p>
        )}
        <details open={group.new}>
          <summary>
            <PlusIcon /> Add presets from your library
          </summary>
          <input
            type="search"
            aria-label="Find preset"
            placeholder="Find a character or appearance"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="membership-list">
            {availablePaging.items.map((p) => (
              <button
                className="membership-add"
                key={p.id}
                disabled={busy || !group.editable}
                onClick={() => setMembers([...members, p.id])}
              >
                <PresetPreview
                  source={appearance?.previews?.[p.id]?.modded}
                  loadImage={loadImage}
                  alt="Saved modded setup"
                />
                <span>{setupTitle(p, appearance, presets.indexOf(p))}</span>
                <PlusIcon />
              </button>
            ))}
          </div>
          <Pagination paging={availablePaging} label="Available presets" />
        </details>
      </div>
      <footer className="editor-footer">
        {!canSave && (
          <p className="hint">
            Arrange this group freely. Close the game to save group changes.
          </p>
        )}
        {error && (
          <p className="editor-error" role="alert">
            {error}
          </p>
        )}
        <div className="editor-footer-actions">
          <div className="preset-actions">
            {!group.new && (
              <>
                <button disabled={busy || dirty} onClick={onExport}>
                  <DownloadIcon />
                  Export group
                </button>
                <button
                  disabled={busy || dirty || !canSave || !group.editable}
                  onClick={() =>
                    window.confirm(
                      "Delete this group? Its presets will stay in your library.",
                    ) && act({ mode: "delete-group", groupId: group.id })
                  }
                >
                  <TrashIcon />
                  Delete group
                </button>
              </>
            )}
          </div>
          <div className="preset-actions">
            <button
              disabled={busy || !dirty}
              onClick={() => {
                setName(group.name);
                setMembers(group.members);
                setError("");
              }}
            >
              Discard
            </button>
            <button
              className="primary"
              disabled={
                busy ||
                !canSave ||
                !group.editable ||
                (!dirty && !group.new) ||
                !name.trim() ||
                !members.length ||
                missing.length > 0
              }
              onClick={() =>
                act({ mode: "group", groupId: group.id, name, members })
              }
            >
              {group.new
                ? "Create group"
                : browser
                  ? "Apply to edited save"
                  : "Save changes"}
            </button>
          </div>
        </div>
      </footer>
    </Dialog>
  );
}
