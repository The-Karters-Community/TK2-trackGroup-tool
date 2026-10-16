import { useRef, useState } from "react";

const EMPTY = { favorites: [], activity: {} };
const STORAGE = "bobbys-garage-library-v1";
function normalize(value) {
  if (
    !Array.isArray(value?.favorites) ||
    !value?.activity ||
    typeof value.activity !== "object" ||
    Array.isArray(value.activity)
  )
    return EMPTY;
  return {
    favorites: value.favorites
      .filter((k) => typeof k === "string" && k.length <= 300)
      .slice(-5000),
    activity: Object.fromEntries(
      Object.entries(value.activity)
        .filter(
          ([k, v]) =>
            k.length <= 300 &&
            v &&
            [v.added, v.last, v.count].every(
              (n) =>
                n === undefined ||
                (typeof n === "number" &&
                  Number.isFinite(n) &&
                  n >= 0 &&
                  n <= 1e15),
            ),
        )
        .slice(-20000),
    ),
  };
}
export function sortEntries(
  items,
  sort,
  { key, name, added = () => 0, activity = {}, favorites = [] },
) {
  const compare = (a, b) =>
    name(a).localeCompare(name(b), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  if (sort === "custom") return items;
  return [...items].sort((a, b) => {
    const x = activity[key(a)] || {},
      y = activity[key(b)] || {};
    if (sort === "newest")
      return (
        (added(b) || y.added || 0) - (added(a) || x.added || 0) || compare(a, b)
      );
    if (sort === "oldest")
      return (
        (added(a) || x.added || 0) - (added(b) || y.added || 0) || compare(a, b)
      );
    if (sort === "recent")
      return (y.last || 0) - (x.last || 0) || compare(a, b);
    if (sort === "popular")
      return (y.count || 0) - (x.count || 0) || compare(a, b);
    if (sort === "favorites")
      return (
        Number(favorites.includes(key(b))) -
          Number(favorites.includes(key(a))) || compare(a, b)
      );
    return compare(a, b);
  });
}

export function useLibraryState(initial, onSave, onError) {
  const [data, setData] = useState(() => {
    if (onSave) return normalize(initial);
    try {
      return normalize(JSON.parse(localStorage.getItem(STORAGE)));
    } catch {
      return EMPTY;
    }
  });
  const current = useRef(data),
    queue = useRef(Promise.resolve());
  current.current = data;
  function persist(next) {
    current.current = next;
    setData(next);
    if (onSave)
      queue.current = queue.current
        .then(() => onSave(next))
        .catch((err) => onError?.(err.message));
    else {
      try {
        localStorage.setItem(STORAGE, JSON.stringify(next));
      } catch {
        onError?.("Could not remember library preferences on this device.");
      }
    }
  }
  return {
    data,
    favorite: (key) => (data.favorites || []).includes(key),
    toggle(key) {
      const next = current.current,
        favorites = next.favorites || [];
      persist({
        ...next,
        favorites: favorites.includes(key)
          ? favorites.filter((v) => v !== key)
          : [...favorites, key].slice(-5000),
      });
    },
    observe(keys) {
      const next = current.current,
        activity = { ...next.activity };
      let changed = false;
      for (const key of keys)
        if (!activity[key]) {
          activity[key] = { added: Date.now(), last: 0, count: 0 };
          changed = true;
        }
      if (changed)
        persist({
          ...next,
          activity: Object.fromEntries(Object.entries(activity).slice(-20000)),
        });
    },
    used(keys) {
      const next = current.current,
        activity = { ...next.activity };
      for (const key of new Set(Array.isArray(keys) ? keys : [keys])) {
        const old = activity[key] || { added: Date.now(), count: 0 };
        activity[key] = {
          ...old,
          last: Date.now(),
          count: (old.count || 0) + 1,
        };
      }
      persist({
        ...next,
        activity: Object.fromEntries(Object.entries(activity).slice(-20000)),
      });
    },
  };
}

export const sortOptions = [
  ["alphabetical", "Alphabetical"],
  ["newest", "Newest added"],
  ["oldest", "Oldest added"],
  ["recent", "Recently picked"],
  ["popular", "Most picked"],
  ["favorites", "Favorites first"],
];
