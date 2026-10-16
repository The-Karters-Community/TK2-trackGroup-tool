import { useEffect, useRef, useCallback } from "react";
import Sortable from "sortablejs";
import { reorder } from "./EditGroup.jsx";
// Same grip, easing and DOM restoration as ordered presets. No writes until Save.
export default function SortableGroups({
  items,
  disabled,
  onChange,
  children,
  hostRef,
  ...props
}) {
  const node = useRef(),
    instance = useRef(),
    latest = useRef();
  latest.current = { items, onChange };
  useEffect(() => {
    const sort = new Sortable(node.current, {
      handle: ".group-grip",
      draggable: "article",
      dataIdAttr: "data-id",
      animation: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 180,
      easing: "cubic-bezier(0.23,1,0.32,1)",
      ghostClass: "sort-placeholder",
      chosenClass: "sort-chosen",
      scroll: true,
      bubbleScroll: true,
      onEnd: ({ oldIndex, newIndex }) => {
        const { items, onChange } = latest.current;
        const ids = items.map((g) => g.id);
        sort.sort(ids.map(String), false);
        onChange(reorder(ids, oldIndex, newIndex));
      },
    });
    instance.current = sort;
    return () => sort.destroy();
  }, []);
  useEffect(() => {
    instance.current?.option("disabled", disabled);
  }, [disabled]);
  const setNode = useCallback(
    (element) => {
      node.current = element;
      hostRef?.(element);
    },
    [hostRef],
  );
  return (
    <div {...props} ref={setNode}>
      {children}
    </div>
  );
}
