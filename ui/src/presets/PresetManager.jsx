import { useEffect, useRef, useState } from "react";
import {
  DownloadIcon,
  UploadIcon,
  PlusIcon,
  PersonIcon,
  StackIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from "@radix-ui/react-icons";
import PresetImportReview from "./PresetImportReview.jsx";
import { validatePack } from "./model.js";
import PresetEditor from "./PresetEditor.jsx";
import PresetGroupEditor from "./PresetGroupEditor.jsx";
import OrderedPresets from "./OrderedPresets.jsx";
import PresetPreview from "./PresetPreview.jsx";
import { setupTitle, setupDescription, setupMatches } from "./appearance.js";

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
  loadImage,
  previewImages,
  onPreviewImages,
}) {
  const [tab, setTab] = useState("presets");
  const [ids, setIds] = useState([]);
  const [groupIds, setGroupIds] = useState([]);
  const [editor, setEditor] = useState(null);
  const [review, setReview] = useState(null);
  const [query, setQuery] = useState("");
  const fileInput = useRef();
  const imageInput = useRef();
  const [localImages, setImages] = useState({});
  const images = previewImages || localImages;
  const [layout, setLayout] = useState("gallery");
  const [draftOrder, setDraftOrder] = useState(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const presets = state?.presets || [];
  const groups = state?.groups || [];
  const appearance = browser
    ? { ...state?.appearance, previews: images }
    : state?.appearance;
  const positions = Object.fromEntries(presets.map((p, i) => [p.id, i]));
  const order = draftOrder || presets.map((p) => p.id);
  const orderDirty =
    JSON.stringify(order) !== JSON.stringify(presets.map((p) => p.id));
  const ordered = order
    .map((id) => presets.find((p) => p.id === id))
    .filter(Boolean);
  const filtered = ordered.filter((p) =>
    setupMatches(p, appearance, positions[p.id], query),
  );
  useEffect(() => {
    onDirty?.(orderDirty || editorDirty);
    return () => onDirty?.(false);
  }, [orderDirty, editorDirty, onDirty]);
  useEffect(
    () => () =>
      !onPreviewImages &&
      Object.values(images).forEach((modes) =>
        Object.values(modes).forEach(URL.revokeObjectURL),
      ),
    [images, onPreviewImages],
  );
  function loadImages(e) {
    const files = [...e.target.files];
    e.target.value = "";
    const next = {};
    let total = 0;
    for (const file of files) {
      const match = /^Icon_PresetID_(-?\d+)(_Modded)?\.png$/.exec(file.name);
      if (
        !match ||
        file.size > 4 * 1024 * 1024 ||
        total + file.size > 128 * 1024 * 1024
      )
        continue;
      total += file.size;
      next[match[1]] ||= {};
      next[match[1]][match[2] ? "modded" : "original"] =
        URL.createObjectURL(file);
    }
    if (onPreviewImages) onPreviewImages(next);
    else setImages(next);
    if (!Object.keys(next).length)
      onError?.("No preset PNGs found. Choose the game’s PresetIcons folder.");
  }
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
      {browser && (
        <input
          hidden
          ref={imageInput}
          type="file"
          webkitdirectory=""
          multiple
          aria-label="Choose preset images folder"
          onChange={loadImages}
        />
      )}
      <header className="page-heading">
        <h1>Presets</h1>
        <p>Browse your setups, arrange them, and share your favorites.</p>
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
            onClick={() => {
              setTab("presets");
              setQuery("");
            }}
          >
            <PersonIcon />
            All presets · {presets.length}
          </button>
          <button
            className={tab === "groups" ? "active" : ""}
            onClick={() => {
              setTab("groups");
              setQuery("");
            }}
          >
            <StackIcon />
            Preset groups · {groups.length}
          </button>
        </div>
        <div className="preset-actions">
          {browser && (
            <button onClick={() => imageInput.current.click()}>
              Add preset images
            </button>
          )}
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
              : "Search character, vehicle or appearance"
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {tab === "presets" && (
          <div className="view-switch" role="group" aria-label="Preset layout">
            <button
              className={layout === "gallery" ? "active" : ""}
              aria-pressed={layout === "gallery"}
              onClick={() => setLayout("gallery")}
            >
              Gallery
            </button>
            <button
              className={layout === "list" ? "active" : ""}
              aria-pressed={layout === "list"}
              onClick={() => setLayout("list")}
            >
              List
            </button>
          </div>
        )}
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
      {appearance?.loading && (
        <p className="hint" role="status">
          Loading installed appearance names and variants… Your presets are
          ready to browse.
        </p>
      )}
      {appearance?.warning && <p className="notice">{appearance.warning}</p>}
      {tab === "presets" ? (
        <>
          <div className="preset-selection-bar">
            <button
              disabled={!filtered.length}
              onClick={() =>
                setIds(
                  filtered.every((p) => selectedIds.includes(p.id))
                    ? selectedIds.filter(
                        (id) => !filtered.some((p) => p.id === id),
                      )
                    : [
                        ...new Set([
                          ...selectedIds,
                          ...filtered.map((p) => p.id),
                        ]),
                      ],
                )
              }
            >
              {filtered.length &&
              filtered.every((p) => selectedIds.includes(p.id))
                ? "Clear selection"
                : "Select all shown"}
            </button>
            <span className="hint">
              {selectedIds.length
                ? `${selectedIds.length} selected`
                : `${filtered.length} setups - drag the grip to arrange`}
            </span>
            {query && (
              <span className="hint">Clear search to reorder the library.</span>
            )}
            <div className="preset-save-slot library-save-slot">
              <div
                className={`edit-actions ${orderDirty ? "visible" : ""}`}
                aria-hidden={!orderDirty}
                inert={!orderDirty}
              >
                <span className="hint">Unsaved preset order</span>
                <button disabled={busy} onClick={() => setDraftOrder(null)}>
                  Discard
                </button>
                <button
                  className="primary"
                  disabled={!editable}
                  onClick={async () => {
                    if (await onChange({ mode: "order", order }))
                      setDraftOrder(null);
                  }}
                >
                  Save changes
                </button>
              </div>
            </div>
          </div>
          <OrderedPresets
            items={filtered}
            disabled={!editable || Boolean(query)}
            onChange={setDraftOrder}
            onOpen={(p) => setEditor({ kind: "preset", value: p })}
            appearance={appearance}
            loadImage={loadImage}
            selectedIds={selectedIds}
            onSelect={(id) => toggle(id, selectedIds, setIds)}
            layout={layout}
            positions={positions}
          />
          {!presets.length && (
            <p className="empty-state">Your saved presets will appear here.</p>
          )}
          {presets.length > 0 && !filtered.length && (
            <p className="empty-state">No setups match that search.</p>
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
                    aria-label={`Select ${g.name}`}
                    onChange={() => toggle(g.id, selectedGroups, setGroupIds)}
                  />
                  Select group
                </label>
                <button onClick={() => setEditor({ kind: "group", value: g })}>
                  <span className="preset-group-previews">
                    {g.members.slice(0, 4).map((id) => (
                      <PresetPreview
                        key={id}
                        source={appearance?.previews?.[id]?.modded}
                        loadImage={loadImage}
                        alt="Group setup preview"
                      />
                    ))}
                  </span>
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
        {browser
          ? "Add the game's PresetIcons folder for pictures. Files stay in this browser. "
          : "Previews come from the game's PresetIcons cache. Missing mods keep their saved picture when available. "}
        Workshop installation status is unverified.{" "}
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
          position={positions[editor.value.id]}
          busy={busy}
          canSave={editable}
          onDirty={setEditorDirty}
          appearance={appearance}
          loadImage={loadImage}
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
          onDirty={setEditorDirty}
          appearance={appearance}
          loadImage={loadImage}
          onClose={() => setEditor(null)}
          onChange={onChange}
          onExport={() => onExport([], [editor.value.id])}
        />
      )}
      {review && (
        <PresetImportReview
          review={review}
          appearance={appearance}
          groups={groups}
          busy={busy}
          editable={editable}
          browser={browser}
          onChange={onChange}
          onClose={() => setReview(null)}
        />
      )}
    </section>
  );
}
