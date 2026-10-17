import { FilePlusIcon, GridIcon, ListBulletIcon } from "@radix-ui/react-icons";
import GroupList from "../components/GroupList.jsx";
import { assetUrl } from "../assets.js";
import { useState } from "react";
import Pagination, { usePagination } from "../components/Pagination.jsx";
import { RowControls, useRowPagination } from "../components/RowPage.jsx";

export default function Library({
  local,
  category,
  onCategory,
  query,
  onQuery,
  gallery,
  onGallery,
  groups,
  allGroups = groups,
  selected,
  onSelect,
  onGroupFile,
  hasProfile,
  onOpenSave,
  onExportMany,
}) {
  const [checked, setChecked] = useState([]);
  const listPaging = usePagination(groups, `${local}:${category}:${query}`);
  const gridPaging = useRowPagination(
    groups,
    `${local}:${category}:${query}`,
    250,
    16,
    local ? "web-my-track-groups" : "web-discover-track-groups",
  );
  const paging = gallery ? gridPaging : listPaging;
  return (
    <section
      className="library-main"
      ref={gridPaging.host}
      style={{ "--collection-columns": gridPaging.columns }}
    >
      <div className="library-heading">
        {local && <h1>My track groups</h1>}
        {!local && (
          <div className="category-tabs" aria-label="Group category">
            {["speedrun", "community"].map((id) => (
              <button
                key={id}
                className={category === id ? "active" : ""}
                aria-pressed={category === id}
                onClick={() => onCategory(id)}
              >
                {id === "speedrun" ? "Speedrun" : "Community"}
              </button>
            ))}
          </div>
        )}
      </div>
      {!local && category === "speedrun" && (
        <div className="speedrun-brand">
          <img
            src={assetUrl("/TK2 Logo SpeedrunCOM.png")}
            alt="The Karters 2 · Speedrun.com"
          />
        </div>
      )}
      <div className="toolbar library-toolbar">
        <input
          aria-label="Search track groups"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search groups and tracks…"
        />
        {local && (
          <button onClick={onGroupFile}>
            <FilePlusIcon />
            Open group file
          </button>
        )}
        <div className="view-switch" aria-label="Group layout">
          <button aria-pressed={gallery} onClick={() => onGallery(true)}>
            <GridIcon />
            Gallery
          </button>
          <button aria-pressed={!gallery} onClick={() => onGallery(false)}>
            <ListBulletIcon />
            List
          </button>
        </div>
      </div>
      <div className="list-heading">
        <span>
          {groups.length} {groups.length === 1 ? "group" : "groups"}
        </span>
        <span>
          {local
            ? "From your selected save"
            : category === "speedrun"
              ? "Reviewed Speedrun collections"
              : "Curated community collections"}
        </span>
      </div>
      {!groups.length && (
        <div className="empty">
          <h2>
            {local && !hasProfile
              ? "Open your save to see your groups"
              : query
                ? "No matching groups"
                : "No groups here yet"}
          </h2>
          <p>
            {local
              ? "Choose your save or open a shared group file. All edits remain in this browser tab."
              : "Try another category or search."}
          </p>
          {local && !hasProfile && (
            <button className="primary" onClick={onOpenSave}>
              Choose game save
            </button>
          )}
        </div>
      )}
      {local && (
        <div className="selection-toolbar">
          <button
            disabled={!paging.items.length}
            onClick={() =>
              setChecked([
                ...new Set([...checked, ...paging.items.map((g) => g.id)]),
              ])
            }
          >
            Select this page
          </button>
          {checked.length > 0 && (
            <>
              <span>{checked.length} selected</span>
              <button onClick={() => setChecked([])}>Clear</button>
            </>
          )}
          <button
            disabled={!checked.length}
            onClick={() =>
              onExportMany(allGroups.filter((g) => checked.includes(g.id)))
            }
          >
            Export selected{checked.length ? ` · ${checked.length}` : ""}
          </button>
        </div>
      )}
      <GroupList
        checked={checked}
        onCheck={
          local
            ? (id) =>
                setChecked(
                  checked.includes(id)
                    ? checked.filter((v) => v !== id)
                    : [...checked, id],
                )
            : undefined
        }
        groups={paging.items.map((g) => ({
          ...g,
          statusText: local ? "In selected save" : "View collection",
        }))}
        selected={selected}
        gallery={gallery}
        onSelect={onSelect}
      />
      {gallery ? (
        <RowControls paging={paging} label="Track groups" />
      ) : (
        <Pagination paging={paging} label="Track groups" />
      )}
    </section>
  );
}
