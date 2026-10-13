import PresetPreview from "./PresetPreview.jsx";

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
  const known = appearance?.items?.[kind] || {};
  const choices = new Map();
  const values =
    kind === "stickers"
      ? presets.flatMap((p) => p.data.stickersData.map((s) => s[field]))
      : presets.map((p) => p.data[field]);
  [data[field], ...values].forEach((id) => {
    if (!choices.has(id))
      choices.set(
        id,
        known[id] || {
          name:
            id === -1
              ? "No sticker"
              : `Saved ${label.toLowerCase()} choice ${choices.size + 1}`,
        },
      );
  });
  Object.entries(known).forEach(([id, entry]) => {
    if (field.endsWith("_Modded") || entry.source === "official")
      choices.set(Number(id), entry);
  });
  const info = choices.get(data[field]);
  const example = presets.find((p) =>
    kind === "stickers"
      ? p.data.stickersData.some((s) => s[field] === data[field])
      : p.data[field] === data[field],
  );
  const view = field.endsWith("_Modded") ? "modded" : "original";
  const source = info?.image || appearance?.previews?.[example?.id]?.[view];
  return (
    <div className="appearance-choice">
      <PresetPreview
        source={source}
        loadImage={loadImage}
        alt={
          info?.image
            ? info.label || info.name
            : `Saved setup using this ${label.toLowerCase()}`
        }
      />
      <label>
        {label}
        <select
          aria-label={label}
          value={data[field]}
          onChange={(e) => onChange(Number(e.target.value))}
        >
          {[...choices]
            .sort((a, b) =>
              (a[1].label || a[1].name).localeCompare(b[1].label || b[1].name),
            )
            .map(([id, entry]) => (
              <option key={id} value={id}>
                {entry.label || entry.name}
              </option>
            ))}
        </select>
        <small className="hint">
          {info?.image
            ? "Exact appearance variant"
            : source
              ? "Example from a saved setup"
              : "Preview unavailable for this selection"}
        </small>
      </label>
    </div>
  );
}
