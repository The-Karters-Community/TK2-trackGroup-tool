import { useEffect, useLayoutEffect, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import "./RowPage.css";

const validRows = (value) =>
  value === "all" || (Number.isSafeInteger(Number(value)) && Number(value) > 0);
const rowPreferenceKey = (scope) => `bobbys-garage:rows:${scope}`;
function initialRows(scope) {
  try {
    const saved = localStorage.getItem(rowPreferenceKey(scope));
    if (saved !== null && validRows(saved))
      return saved === "all" ? saved : Number(saved);
  } catch {
    // Browsing still works when local storage is unavailable.
  }
  return window.innerHeight < 650
    ? 1
    : window.innerHeight < 760 || window.innerWidth < 900
      ? 2
      : 3;
}

export function rowSlice(total, columns, rows, requested = 1) {
  const size =
      rows === "all" ? Math.max(1, total) : Math.max(1, columns * rows),
    pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(pages, Math.max(1, requested)),
    start = (page - 1) * size;
  return { size, pages, page, start };
}

export function useRowPagination(
  items,
  scope,
  minWidth = 96,
  gap = 8,
  preferenceScope = scope,
) {
  const [host, setHost] = useState(null);
  const [columns, setColumns] = useState(4),
    [rows, setRows] = useState(() => initialRows(preferenceScope));
  const [position, setPosition] = useState({ scope, page: 1 });
  useLayoutEffect(() => {
    const measure = () => {
      const style = host && getComputedStyle(host);
      const width =
        (host?.getBoundingClientRect().width || 0) -
        (parseFloat(style?.paddingLeft) || 0) -
        (parseFloat(style?.paddingRight) || 0);
      if (width)
        setColumns(Math.max(1, Math.floor((width + gap) / (minWidth + gap))));
    };
    measure();
    if (!host || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [host, minWidth, gap]);
  const paging = rowSlice(
    items.length,
    columns,
    rows,
    position.scope === scope ? position.page : 1,
  );
  const go = (page) => setPosition({ scope, page });
  useEffect(() => {
    if (position.scope === scope && position.page !== paging.page)
      setPosition({ scope, page: paging.page });
  }, [scope, position.scope, position.page, paging.page]);
  return {
    ...paging,
    total: items.length,
    columns,
    rows,
    host: setHost,
    items: items.slice(paging.start, paging.start + paging.size),
    setPage: go,
    setRows: (value) => {
      if (!validRows(value)) return;
      const next = value === "all" ? value : Number(value);
      setRows(next);
      try {
        localStorage.setItem(rowPreferenceKey(preferenceScope), String(next));
      } catch {
        // This preference is optional; pagination does not depend on storage.
      }
      go(1);
    },
  };
}

export function RowControls({ paging, label }) {
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState(String(paging.rows));
  const isCustom = custom || (paging.rows !== "all" && paging.rows > 4);
  useEffect(() => {
    if (paging.rows !== "all") setDraft(String(paging.rows));
  }, [paging.rows]);
  return (
    <nav className="row-pagination" aria-label={`${label} pages`}>
      <span className="hint" aria-live="polite">
        {paging.total
          ? `${paging.start + 1}–${Math.min(paging.start + paging.size, paging.total)} of ${paging.total}`
          : "No matches"}
      </span>
      <select
        aria-label={`${label} rows`}
        value={
          paging.rows === "all" ? "all" : isCustom ? "custom" : paging.rows
        }
        onChange={(e) => {
          const value = e.target.value;
          setCustom(value === "custom");
          if (value === "custom") {
            const next = paging.rows === "all" ? 6 : paging.rows;
            setDraft(String(next));
            paging.setRows(next);
          } else paging.setRows(value === "all" ? value : Number(value));
        }}
      >
        {[1, 2, 3, 4].map((n) => (
          <option key={n} value={n}>
            {n} {n === 1 ? "row" : "rows"}
          </option>
        ))}
        <option value="custom">Custom rows…</option>
        <option value="all">Show all</option>
      </select>
      {isCustom && paging.rows !== "all" && (
        <input
          className="row-custom-input"
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          aria-label={`${label} custom rows`}
          aria-invalid={!validRows(draft)}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (validRows(e.target.value))
              paging.setRows(Number(e.target.value));
          }}
          onBlur={() => setDraft(String(paging.rows))}
        />
      )}
      {paging.rows !== "all" && (
        <div className="row-page-controls">
          <button
            type="button"
            className="icon-button"
            aria-label={`Previous ${label} page`}
            disabled={paging.page === 1}
            onClick={() => paging.setPage(paging.page - 1)}
          >
            <ChevronLeftIcon />
          </button>
          <select
            aria-label={`${label} page`}
            value={paging.page}
            onChange={(e) => paging.setPage(Number(e.target.value))}
          >
            {Array.from({ length: paging.pages }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1} / {paging.pages}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="icon-button"
            aria-label={`Next ${label} page`}
            disabled={paging.page === paging.pages}
            onClick={() => paging.setPage(paging.page + 1)}
          >
            <ChevronRightIcon />
          </button>
        </div>
      )}
    </nav>
  );
}

export default function RowPage({
  items,
  scope,
  label,
  children,
  minWidth = 96,
  gap = 8,
}) {
  const paging = useRowPagination(items, scope, minWidth, gap, label);
  return (
    <div
      ref={paging.host}
      className="row-page"
      style={{ "--collection-columns": paging.columns }}
    >
      <RowControls paging={paging} label={label} />
      {children(paging.items, paging)}
      {paging.page === paging.pages && items.length > paging.size && (
        <span className="collection-end">End of {label.toLowerCase()}</span>
      )}
    </div>
  );
}
