import { useState } from "react";
import PresetPreview from "./PresetPreview.jsx";

// Each thumbnail represents a real material configuration, never a Workshop cover.
export default function AppearanceChoice({
  label,
  kind,
  field,
  data,
  presets,
  appearance,
  loadImage,
  onChange,
}) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState(0);
  const [limit, setLimit] = useState(60);
  const known = appearance?.items?.[kind] || {};
  const choices = new Map();
  const values =
    kind === "stickers"
      ? [
          -1,
          ...presets.flatMap((p) => p.data.stickersData.map((s) => s[field])),
        ]
      : presets.map((p) => p.data[field]);
  [data[field], ...values].forEach((id) => {
    if (!choices.has(id))
      choices.set(
        id,
        known[id] || {
          name:
            id === -1
              ? "No sticker"
              : `Saved ${label.toLowerCase()} ${choices.size + 1}`,
        },
      );
  });
  Object.entries(known).forEach(([id, entry]) => {
    if (field.endsWith("_Modded") || entry.source === "official")
      choices.set(Number(id), entry);
  });
  const entries = [...choices]
    .map(([id, e]) => {
      const parts = (e.label || e.name).split(" · ");
      return {
        ...e,
        id,
        entity: e.entity || e.name,
        skin: e.skin || parts[1] || "Default",
        variant: e.variant || parts[2] || "Default",
      };
    })
    .sort((a, b) =>
      (a.label || a.name).localeCompare(b.label || b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
  const selected = entries.find((e) => e.id === data[field]);
  const view = field.endsWith("_Modded") ? "modded" : "original";
  function source(entry) {
    if (entry.image) return entry.image;
    const example = presets.find((p) =>
      kind === "stickers"
        ? p.data.stickersData.some((s) => s[field] === entry.id)
        : p.data[field] === entry.id,
    );
    return appearance?.previews?.[example?.id]?.[view];
  }
  const levels =
    kind === "characters"
      ? [
          ["Character", "entity"],
          ["Skin", "skin"],
          ["Variant", "variant"],
        ]
      : kind === "stickers"
        ? [[label, "id"]]
        : [
            [label, "entity"],
            ["Skin", "skin"],
          ];
  return (
    <div className="appearance-picker">
      <input
        type="search"
        aria-label={`Search ${label.toLowerCase()}`}
        placeholder={`Find ${label.toLowerCase()}…`}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setLimit(60);
        }}
      />
      {query ? (
        <section aria-label={`${label} search results`}>
          <p className="hint">
            Select an appearance to apply it to this draft.
          </p>
          {grid(
            entries.filter((e) =>
              `${e.label || e.name}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            ),
            true,
          )}
        </section>
      ) : (
        levels.map(([title, key], level) => {
          const candidates = entries.filter(
            (e) =>
              level === 0 ||
              (e.entity === selected?.entity &&
                (level < 2 || e.skin === selected?.skin)),
          );
          const unique = new Map();
          candidates.forEach((e) => {
            const k = level === levels.length - 1 ? e.id : e[key];
            if (!unique.has(k) || e.id === selected?.id) unique.set(k, e);
          });
          return (
            <details
              key={key}
              open={stage === level}
              className="appearance-section"
            >
              <summary
                onClick={(e) => {
                  e.preventDefault();
                  setStage(stage === level ? -1 : level);
                }}
              >
                {title}
                <span>
                  {selected?.[key] === selected?.id
                    ? selected?.name
                    : selected?.[key]}
                </span>
              </summary>
              {grid(
                [...unique.values()],
                level === levels.length - 1,
                key,
                Math.min(level + 1, levels.length - 1),
              )}
            </details>
          );
        })
      )}
      {appearance?.loading && (
        <p role="status" className="hint">
          Reading installed appearances…
        </p>
      )}
    </div>
  );
  function grid(items, exact, key = "id", nextStage = stage) {
    return (
      <>
        <div
          className="appearance-grid"
          role="group"
          aria-label={`${label} choices`}
        >
          {items.slice(0, limit).map((entry) => {
            const active = exact
              ? entry.id === selected?.id
              : entry[key] === selected?.[key];
            const title = exact ? entry.label || entry.name : entry[key];
            const image = source(entry);
            return (
              <button
                key={entry.id}
                type="button"
                className={`appearance-tile ${active ? "selected" : ""}`}
                aria-pressed={active}
                title={title}
                onClick={() => {
                  onChange(entry.id);
                  setStage(nextStage);
                }}
              >
                <PresetPreview
                  source={image}
                  loadImage={loadImage}
                  alt={entry.image ? title : `Saved setup using ${title}`}
                />
                <span>{title}</span>
                {!entry.image && image && <small>Saved setup example</small>}
                {!image && (
                  <small>
                    {entry.id === -1 ? "Empty slot" : "No cached image"}
                  </small>
                )}
              </button>
            );
          })}
        </div>
        {items.length > limit && (
          <button onClick={() => setLimit(limit + 60)}>
            Show more ({items.length - limit})
          </button>
        )}
        {!items.length && <p className="empty-state">No appearances match.</p>}
      </>
    );
  }
}
