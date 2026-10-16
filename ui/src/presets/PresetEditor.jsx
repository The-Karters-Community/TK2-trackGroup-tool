import { useEffect, useState, useRef } from "react";
import {
  Cross2Icon,
  CopyIcon,
  DownloadIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import Dialog from "../components/Dialog.jsx";
import { cosmetic } from "./model.js";
import { slots, setupTitle } from "./appearance.js";
import AppearanceChoice from "./AppearanceChoice.jsx";
import LivePresetPreview from "./LivePresetPreview.jsx";
import PresetPreview from "./PresetPreview.jsx";
import LocalPlayers from "./LocalPlayers.jsx";

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
  renderPreview,
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
}) {
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
  const [previewOpen, setPreviewOpen] = useState(false);
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
    if (saved !== base && !dirty) {
      setValue(cosmetic(preset.data));
      setBaseline(cosmetic(preset.data));
    }
  }, [saved, base, dirty, preset.data]);
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
          "Changes were not saved. Check that the game is closed and the save is current. Your draft is still here.",
        );
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }
  const [label, kind, baseField] = slots[category] || [
    "Sticker",
    "stickers",
    "iStickerMaterialID",
  ];
  const field = modded ? `${baseField}_Modded` : baseField;
  const modelId = category < 3 ? value[field] : null;
  const modelAvailable =
    category < 3 && appearance?.models?.[kind]?.includes(modelId);
  return (
    <Dialog
      className="preset-dialog editor-shell customization-dialog"
      aria-label={`Edit ${setupTitle(preset, appearance, position)}`}
      onClose={close}
      dismissDisabled={busy}
    >
      <header className="detail-heading editor-header">
        <div>
          <span className="eyebrow">
            {quick ? "Current game setup" : "Your customization"}
          </span>
          <h2>
            {quick ? "Quick Setup" : setupTitle(preset, appearance, position)}
          </h2>
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
        <button
          className="preview-toggle"
          type="button"
          aria-expanded={previewOpen}
          onClick={() => setPreviewOpen(!previewOpen)}
        >
          {previewOpen
            ? "Hide preview"
            : loadModel
              ? "Show 3D preview"
              : "Show saved preview"}
        </button>
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
              renderPreview={renderPreview}
              loadModel={loadModel}
              refreshModels={refreshModels}
              modelKind={kind}
              modelId={modelId}
              modelAvailable={modelAvailable}
              appearanceLoading={appearance?.loading}
              revision={appearance?.revision}
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
              aria-label="Appearance category"
            >
              {["Character", "Vehicle", "Wheels", "Stickers"].map(
                (title, i) => (
                  <button
                    aria-label={title}
                    title={
                      i < 3
                        ? appearance?.items?.[slots[i][1]]?.[
                            value[
                              modded ? `${slots[i][2]}_Modded` : slots[i][2]
                            ]
                          ]?.label
                        : title
                    }
                    key={title}
                    className={category === i ? "active" : ""}
                    aria-pressed={category === i}
                    onClick={() => setCategory(i)}
                  >
                    {i < 3 && (
                      <PresetPreview
                        source={
                          appearance?.items?.[slots[i][1]]?.[
                            value[
                              modded ? `${slots[i][2]}_Modded` : slots[i][2]
                            ]
                          ]?.image
                        }
                        loadImage={loadImage}
                        alt=""
                      />
                    )}
                    <span>
                      {title}
                      {i < 3 && (
                        <small>
                          {appearance?.items?.[slots[i][1]]?.[
                            value[
                              modded ? `${slots[i][2]}_Modded` : slots[i][2]
                            ]
                          ]?.label || "Saved appearance"}
                        </small>
                      )}
                    </span>
                  </button>
                ),
              )}
            </div>
            <div className="tabs" aria-label="Customization version">
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
              The browser can reuse appearances found in your saved presets. The
              desktop edition reads the full installed cosmetic library.
            </p>
          )}
          {!quick && !canSave && !busy && (
            <p className="notice">
              {gameRunning && saveToRunningGame
                ? "You can save this preset through the running game. Group and collection changes still need the game closed."
                : gameRunning
                  ? "Install and enable the optional Garage companion to save one preset while the game is running. Other changes need the game closed."
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
                        stickersData: value.stickersData.map((s, i) =>
                          i === sticker ? { ...s, [field]: id } : s,
                        ),
                      }
                    : { ...value, [field]: id },
                )
              }
            />
          </fieldset>
        </section>
      </div>
      <footer className="editor-footer">
        {conflict && (
          <p className="editor-error" role="alert">
            This preset changed in the game. Your unsaved changes are preserved.{" "}
            <button
              onClick={() => {
                setValue(cosmetic(preset.data));
                setBaseline(cosmetic(preset.data));
                setError("");
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
                  act(() => onChange({ mode: "delete", presetId: preset.id }))
                }
              >
                <TrashIcon />
                Delete
              </button>
            )}
          </div>
          <div className="preset-actions">
            <span className="hint" role="status">
              {busy ? "Saving…" : dirty ? "Unsaved changes" : "No changes"}
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
              className="primary"
              disabled={busy || !canSavePreset || !dirty || conflict}
              onClick={() =>
                quick
                  ? (async () => {
                      setError("");
                      setSaving(true);
                      try {
                        if (
                          await onSave(value, { id: preset.id, data: baseline })
                        )
                          setBaseline(value);
                      } catch (err) {
                        setError(err.message);
                      } finally {
                        setSaving(false);
                      }
                    })()
                  : act(() => onSave(value, { id: preset.id, data: baseline }))
              }
            >
              {browser
                ? "Apply to edited save"
                : saveToRunningGame
                  ? "Save to running game"
                  : "Save changes"}
            </button>
          </div>
        </div>
      </footer>
    </Dialog>
  );
}
