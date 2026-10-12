import { useState } from "react";

export default function GroupEditor({ group, busy, onCancel, onSubmit }) {
  const [name, setName] = useState(group?.name || "");
  const [items, setItems] = useState("");
  const rename = Boolean(group);
  return (
    <section className="workflow-page">
      <header className="page-heading">
        <span className="eyebrow">My groups</span>
        <h1>{rename ? "Rename group" : "Create a track group"}</h1>
        <p>
          {rename
            ? "Only the name changes. Track order and your position in the game's group list stay the same."
            : "Paste Workshop item IDs or links in racing order. Steam supplies the track names before you review and save."}
        </p>
      </header>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(
            rename ? "rename" : "create",
            rename ? { id: group.id, name } : { name, items },
          );
        }}
      >
        <label>
          Group name
          <input
            autoFocus
            required
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
        </label>
        {!rename && (
          <label>
            Workshop item IDs or links
            <textarea
              aria-label="Workshop item IDs or links"
              aria-describedby="workshop-items-help"
              required
              rows={8}
              value={items}
              onChange={(e) => setItems(e.target.value)}
              disabled={busy}
              placeholder={
                "3263970719\n3279611598\nOr paste Steam Workshop links"
              }
            />
            <span className="hint" id="workshop-items-help">
              One per line, or separate IDs with spaces or commas. Duplicate
              tracks are rejected.
            </span>
          </label>
        )}
        <div className="workflow-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={busy || !name.trim() || (!rename && !items.trim())}
          >
            {busy
              ? rename
                ? "Preparing review…"
                : "Checking tracks…"
              : "Review changes"}
          </button>
        </div>
      </form>
    </section>
  );
}
