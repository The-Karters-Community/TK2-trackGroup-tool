import { useRef, useState } from "react";
import {
  DownloadIcon,
  UploadIcon,
  PlusIcon,
  PersonIcon,
  StackIcon,
  Cross2Icon,
  ChevronUpIcon,
  ChevronDownIcon,
} from "@radix-ui/react-icons";
import Dialog from "../components/Dialog.jsx";
import { moddedReferences, validatePack } from "./model.js";
import PresetEditor from "./PresetEditor.jsx";
import PresetGroupEditor from "./PresetGroupEditor.jsx";
import OrderedPresets from "./OrderedPresets.jsx";

export default function PresetManager({
  state,
  busy,
  browser = false,
  available = true,
  onOpenSave,
  onChange,
  onExport,
  onError,
  onDirty,
}) {
  const [tab, setTab] = useState("presets");
  const [ids, setIds] = useState([]);
  const [groupIds, setGroupIds] = useState([]);
  const [editor, setEditor] = useState(null);
  const [review, setReview] = useState(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const [query, setQuery] = useState("");
  const fileInput = useRef();
  const presets = state?.presets || [];
  const groups = state?.groups || [];
  const editable = available && !busy && !state?.error;
  const selectedIds = ids.filter((id) => presets.some((p) => p.id === id));
  const selectedGroups = groupIds.filter((id) =>
    groups.some((g) => g.id === id),
  );
  async function load(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      if (file.size > 1024 * 1024)
        throw new Error("Preset file exceeds the 1 MB limit.");
      setReview(validatePack(JSON.parse(await file.text())));
      setAcknowledged(false);
      setConfirmUpdate(false);
    } catch (err) {
      onError(err.message);
    }
  }
  function toggle(id, selected, update) {
    update(
      selected.includes(id)
        ? selected.filter((i) => i !== id)
        : [...selected, id],
    );
  }
  function moveGroup(id, step) {
    const order = groups.map((g) => g.id);
    const i = order.indexOf(id);
    [order[i], order[i + step]] = [order[i + step], order[i]];
    onChange({ mode: "group-order", order });
  }
  const conflicts =
    review?.groups.filter((g) =>
      groups.some((existing) => existing.id === g.id),
    ) || [];
  return (
    <section className="library-page preset-page">
      <input
        ref={fileInput}
        hidden
        type="file"
        accept=".tk2presets.json,.json"
        aria-label="Choose preset pack"
        onChange={load}
      />
      <header className="page-heading">
        <span className="eyebrow">Your garage</span>
        <h1>Presets</h1>
        <p>
          Keep your original and modded setups together. Share a preset, a
          selection, or whole groups.
        </p>
      </header>
      {browser && !available ? (
        <div className="notice">
          Open your game save to manage presets. It stays in this browser.
          <button className="primary" onClick={onOpenSave}>
            Open game save
          </button>
        </div>
      ) : null}
      {state?.error && (
        <p className="notice" role="alert">
          {state.error}
        </p>
      )}
      <div className="preset-toolbar">
        <div className="tabs">
          <button
            className={tab === "presets" ? "active" : ""}
            onClick={() => setTab("presets")}
          >
            <PersonIcon />
            All presets · {presets.length}
          </button>
          <button
            className={tab === "groups" ? "active" : ""}
            onClick={() => setTab("groups")}
          >
            <StackIcon />
            Preset groups · {groups.length}
          </button>
        </div>
        <div className="preset-actions">
          <button
            disabled={!editable}
            onClick={() => fileInput.current.click()}
          >
            <UploadIcon />
            Import preset file
          </button>
          <button
            disabled={!editable || !presets.length}
            onClick={() =>
              setEditor({
                kind: "group",
                value: {
                  new: true,
                  editable: true,
                  id: crypto.randomUUID(),
                  name: "",
                  members: selectedIds,
                },
              })
            }
          >
            <PlusIcon />
            Create group
          </button>
        </div>
      </div>
      <div className="preset-toolbar">
        <input
          type="search"
          aria-label="Search presets"
          placeholder={
            tab === "groups"
              ? "Search group names"
              : "Search preset or character IDs"
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          disabled={busy || (!selectedIds.length && !selectedGroups.length)}
          onClick={() => onExport(selectedIds, selectedGroups)}
        >
          <DownloadIcon />
          Export selected
          {selectedIds.length + selectedGroups.length
            ? ` · ${selectedIds.length + selectedGroups.length}`
            : ""}
        </button>
      </div>
      {tab === "presets" ? (
        <>
          <p className="hint">
            Select presets to export together or create a group. Drag the grip
            to reorder; arrow buttons also work.
          </p>
          <div className="preset-selection">
            <button
              disabled={!presets.length}
              onClick={() =>
                setIds(
                  selectedIds.length === presets.length
                    ? []
                    : presets.map((p) => p.id),
                )
              }
            >
              {selectedIds.length === presets.length && presets.length
                ? "Clear selection"
                : "Select all"}
            </button>
            {presets
              .filter((p) =>
                `${p.id} ${p.data.iCharacterSkinMaterialID}`.includes(query),
              )
              .map((p) => (
                <label className="check-label" key={p.id}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(p.id)}
                    onChange={() => toggle(p.id, selectedIds, setIds)}
                  />
                  #{p.id}
                </label>
              ))}
          </div>
          {!query && (
            <OrderedPresets
              items={presets}
              disabled={!editable}
              onChange={(order) => onChange({ mode: "order", order })}
              onOpen={(p) => setEditor({ kind: "preset", value: p })}
            />
          )}
          {query && (
            <div className="preset-cards">
              {presets
                .filter((p) =>
                  `${p.id} ${p.data.iCharacterSkinMaterialID}`.includes(query),
                )
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setEditor({ kind: "preset", value: p })}
                  >
                    <PersonIcon />
                    <strong>Preset #{p.id}</strong>
                    <small>Character {p.data.iCharacterSkinMaterialID}</small>
                  </button>
                ))}
            </div>
          )}
          {!presets.length && (
            <p className="empty-state">Your saved presets will appear here.</p>
          )}
        </>
      ) : (
        <div className="preset-cards">
          {groups
            .filter((g) => g.name.toLowerCase().includes(query.toLowerCase()))
            .map((g) => (
              <article key={g.id}>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={selectedGroups.includes(g.id)}
                    onChange={() => toggle(g.id, selectedGroups, setGroupIds)}
                  />
                  Select group
                </label>
                <button onClick={() => setEditor({ kind: "group", value: g })}>
                  <StackIcon />
                  <strong>{g.name}</strong>
                  <small>
                    {g.members.length} presets · edit name, membership & order
                  </small>
                </button>
                <div className="preset-group-order">
                  <button
                    className="icon-button"
                    disabled={!editable || groups[0]?.id === g.id}
                    aria-label={`Move ${g.name} up`}
                    onClick={() => moveGroup(g.id, -1)}
                  >
                    <ChevronUpIcon />
                  </button>
                  <button
                    className="icon-button"
                    disabled={!editable || groups.at(-1)?.id === g.id}
                    aria-label={`Move ${g.name} down`}
                    onClick={() => moveGroup(g.id, 1)}
                  >
                    <ChevronDownIcon />
                  </button>
                </div>
              </article>
            ))}
          {!groups.length && (
            <p className="empty-state">
              Create a group from your favorite setups.
            </p>
          )}
        </div>
      )}
      <p className="hint">
        Cosmetic names, thumbnails and Workshop installation status are not yet
        resolved. Local-only mod files stay on your machine.{" "}
        {browser
          ? "Changes go into the edited save download."
          : "Close the game and refresh Steam before saving changes."}
      </p>
      {state?.localPackages?.length > 0 && (
        <details className="notice">
          <summary>
            Local cosmetic packages · {state.localPackages.length}
          </summary>
          <ul>
            {state.localPackages.map((p) => (
              <li key={p.name}>
                {p.name} · {p.kinds.join(", ")}
              </li>
            ))}
          </ul>
          <p className="hint">
            Found in the game's Mods folder. This inventory cannot prove which
            saved configuration IDs they provide. Upload credentials and assets
            are never exported.
          </p>
        </details>
      )}
      {editor?.kind === "preset" && (
        <PresetEditor
          key={editor.value.id}
          preset={editor.value}
          presets={presets}
          busy={busy}
          canSave={editable}
          onDirty={onDirty}
          onClose={() => setEditor(null)}
          onSave={(data) =>
            onChange({ mode: "preset", presetId: editor.value.id, data })
          }
          onChange={onChange}
          onExport={() => onExport([editor.value.id], [])}
        />
      )}
      {editor?.kind === "group" && (
        <PresetGroupEditor
          key={editor.value.id}
          group={{
            ...editor.value,
            editable: editor.value.editable && editable,
          }}
          presets={presets}
          busy={busy}
          onDirty={onDirty}
          onClose={() => setEditor(null)}
          onChange={onChange}
          onExport={() => onExport([], [editor.value.id])}
        />
      )}
      {review && (
        <Dialog
          className="preset-dialog"
          aria-label="Review preset import"
          onClose={() => setReview(null)}
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
              onClick={() => setReview(null)}
            >
              <Cross2Icon />
            </button>
          </header>
          <p>
            Identical setups are reused. New setups receive new IDs. Existing
            group order in the library is preserved.
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
            I will ensure matching cosmetic assets are installed. This import
            does not subscribe or bundle them; the game may replace missing
            cosmetics.
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
            <button disabled={busy} onClick={() => setReview(null)}>
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
                  setReview(null);
              }}
            >
              {browser ? "Apply to edited save" : "Import presets"}
            </button>
          </footer>
        </Dialog>
      )}
    </section>
  );
}
