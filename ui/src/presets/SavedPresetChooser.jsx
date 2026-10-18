import { useMemo, useState } from "react";
import { Cross2Icon } from "@radix-ui/react-icons";
import Dialog from "../components/Dialog.jsx";
import RowPage from "../components/RowPage.jsx";
import PresetPreview from "./PresetPreview.jsx";
import { setupTitle, setupDescription, setupMatches } from "./appearance.js";
import "./SavedPresetChooser.css";

export default function SavedPresetChooser({
  presets = [],
  appearance,
  loadImage,
  busy = false,
  onClose,
  onChoose,
}) {
  const [query, setQuery] = useState("");
  const entries = useMemo(
    () =>
      presets
        .map((preset, index) => ({ preset, index }))
        .filter(({ preset, index }) =>
          setupMatches(preset, appearance, index, query),
        ),
    [presets, appearance, query],
  );
  return (
    <Dialog
      className="saved-preset-chooser"
      aria-labelledby="saved-preset-chooser-title"
      onClose={onClose}
      dismissDisabled={busy}
    >
      <header className="saved-preset-chooser-heading">
        <div>
          <h2 id="saved-preset-chooser-title">Choose saved preset</h2>
          <p>Use it as a starting point. Apply when you’re ready.</p>
        </div>
        <button
          className="icon-button"
          aria-label="Close saved presets"
          disabled={busy}
          onClick={onClose}
        >
          <Cross2Icon />
        </button>
      </header>
      <div className="saved-preset-chooser-body">
        <input
          autoFocus
          type="search"
          aria-label="Find saved preset"
          placeholder="Find a character, vehicle or setup…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <RowPage
          items={entries}
          scope={`saved-preset-chooser:${query}`}
          label="Saved presets"
          minWidth={144}
          gap={8}
        >
          {(shown) => (
            <div className="saved-preset-choice-grid" data-navigation-grid>
              {shown.map(({ preset, index }) => {
                const title = setupTitle(preset, appearance, index);
                const view =
                  preset.data.bUsingModdedVersion === false
                    ? "original"
                    : "modded";
                return (
                  <button
                    key={preset.id}
                    disabled={busy}
                    aria-label={`Use ${title}`}
                    onClick={() => onChoose(preset)}
                  >
                    <PresetPreview
                      source={appearance?.previews?.[preset.id]?.[view]}
                      revision={appearance?.previewRevision}
                      loadImage={loadImage}
                      alt=""
                    />
                    <strong>{title}</strong>
                    <small>{setupDescription(preset, appearance, view)}</small>
                  </button>
                );
              })}
            </div>
          )}
        </RowPage>
        {!entries.length && (
          <p className="hint">No saved presets match your search.</p>
        )}
      </div>
    </Dialog>
  );
}
