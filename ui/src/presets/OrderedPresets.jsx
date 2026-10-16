import { useEffect, useRef } from "react";
import Sortable from "sortablejs";
import {
  DragHandleDots2Icon,
  ChevronUpIcon,
  ChevronDownIcon,
  MinusCircledIcon,
} from "@radix-ui/react-icons";
import { reorder } from "../components/EditGroup.jsx";
import PresetPreview from "./PresetPreview.jsx";
import { setupTitle, setupDescription } from "./appearance.js";

export default function OrderedPresets({
  items,
  onChange,
  disabled = false,
  onOpen,
  onRemove,
  appearance,
  loadImage,
  selectedIds,
  onSelect,
  layout = "list",
  positions,
  offset = 0,
}) {
  const list = useRef();
  const sortable = useRef();
  const latest = useRef();
  latest.current = { items, onChange };
  useEffect(() => {
    const instance = new Sortable(list.current, {
      handle: ".preset-grip",
      draggable: "li",
      dataIdAttr: "data-id",
      animation: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 180,
      easing: "cubic-bezier(0.23, 1, 0.32, 1)",
      ghostClass: "sort-placeholder",
      chosenClass: "sort-chosen",
      dragClass: "sort-drag",
      scroll: true,
      bubbleScroll: true,
      scrollSensitivity: 80,
      scrollSpeed: 14,
      onEnd: ({ oldIndex, newIndex }) => {
        const { items, onChange } = latest.current;
        const ids = items.map((p) => p.id);
        instance.sort(ids.map(String), false);
        onChange(reorder(ids, oldIndex, newIndex));
      },
    });
    sortable.current = instance;
    return () => instance.destroy();
  }, []);
  useEffect(() => {
    sortable.current?.option("disabled", disabled);
  }, [disabled]);
  return (
    <ol
      ref={list}
      className={`preset-order ${layout === "gallery" ? "preset-gallery" : ""}`}
      aria-label="Preset order"
    >
      {items.map((p, index) => {
        const position = positions?.[p.id] ?? index;
        const title = setupTitle(p, appearance, position);
        const stale = appearance?.stalePreviews?.includes(p.id);
        const character =
          appearance?.items?.characters?.[
            p.data.iCharacterSkinMaterialID_Modded
          ];
        return (
          <li key={p.id} data-id={p.id}>
            <div className="preset-row-tools">
              <button
                className="icon-button preset-grip"
                disabled={disabled}
                aria-label={`Drag ${title} to reorder`}
              >
                <DragHandleDots2Icon />
              </button>
              <span className="ordinal">
                {String(offset + index + 1).padStart(2, "0")}
              </span>
              {onSelect && (
                <input
                  type="checkbox"
                  aria-label={`Select ${title}`}
                  checked={selectedIds.includes(p.id)}
                  onChange={() => onSelect(p.id)}
                />
              )}
            </div>
            <button
              className="preset-row-label"
              onClick={() => onOpen?.(p)}
              disabled={!onOpen}
            >
              <PresetPreview
                source={
                  stale
                    ? character?.image
                    : appearance?.previews?.[p.id]?.modded
                }
                loadImage={loadImage}
                alt={
                  stale
                    ? `${title}, current character`
                    : `${title}, saved modded preview`
                }
              />
              <span className="preset-copy">
                <strong>{title}</strong>
                <small>{setupDescription(p, appearance)}</small>
                {stale && (
                  <small className="hint">
                    Selections updated · game render pending
                  </small>
                )}
              </span>
            </button>
            <div className="preset-move-actions">
              {onRemove && (
                <button
                  className="icon-button"
                  disabled={disabled}
                  aria-label={`Remove ${title} from group`}
                  title="Remove from group, keep in library"
                  onClick={() => onRemove(p.id)}
                >
                  <MinusCircledIcon />
                </button>
              )}
              <button
                className="icon-button"
                disabled={disabled || index === 0}
                aria-label={`Move ${title} up`}
                onClick={() =>
                  onChange(
                    reorder(
                      items.map((p) => p.id),
                      index,
                      index - 1,
                    ),
                  )
                }
              >
                <ChevronUpIcon />
              </button>
              <button
                className="icon-button"
                disabled={disabled || index === items.length - 1}
                aria-label={`Move ${title} down`}
                onClick={() =>
                  onChange(
                    reorder(
                      items.map((p) => p.id),
                      index,
                      index + 1,
                    ),
                  )
                }
              >
                <ChevronDownIcon />
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
