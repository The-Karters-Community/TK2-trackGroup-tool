import { useEffect, useState } from "react";
import { StarIcon, StarFilledIcon } from "@radix-ui/react-icons";
import RowPage from "../components/RowPage.jsx";
import PresetPreview from "./PresetPreview.jsx";
import { sortEntries, sortOptions } from "./libraryState.js";

export default function AppearanceChoice({
  label,
  kind,
  field,
  data,
  presets,
  appearance,
  loadImage,
  onChange,
  library,
}) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState(0);
  const [sort, setSort] = useState("alphabetical"),
    [favoritesOnly, setFavoritesOnly] = useState(false);
  const known = appearance?.items?.[kind] || {};
  const choices = new Map();
  const values =
    kind === "stickers"
      ? [
          -1,
          ...presets.flatMap((p) => p.data.stickersData.map((s) => s[field])),
        ]
      : presets.map((p) => p.data[field]);
  [data[field], ...values].forEach((id) =>
    choices.set(
      id,
      known[id] || {
        name:
          id === -1 ? "No sticker" : `Unavailable saved ${label.toLowerCase()}`,
        available: id === -1,
      },
    ),
  );
  Object.entries(known).forEach(([id, entry]) => {
    if (field.endsWith("_Modded") || entry.source === "official")
      choices.set(Number(id), entry);
  });
  const entries = [...choices].map(([id, e]) => {
    const parts = (e.label || e.name).split(" · ");
    return {
      ...e,
      id,
      entity: e.entity || e.name,
      skin: e.skin || parts[1] || "Default",
      variant: e.variant || parts[2] || "Default",
    };
  });
  const selected = entries.find((e) => e.id === data[field]);
  const view = field.endsWith("_Modded") ? "modded" : "original";
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
  const recordKey = (entry, exact) =>
    `appearance:${kind}:${exact ? entry.id : entry.entity}`;
  const skinKey = (entry) =>
    `appearance:${kind}:skin:${entry.entity}:${entry.skin}`;
  const observed = entries
    .map((e) => [recordKey(e, true), recordKey(e, false), skinKey(e)])
    .flat()
    .join("\n");
  useEffect(() => {
    library?.observe(observed.split("\n"));
  }, [observed]);
  const exact = Boolean(query) || stage === levels.length - 1;
  const key = levels[stage]?.[1] || "id";
  let items = entries.filter((e) =>
    query
      ? (e.label || e.name).toLowerCase().includes(query.toLowerCase())
      : stage === 0 ||
        (e.entity === selected?.entity &&
          (stage < 2 || e.skin === selected?.skin)),
  );
  if (!query) {
    const unique = new Map();
    items.forEach((e) => {
      const identity = exact ? e.id : e[key];
      if (!unique.has(identity) || e.id === selected?.id)
        unique.set(identity, e);
    });
    items = [...unique.values()];
  }
  const keyFor = (entry) =>
    !exact && stage === 1 ? skinKey(entry) : recordKey(entry, exact);
  if (favoritesOnly) items = items.filter((e) => library?.favorite(keyFor(e)));
  items = sortEntries(items, sort, {
    key: keyFor,
    name: (e) => (exact ? e.label || e.name : String(e[key])),
    added: (e) => e.addedAt,
    ...library?.data,
  });
  function source(entry) {
    if (entry.image) return entry.image;
    const example = presets.find((p) =>
      kind === "stickers"
        ? p.data.stickersData.some((s) => s[field] === entry.id)
        : p.data[field] === entry.id,
    );
    return appearance?.previews?.[example?.id]?.[view];
  }
  return (
    <div className="appearance-picker">
      {selected?.available === false && !appearance?.loading && (
        <p className="notice">
          Saved {label.toLowerCase()} is unavailable. Choose an installed
          appearance, or rescan after installing its mod.
        </p>
      )}
      <div className="appearance-toolbar">
        <input
          type="search"
          aria-label={`Search ${label.toLowerCase()}`}
          placeholder={`Find ${label.toLowerCase()}…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label={`Sort ${label} appearances`}
          title="Recent and most picked reflect Garage choices. Added dates use installation or first discovery."
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          {sortOptions.map(([id, title]) => (
            <option key={id} value={id}>
              {title}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="icon-button"
          aria-label="Favorite appearances only"
          aria-pressed={favoritesOnly}
          title="Favorites only"
          onClick={() => setFavoritesOnly(!favoritesOnly)}
        >
          {favoritesOnly ? <StarFilledIcon /> : <StarIcon />}
        </button>
      </div>
      {!query && (
        <div
          className="appearance-steps"
          aria-label={`${label} selection steps`}
        >
          {levels.map(([title, k], index) => (
            <button
              type="button"
              key={k}
              aria-pressed={stage === index}
              aria-label={`${title}: ${selected?.[k] === selected?.id ? selected?.name : selected?.[k] || "None"}`}
              onClick={() => setStage(index)}
            >
              <span>{title}</span>
              <small>
                {selected?.[k] === selected?.id ? selected.name : selected?.[k]}
              </small>
            </button>
          ))}
        </div>
      )}
      <RowPage
        items={items}
        scope={`${kind}:${field}:${query}:${stage}:${sort}:${favoritesOnly}:${stage ? selected?.entity + selected?.skin : ""}`}
        label={`${label} appearances`}
      >
        {(visible) => (
          <div
            className="appearance-grid"
            role="group"
            aria-label={`${label} choices`}
          >
            {visible.map((entry) => {
              const active = exact
                ? entry.id === selected?.id
                : entry[key] === selected?.[key];
              const title = exact ? entry.label || entry.name : entry[key];
              const image = source(entry),
                favorite = library?.favorite(keyFor(entry));
              return (
                <div
                  key={entry.id}
                  className={`appearance-choice ${active ? "selected" : ""}`}
                >
                  <button
                    type="button"
                    className={`appearance-tile ${active ? "selected" : ""}`}
                    aria-pressed={active}
                    disabled={entry.available === false}
                    title={title}
                    onClick={() => {
                      library?.used(recordKey(entry, false));
                      library?.used(recordKey(entry, true));
                      onChange(entry.id);
                      setStage(Math.min(stage + 1, levels.length - 1));
                    }}
                  >
                    <PresetPreview
                      source={image}
                      loadImage={loadImage}
                      alt={entry.image ? title : `Saved setup using ${title}`}
                    />
                    <span>{title}</span>
                  </button>
                  {library && entry.available !== false && (
                    <button
                      type="button"
                      className="favorite-button icon-button"
                      aria-label={`${favorite ? "Unfavorite" : "Favorite"} ${title}`}
                      aria-pressed={Boolean(favorite)}
                      onClick={() => library.toggle(keyFor(entry))}
                    >
                      {favorite ? <StarFilledIcon /> : <StarIcon />}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </RowPage>
      {appearance?.loading && (
        <p role="status" className="hint">
          Reading installed appearances…
        </p>
      )}
    </div>
  );
}
