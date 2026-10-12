import { useState } from "react";
import { ArrowUpIcon, ArrowDownIcon } from "@radix-ui/react-icons";
import { trackName } from "./TrackList.jsx";

export default function EditGroup({ group, busy, onSave, onCancel }) {
  const [name, setName] = useState(group.name);
  const [order, setOrder] = useState(group.tracks.map((_, i) => i));
  const [expectedHash] = useState(group.expectedHash);
  function move(position, delta) {
    setOrder((previous) => {
      const next = [...previous];
      [next[position], next[position + delta]] = [
        next[position + delta],
        next[position],
      ];
      return next;
    });
  }
  return (
    <form
      className="inline-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ id: group.id, name, order, expectedHash });
      }}
    >
      <label>
        Group name
        <input
          autoFocus
          required
          maxLength={200}
          value={name}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <p className="hint">
        Move tracks into racing order, then save. Keep the game closed.
      </p>
      <ol className="edit-tracks">
        {order.map((original, position) => (
          <li key={original}>
            <span className="ordinal">{position + 1}</span>
            <strong>{trackName(group.tracks[original])}</strong>
            <button
              type="button"
              className="icon-button"
              disabled={busy || position === 0}
              aria-label={`Move ${trackName(group.tracks[original])} up`}
              onClick={() => move(position, -1)}
            >
              <ArrowUpIcon />
            </button>
            <button
              type="button"
              className="icon-button"
              disabled={busy || position === order.length - 1}
              aria-label={`Move ${trackName(group.tracks[original])} down`}
              onClick={() => move(position, 1)}
            >
              <ArrowDownIcon />
            </button>
          </li>
        ))}
      </ol>
      <div className="edit-actions">
        <button type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className="primary"
          disabled={
            busy || (name === group.name && order.every((n, i) => n === i))
          }
        >
          Save changes
        </button>
      </div>
    </form>
  );
}
