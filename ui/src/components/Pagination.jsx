import { useState } from "react";

export function usePagination(items, scope, initialSize = 24) {
  const [position, setPosition] = useState({
    scope,
    page: 1,
    size: initialSize,
  });
  const size = position.size;
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(position.scope === scope ? position.page : 1, pages);
  const start = (page - 1) * size;
  return {
    items: items.slice(start, start + size),
    start,
    page,
    size,
    pages,
    total: items.length,
    setPage: (page) => setPosition({ scope, page, size }),
    setSize: (size) => setPosition({ scope, page: 1, size }),
  };
}

export default function Pagination({ paging, label = "items" }) {
  const { page, pages, size, total, start, setPage, setSize } = paging;
  return (
    <nav className="pagination" aria-label={`${label} pages`}>
      <span className="hint" aria-live="polite">
        {total
          ? `${start + 1}–${Math.min(start + size, total)} of ${total}`
          : "0 results"}
      </span>
      <label>
        Per page
        <select
          aria-label={`${label} per page`}
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
        >
          {[12, 24, 48, 96].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <div className="page-controls">
        <button
          type="button"
          aria-label={`Previous ${label} page`}
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </button>
        <label>
          Page
          <select
            aria-label={`${label} page`}
            value={page}
            onChange={(e) => setPage(Number(e.target.value))}
          >
            {Array.from({ length: pages }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
          <span>of {pages}</span>
        </label>
        <button
          type="button"
          aria-label={`Next ${label} page`}
          disabled={page === pages}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  );
}

export function PagedCollection({ items, scope, label, children }) {
  const paging = usePagination(items, scope);
  return (
    <>
      <Pagination paging={paging} label={label} />
      {children(paging.items)}
    </>
  );
}
