import { useEffect, useRef, useState } from "react";
import {
  ArrowUpIcon,
  ArrowDownIcon,
  DragHandleDots2Icon,
  CheckIcon,
  ResetIcon,
  Pencil1Icon,
  ExternalLinkIcon,
} from "@radix-ui/react-icons";
import { trackName, trackState } from "./TrackList.jsx";
import TrackPreview from "./TrackPreview.jsx";
import Sortable from "sortablejs";

export function reorder(order, from, to) {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= order.length ||
    to >= order.length
  )
    return order;
  const next = [...order];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export default function EditGroup({
  group,
  busy,
  connected,
  onSave,
  editJob,
  statuses = {},
  onDirty,
  browser = false,
}) {
  const [baseline, setBaseline] = useState(group);
  const [name, setName] = useState(group.name);
  const [order, setOrder] = useState(group.tracks.map((_, i) => i));
  const list = useRef();
  const sortable = useRef();
  const dragActive = useRef(false);
  const latestOrder = useRef(order);
  latestOrder.current = order;
  const [submitted, setSubmitted] = useState(false);
  const dirty = name !== baseline.name || order.some((n, i) => n !== i);
  function reset(value) {
    setBaseline(value);
    setName(value.name);
    setOrder(value.tracks.map((_, i) => i));
  }
  useEffect(() => {
    onDirty?.(dirty);
  }, [dirty, onDirty]);
  useEffect(() => {
    if (!dirty && !dragActive.current && baseline !== group) reset(group);
    if (submitted && !busy) {
      if (editJob?.state === "completed") reset(group);
      setSubmitted(false);
    }
  }, [group, busy, dirty, submitted, editJob, baseline.expectedHash]);
  useEffect(() => {
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const instance = new Sortable(list.current, {
      handle: ".drag-handle",
      draggable: "li",
      dataIdAttr: "data-track-index",
      animation: reducedMotion ? 0 : 180,
      easing: "cubic-bezier(0.23, 1, 0.32, 1)",
      ghostClass: "sort-placeholder",
      chosenClass: "sort-chosen",
      dragClass: "sort-drag",
      onStart: () => {
        dragActive.current = true;
      },
      onEnd: ({ oldIndex, newIndex }) => {
        // Restore React's DOM order before committing the new state permutation.
        instance.sort(latestOrder.current.map(String), false);
        setOrder((previous) => reorder(previous, oldIndex, newIndex));
        dragActive.current = false;
      },
    });
    sortable.current = instance;
    return () => instance.destroy();
  }, []);
  useEffect(() => {
    sortable.current?.option("disabled", busy || !connected);
  }, [busy, connected]);
  function move(from, to) {
    setOrder((previous) => reorder(previous, from, to));
  }
  return (
    <form
      className="inline-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!dirty || busy || !connected) return;
        if (
          await onSave({
            id: group.id,
            name,
            order,
            expectedHash: baseline.expectedHash,
          })
        )
          setSubmitted(true);
      }}
    >
      <label>
        <span className="label-with-icon">
          <Pencil1Icon /> Group name
        </span>
        <input
          required
          maxLength={200}
          value={name}
          disabled={busy || !connected}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <p className="hint">
        Drag the grip to reorder tracks, or use the arrows.{" "}
        {browser
          ? "Changes stay in this tab until you download the edited save."
          : "Changes are backed up before saving."}
      </p>
      <div className="edit-actions-slot">
        <div
          className={`edit-actions ${dirty ? "visible" : ""}`}
          role="group"
          aria-label="Unsaved changes"
          aria-hidden={!dirty}
          inert={!dirty}
        >
          <span className="hint">Unsaved changes</span>
          <button type="button" disabled={busy} onClick={() => reset(group)}>
            <ResetIcon /> Discard
          </button>
          <button
            type="submit"
            className="primary"
            disabled={busy || !connected || !name.trim()}
          >
            <CheckIcon /> Save changes
          </button>
        </div>
      </div>
      <ol
        ref={list}
        className="edit-tracks"
        aria-label="Tracks in racing order"
      >
        {order.map((original, position) => {
          const track = baseline.tracks[original];
          const title = trackName(track);
          return (
            <li key={original} data-track-index={original}>
              <button
                type="button"
                className="icon-button drag-handle"
                aria-label={`Drag ${title} to reorder`}
                disabled={busy || !connected}
              >
                <DragHandleDots2Icon />
              </button>
              <span className="ordinal">
                {String(position + 1).padStart(2, "0")}
              </span>
              <TrackPreview
                track={track}
                image={baseline.previewImages?.[original]}
              />
              <span className="track-copy">
                <strong>{title}</strong>
                <small>
                  {trackState(track, statuses[track.workshopId], { browser })}
                </small>
                {track.workshopId && (
                  <a
                    className="track-link"
                    aria-label={`View ${title} in Steam`}
                    href={`https://steamcommunity.com/sharedfiles/filedetails/?id=${track.workshopId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLinkIcon /> Steam
                  </a>
                )}
              </span>
              <div className="track-move-buttons">
                <button
                  type="button"
                  className="icon-button"
                  disabled={busy || !connected || position === 0}
                  aria-label={`Move ${title} up`}
                  onClick={() => move(position, position - 1)}
                >
                  <ArrowUpIcon />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  disabled={busy || !connected || position === order.length - 1}
                  aria-label={`Move ${title} down`}
                  onClick={() => move(position, position + 1)}
                >
                  <ArrowDownIcon />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </form>
  );
}
