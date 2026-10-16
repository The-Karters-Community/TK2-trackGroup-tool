import PresetPreview from "./PresetPreview.jsx";

export default function LocalPlayers({
  players,
  selected,
  drafts,
  busy,
  onSelect,
  appearance,
  loadImage,
}) {
  return (
    <div
      className="local-players"
      role="group"
      aria-label="Local player setups"
      title="Saved local-player slots. Controller assignment is managed in the game. Drafts stay separate until saved or discarded."
    >
      {players.map((p) => (
        <button
          key={p.player}
          type="button"
          disabled={busy}
          aria-pressed={p.player === selected}
          aria-label={`Edit Player ${p.player + 1}${drafts?.includes(p.player) ? ", unsaved draft" : ""}`}
          onClick={() => onSelect(p.player)}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <path d="M7 7h10c3 0 5 11 2 11-2 0-3-3-4-3H9c-1 0-2 3-4 3C2 18 4 7 7 7Z" />
            <path d="M8 10v4m-2-2h4" />
            <circle cx="16" cy="11" r=".8" />
            <circle cx="18" cy="13" r=".8" />
          </svg>
          <span>P{p.player + 1}</span>
          {drafts?.includes(p.player) && <i aria-hidden="true" />}
          <PresetPreview
            source={appearance?.previews?.[p.id]?.modded}
            loadImage={loadImage}
            alt={`Player ${p.player + 1} saved setup`}
          />
        </button>
      ))}
    </div>
  );
}
