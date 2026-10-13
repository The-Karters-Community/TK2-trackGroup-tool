import { useEffect, useRef } from "react";
import Sortable from "sortablejs";
import {
  DragHandleDots2Icon,
  ChevronUpIcon,
  ChevronDownIcon,
} from "@radix-ui/react-icons";

export default function OrderedPresets({
  items,
  onChange,
  disabled = false,
  onOpen,
}) {
  const list = useRef();
  const update = useRef(onChange);
  update.current = onChange;
  useEffect(() => {
    const sortable = Sortable.create(list.current, {
      handle: ".preset-grip",
      animation: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 160,
      disabled,
      ghostClass: "sort-ghost",
      chosenClass: "sort-chosen",
      onEnd: () => {
        const ids = [...list.current.children].map((node) =>
          Number(node.dataset.id),
        );
        // Restore React's owned DOM before updating its ordered children.
        items.forEach((p) =>
          list.current.appendChild(
            [...list.current.children].find(
              (n) => Number(n.dataset.id) === p.id,
            ),
          ),
        );
        update.current(ids);
      },
    });
    return () => sortable.destroy();
  }, [items, disabled]);
  function move(index, step) {
    const ids = items.map((p) => p.id);
    [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
    onChange(ids);
  }
  return (
    <ol ref={list} className="preset-order" aria-label="Preset order">
      {items.map((p, index) => (
        <li key={p.id} data-id={p.id}>
          <button
            className="icon-button preset-grip"
            disabled={disabled}
            aria-label={`Drag preset ${p.id}`}
          >
            <DragHandleDots2Icon />
          </button>
          <span className="ordinal">{String(index + 1).padStart(2, "0")}</span>
          <button
            className="preset-row-label"
            onClick={() => onOpen?.(p)}
            disabled={!onOpen}
          >
            <strong>Preset #{p.id}</strong>
            <small>
              Character {p.data.iCharacterSkinMaterialID} ·{" "}
              {p.data.bUsingModdedVersion ? "Modded" : "Original"}
            </small>
          </button>
          <button
            className="icon-button"
            disabled={disabled || index === 0}
            aria-label={`Move preset ${p.id} up`}
            onClick={() => move(index, -1)}
          >
            <ChevronUpIcon />
          </button>
          <button
            className="icon-button"
            disabled={disabled || index === items.length - 1}
            aria-label={`Move preset ${p.id} down`}
            onClick={() => move(index, 1)}
          >
            <ChevronDownIcon />
          </button>
        </li>
      ))}
    </ol>
  );
}
