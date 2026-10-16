import { useState, useRef, useEffect } from "react";
import { ReloadIcon, FilePlusIcon } from "@radix-ui/react-icons";
import GroupList from "../components/GroupList.jsx";
import GroupDetails from "../components/GroupDetails.jsx";
import Pagination, { usePagination } from "../components/Pagination.jsx";
import { RowControls, useRowPagination } from "../components/RowPage.jsx";
import { unpackGroups } from "../components/groupPack.js";

export default function Library({
  state,
  local,
  busy,
  run,
  onPreview,
  onExport,
  onExportMany,
  onCreate,
  onEdit,
  onRepair,
  focusId,
}) {
  const [search, setSearch] = useState("");
  const [selectedId, select] = useState(null);
  const [category, setCategory] = useState("speedrun");
  const [checked, setChecked] = useState([]);
  const [fileGroups, setFileGroups] = useState([]);
  const [gallery, setGallery] = useState(
    () =>
      localStorage.getItem(local ? "my-groups-view" : "browse-groups-view") !==
      "list",
  );
  useEffect(() => {
    if (focusId) select(focusId);
  }, [focusId]);
  const input = useRef();
  const source = local ? state.localGroups : state.groups;
  const categorySource = local
    ? source
    : source.filter((g) => (g.category || "community") === category);
  const selected = categorySource.find((g) => g.id === selectedId);
  const groups = categorySource.filter((g) =>
    g.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const listPaging = usePagination(groups, `${search}:${category}:${local}`);
  const gridPaging = useRowPagination(
    groups,
    `${search}:${category}:${local}`,
    250,
    16,
  );
  const paging = gallery ? gridPaging : listPaging;
  const selectedGroups = source.filter((g) => checked.includes(g.id));
  async function openFile(event) {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 16 * 1024 * 1024)
        throw new Error("Group file exceeds 16 MiB.");
      const imported = unpackGroups(JSON.parse(await file.text()));
      if (imported.length > 1) {
        setFileGroups(imported);
        return;
      }
      const group = imported[0];
      // Backend validates every field. Never trust a file's display shape before parsing.
      if (!group.name || !Array.isArray(group.tracks))
        throw new Error("Invalid group file.");
      await onPreview(group);
      select(null);
    } catch (error) {
      run("error", { message: error.message });
    }
    event.target.value = "";
  }
  return (
    <div className={`library ${selected ? "with-details" : ""}`}>
      <section
        className="library-main"
        ref={gridPaging.host}
        style={{ "--collection-columns": gridPaging.columns }}
      >
        <header className="library-heading">
          <h1>{local ? "My track groups" : "Discover track groups"}</h1>
          {!local && (
            <div className="category-tabs" aria-label="Group categories">
              {[
                ["speedrun", "Speedrun"],
                ["community", "Community"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={category === id}
                  className={category === id ? "active" : ""}
                  onClick={() => {
                    setCategory(id);
                    select(null);
                  }}
                >
                  {label}
                  <span>
                    {
                      source.filter((g) => (g.category || "community") === id)
                        .length
                    }
                  </span>
                </button>
              ))}
            </div>
          )}
        </header>
        {!local && category === "speedrun" && (
          <div className="speedrun-brand">
            <img
              src="/TK2%20Logo%20SpeedrunCOM.png"
              alt="The Karters 2 Speedrun.com"
            />
          </div>
        )}
        <div className="toolbar library-toolbar">
          <input
            aria-label="Search groups"
            placeholder="Search track groups…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {!local && (
            <button disabled={busy} onClick={() => run("catalog", {})}>
              <ReloadIcon />
              Refresh library
            </button>
          )}
          {local && (
            <button disabled={busy} onClick={() => input.current.click()}>
              <FilePlusIcon />
              Import group file
            </button>
          )}
          {local && (
            <button className="primary" disabled={busy} onClick={onCreate}>
              Create group
            </button>
          )}
          <div className="view-switch" aria-label="Group view">
            {["Gallery", "List"].map((view) => (
              <button
                key={view}
                aria-pressed={gallery === (view === "Gallery")}
                onClick={() => {
                  setGallery(view === "Gallery");
                  localStorage.setItem(
                    local ? "my-groups-view" : "browse-groups-view",
                    view.toLowerCase(),
                  );
                }}
              >
                {view}
              </button>
            ))}
          </div>
          <input
            ref={input}
            hidden
            type="file"
            accept=".tk2group.json,.json"
            onChange={openFile}
          />
        </div>
        {fileGroups.length > 0 && (
          <section className="pack-import" aria-label="Groups in shared file">
            <strong>{fileGroups.length} groups in this file</strong>
            <p>Choose a group to review its tracks before importing.</p>
            {fileGroups.map((g) => (
              <button key={g.id} disabled={busy} onClick={() => onPreview(g)}>
                {g.name} · {g.tracks.length} tracks
              </button>
            ))}
            <button onClick={() => setFileGroups([])}>Close file</button>
          </section>
        )}
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
          {selectedGroups.length > 0 && (
            <>
              <span>{selectedGroups.length} selected</span>
              <button onClick={() => setChecked([])}>Clear</button>
            </>
          )}
          <button
            disabled={busy || !selectedGroups.length}
            onClick={() => onExportMany?.(selectedGroups)}
          >
            Export selected
            {selectedGroups.length ? ` · ${selectedGroups.length}` : ""}
          </button>
        </div>
        <div className="list-heading">
          <span>
            {groups.length} {groups.length === 1 ? "group" : "groups"}
          </span>
          <span>
            {local
              ? "Your racing collections"
              : category === "speedrun"
                ? "Speedrun collections"
                : "Community collections"}
          </span>
        </div>
        {groups.length ? (
          <GroupList
            groups={paging.items}
            checked={checked}
            onCheck={(id) =>
              setChecked(
                checked.includes(id)
                  ? checked.filter((v) => v !== id)
                  : [...checked, id],
              )
            }
            selected={selected}
            onSelect={(g) => {
              select(g.id);
            }}
            local={local}
            gallery={gallery}
          />
        ) : (
          <div className="empty">
            <h2>
              {search
                ? "No matching groups"
                : local
                  ? "No custom groups yet"
                  : `No ${category === "speedrun" ? "Speedrun" : "Community"} groups yet`}
            </h2>
            <p>
              {search
                ? "Try another search."
                : local
                  ? "Create one from Workshop IDs or import a shared group file."
                  : "Reviewed submissions will appear here after a library refresh."}
            </p>
          </div>
        )}
        {gallery ? (
          <RowControls paging={paging} label="Track groups" />
        ) : (
          <Pagination paging={paging} label="Track groups" />
        )}
      </section>
      {selected && (
        <GroupDetails
          group={selected}
          local={local}
          busy={busy}
          connected={state.steamConnected && !state.syncError}
          onClose={() => {
            select(null);
          }}
          onPreview={onPreview}
          onExport={onExport}
          onEdit={onEdit}
          onRepair={onRepair}
          editJob={state.job?.action === "edit" ? state.job : null}
          key={selected.id}
          trackStatus={state.trackStatus}
        />
      )}
    </div>
  );
}
