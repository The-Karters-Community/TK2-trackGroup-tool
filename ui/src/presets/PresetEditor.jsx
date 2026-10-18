import { useEffect, useState, useRef } from "react";
import {
  Cross2Icon,
  CopyIcon,
  DownloadIcon,
  TrashIcon,
  CheckIcon,
  DrawingPinFilledIcon,
} from "@radix-ui/react-icons";
import Dialog from "../components/Dialog.jsx";
import { cosmetic } from "./model.js";
import { slots, setupTitle } from "./appearance.js";
import AppearanceChoice from "./AppearanceChoice.jsx";
import LivePresetPreview from "./LivePresetPreview.jsx";
import PresetPreview from "./PresetPreview.jsx";
import LocalPlayers from "./LocalPlayers.jsx";
import SavedPresetChooser from "./SavedPresetChooser.jsx";

export default function PresetEditor({
  preset,
  presets,
  busy: working,
  canSave = true,
  canSavePreset = canSave,
  saveToRunningGame = false,
  gameRunning = false,
  onClose,
  onSave,
  onExport,
  onChange,
  onDirty,
  appearance,
  loadImage,
  loadModel,
  refreshModels,
  position = 0,
  browser = false,
  quick = false,
  quickPlayers = [],
  quickPlayer = 0,
  onQuickPlayer,
  library,
  initialDraft,
  onDraft,
  quickDraftPlayers = [],
  title,
  subtitle,
  hideCollectionActions = false,
  saveLabel,
  choosePreset = quick,
}) {
  const [choosingPreset, setChoosingPreset] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = Boolean(working || saving);
  const [value, setValue] = useState(
    () => initialDraft?.value || cosmetic(preset.data),
  );
  const [baseline, setBaseline] = useState(
    () => initialDraft?.baseline || cosmetic(preset.data),
  );
  const [version, setVersion] = useState("modded");
  const [category, setCategory] = useState(0);
  const [sticker, setSticker] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(
    () =>
      window.matchMedia?.("(min-width: 900px) and (min-height: 600px)")
        .matches || false,
  );
  const previewPreference = useRef(false);
  const acknowledgedSave = useRef(null);
  const [saveStatus, setSaveStatus] = useState("");
  const [error, setError] = useState("");
  const saved = JSON.stringify(cosmetic(preset.data));
  const base = JSON.stringify(baseline);
  const dirty = JSON.stringify(value) !== base;
  const conflict = saved !== base && dirty && !saving;
  const draftReporter = useRef(onDraft);
  draftReporter.current = onDraft;
  const serializedDraft = JSON.stringify(value);
  useEffect(() => {
    draftReporter.current?.(value, baseline);
  }, [serializedDraft, base]);
  useEffect(() => {
    const media = window.matchMedia?.(
      "(min-width: 900px) and (min-height: 600px)",
    );
    const adapt = () => {
      if (!previewPreference.current) setPreviewOpen(Boolean(media?.matches));
    };
    media?.addEventListener?.("change", adapt);
    return () => media?.removeEventListener?.("change", adapt);
  }, []);
  useEffect(() => {
    if (
      saved !== base &&
      !dirty &&
      !saving &&
      saved !== acknowledgedSave.current
    ) {
      setValue(cosmetic(preset.data));
      setBaseline(cosmetic(preset.data));
    }
  }, [saved, base, dirty, preset.data, saving]);
  useEffect(() => {
    onDirty?.(dirty);
    return () => onDirty?.(false);
  }, [dirty, onDirty]);
  const modded = version === "modded";
  const changed =
    slots.some(
      ([, , f]) =>
        value[modded ? `${f}_Modded` : f] !==
        preset.data[modded ? `${f}_Modded` : f],
    ) ||
    JSON.stringify(value.stickersData) !==
      JSON.stringify(preset.data.stickersData) ||
    (appearance?.staleViews
      ? appearance.staleViews[preset.id]?.includes(version)
      : appearance?.stalePreviews?.includes(preset.id));
  function close() {
    if (quick) {
      if (!busy) onClose();
      return;
    }
    if (
      !busy &&
      (!dirty || window.confirm("Discard the unsaved preset changes?"))
    )
      onClose();
  }
  async function act(action) {
    setError("");
    setSaving(true);
    try {
      if (await action()) onClose();
      else
        setError(
          "Changes were not saved. Check the connection and refresh the save. Your draft is still here.",
        );
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }
  async function save() {
    setError("");
    setSaveStatus("");
    setSaving(true);
    const next = cosmetic(value);
    try {
      if (await onSave(next, { id: preset.id, data: baseline })) {
        acknowledgedSave.current = saved;
        setBaseline(next);
        setSaveStatus("Saved");
      } else
        setError(
          "Not saved. Your selections are still here; check the connection and try again.",
        );
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }
  const changedParts =
    slots.filter(
      ([, , f]) =>
        value[f] !== baseline[f] ||
        value[`${f}_Modded`] !== baseline[`${f}_Modded`],
    ).length +
    (JSON.stringify(value.stickersData) !==
    JSON.stringify(baseline.stickersData)
      ? 1
      : 0);
  const [label, kind, baseField] = slots[category] || [
    "Sticker",
    "stickers",
    "iStickerMaterialID",
  ];
  const field = modded ? `${baseField}_Modded` : baseField;
  const previewUsesOriginal =
    modded && category < 3 && !appearance?.items?.[kind]?.[value[field]];
  const modelId =
    category < 3 ? value[previewUsesOriginal ? baseField : field] : null;
  const partInfo = (index) => {
    const [, partKind, partField] = slots[index];
    const items = appearance?.items?.[partKind];
    return (
      items?.[value[modded ? `${partField}_Modded` : partField]] ||
      (modded ? items?.[value[partField]] : undefined)
    );
  };
  const modelAvailable =
    category < 3 && appearance?.models?.[kind]?.includes(modelId);
  const editorTitle =
    title || (quick ? "Quick Setup" : setupTitle(preset, appearance, position));
  return (
    <>
      <Dialog
        className="preset-dialog editor-shell customization-dialog"
        aria-label={`Edit ${editorTitle}`}
        onClose={close}
        dismissDisabled={busy}
      >
        <header className="detail-heading editor-header">
          <div>
            <span className="eyebrow">
              {subtitle ||
                (quick ? "Current game setup" : "Your customization")}
            </span>
            <h2>{editorTitle}</h2>
          </div>
          {quick && quickPlayers.length > 1 && (
            <LocalPlayers
              players={quickPlayers}
              selected={quickPlayer}
              drafts={quickDraftPlayers}
              busy={busy}
              onSelect={(player) => {
                draftReporter.current?.(value, baseline);
                onQuickPlayer(player);
              }}
              appearance={appearance}
              loadImage={loadImage}
            />
          )}
          {choosePreset && presets?.length > 0 && (
            <button disabled={busy} onClick={() => setChoosingPreset(true)}>
              <CopyIcon aria-hidden="true" /> Choose saved preset
            </button>
          )}
          <button
            className="preview-toggle"
            type="button"
            aria-expanded={previewOpen}
            onClick={() => {
              previewPreference.current = true;
              setPreviewOpen(!previewOpen);
            }}
          >
            {previewOpen
              ? "Hide preview"
              : loadModel
                ? "Show 3D preview"
                : "Show saved preview"}
          </button>
          <button
            className="icon-button"
            aria-label="Close preset"
            onClick={close}
            disabled={busy}
          >
            <Cross2Icon />
          </button>
        </header>
        <div
          className={`editor-body customization-layout${previewOpen ? " with-preview" : ""}`}
        >
          <aside
            className={`setup-inspector${previewOpen ? " preview-open" : ""}`}
          >
            {previewOpen && (
              <LivePresetPreview
                data={value}
                view={version}
                source={appearance?.previews?.[preset.id]?.[version]}
                changed={changed}
                loadImage={loadImage}
                loadModel={loadModel}
                refreshModels={refreshModels}
                modelKind={kind}
                modelId={modelId}
                modelAvailable={modelAvailable}
                appearanceLoading={appearance?.loading}
                revision={appearance?.revision}
                imageRevision={appearance?.previewRevision}
              />
            )}
          </aside>
          <section className="customization-picker">
            {quick && gameRunning && !saveToRunningGame && (
              <p className="notice">
                {saveToRunningGame
                  ? "Save changes applies through the running game. An open Quick Setup editor refreshes automatically."
                  : "Preview and arrange freely. Live saving is unavailable for this game build or Steam profile."}
              </p>
            )}
            <div className="customization-picker-heading">
              <div
                className="tabs category-tabs"
                data-customization-categories
                aria-label="Appearance category"
              >
                {["Character", "Vehicle", "Wheels", "Stickers"].map(
                  (title, i) => (
                    <button
                      aria-label={title}
                      title={i < 3 ? partInfo(i)?.label : title}
                      key={title}
                      data-customization-category
                      className={category === i ? "active" : ""}
                      aria-pressed={category === i}
                      onClick={() => setCategory(i)}
                    >
                      {i < 3 ? (
                        <PresetPreview
                          source={partInfo(i)?.image}
                          loadImage={loadImage}
                          alt=""
                        />
                      ) : (
                        <span className="category-icon" aria-hidden="true">
                          <DrawingPinFilledIcon />
                        </span>
                      )}
                      <span>
                        {title}
                        {i < 3 && (
                          <small>
                            {partInfo(i)?.label || "Saved appearance"}
                          </small>
                        )}
                        {i === 3 && (
                          <small>{value.stickersData.length} slots</small>
                        )}
                      </span>
                    </button>
                  ),
                )}
              </div>
              <p className="category-navigation-hint">
                <span className="controller-category-hint">
                  LB / RB: switch part
                </span>
                <span className="keyboard-category-hint">
                  Alt + Left / Right: switch part
                </span>
              </p>
              <div
                className="tabs customization-version"
                aria-label="Customization version"
              >
                {["modded", "original"].map((view) => (
                  <button
                    key={view}
                    className={version === view ? "active" : ""}
                    aria-pressed={version === view}
                    onClick={() => setVersion(view)}
                  >
                    {view === "modded" ? "Modded" : "Original"}
                  </button>
                ))}
              </div>
            </div>
            <p className="appearance-active-view" role="status">
              In game: {value.bUsingModdedVersion ? "Modded" : "Original"}.
              Selecting an item applies that appearance version.
              {previewUsesOriginal &&
                " This part uses its Original appearance until you select an installed mod."}
            </p>
            {category === 3 && (
              <>
                <div
                  className="sticker-slots"
                  role="group"
                  aria-label="Sticker slots"
                >
                  {value.stickersData.map((_, i) => (
                    <button
                      key={i}
                      aria-pressed={sticker === i}
                      className={sticker === i ? "selected" : ""}
                      onClick={() => setSticker(i)}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
                <p className="hint">
                  Sticker slot {sticker + 1}. Placement is preserved; adjust
                  positioning in the game.
                </p>
              </>
            )}
            {browser && (
              <p className="hint">
                The browser can reuse appearances found in your saved presets.
                The desktop edition reads the full installed cosmetic library.
              </p>
            )}
            {!quick && !canSave && !busy && (
              <p className="notice">
                {gameRunning && saveToRunningGame
                  ? "Changes save through the running game. A race in progress keeps its current setup."
                  : gameRunning
                    ? "Live saving needs the supported native integration. Your draft stays here if it is unavailable."
                    : "Connect Steam and resolve the profile status to save changes. You can still preview unsaved selections."}
              </p>
            )}
            <fieldset disabled={busy} className="preset-fields">
              <AppearanceChoice
                key={`${field}-${category === 3 ? sticker : category}`}
                label={label}
                kind={kind}
                field={field}
                data={category === 3 ? value.stickersData[sticker] : value}
                presets={presets}
                appearance={appearance}
                library={library}
                loadImage={loadImage}
                onChange={(id) =>
                  setValue(
                    category === 3
                      ? {
                          ...value,
                          bUsingModdedVersion: modded,
                          stickersData: value.stickersData.map((s, i) =>
                            i === sticker ? { ...s, [field]: id } : s,
                          ),
                        }
                      : { ...value, [field]: id, bUsingModdedVersion: modded },
                  )
                }
              />
            </fieldset>
          </section>
        </div>
        <footer className="editor-footer">
          {conflict && (
            <p className="editor-error" role="alert">
              This preset changed in the game. Your unsaved changes are
              preserved.{" "}
              <button
                onClick={() => {
                  setValue(cosmetic(preset.data));
                  setBaseline(cosmetic(preset.data));
                  setError("");
                  setSaveStatus("");
                }}
              >
                Load game version
              </button>
            </p>
          )}
          {error && (
            <p className="editor-error" role="alert">
              {error}
            </p>
          )}
          <div className="editor-footer-actions">
            <div className="preset-actions">
              {!hideCollectionActions && (
                <>
                  {!quick && (
                    <button disabled={busy || dirty} onClick={onExport}>
                      <DownloadIcon />
                      Export preset
                    </button>
                  )}
                  <button
                    disabled={busy || dirty || !canSave}
                    onClick={() =>
                      act(() =>
                        onChange({
                          mode: quick ? "save-quick-preset" : "duplicate",
                          presetId: preset.id,
                        }),
                      )
                    }
                  >
                    <CopyIcon />
                    {quick ? "Save as new preset" : "Duplicate"}
                  </button>
                  {!quick && (
                    <button
                      disabled={busy || dirty || !canSave}
                      onClick={() =>
                        window.confirm(
                          "Delete this setup from the save and its groups?",
                        ) &&
                        act(() =>
                          onChange({ mode: "delete", presetId: preset.id }),
                        )
                      }
                    >
                      <TrashIcon />
                      Delete
                    </button>
                  )}
                </>
              )}
            </div>
            <div className="preset-actions">
              <span className="hint" role="status">
                {busy ? (
                  "Saving…"
                ) : dirty ? (
                  <>
                    <span>Unsaved changes</span>
                    <small className="save-part-count">
                      {" "}
                      · {changedParts || 1}{" "}
                      {changedParts === 1 ? "part" : "parts"}
                    </small>
                  </>
                ) : (
                  saveStatus || "No changes"
                )}
              </span>
              <button
                disabled={busy || !dirty}
                onClick={() => {
                  setValue(cosmetic(preset.data));
                  setBaseline(cosmetic(preset.data));
                  setError("");
                }}
              >
                Discard
              </button>
              <button
                className="primary save-action"
                data-save-action
                aria-keyshortcuts="Control+S Meta+S"
                disabled={busy || !canSavePreset || !dirty || conflict}
                onClick={save}
              >
                <CheckIcon aria-hidden="true" />
                {saveLabel ||
                  (browser
                    ? "Apply to edited save"
                    : saveToRunningGame
                      ? "Save to running game"
                      : "Save changes")}
                <kbd className="keyboard-save-hint" aria-hidden="true">
                  Ctrl S
                </kbd>
                <kbd className="controller-save-hint" aria-hidden="true">
                  Menu
                </kbd>
              </button>
            </div>
          </div>
        </footer>
      </Dialog>
      {choosingPreset && (
        <SavedPresetChooser
          presets={presets}
          appearance={appearance}
          loadImage={loadImage}
          busy={busy}
          onClose={() => setChoosingPreset(false)}
          onChoose={(selected) => {
            setValue(cosmetic(selected.data));
            setError("");
            setSaveStatus("");
            setChoosingPreset(false);
          }}
        />
      )}
    </>
  );
}
