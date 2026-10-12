import { useState, useRef, useEffect } from "react";
import { ReloadIcon, FilePlusIcon } from "@radix-ui/react-icons";
import GroupList from "../components/GroupList.jsx";
import GroupDetails from "../components/GroupDetails.jsx";

export default function Library({
  state,
  local,
  busy,
  run,
  onPreview,
  onExport,
  onCreate,
  onRename,
  focusId,
}) {
  const [search, setSearch] = useState("");
  const [selectedId, select] = useState(null);
  const [category, setCategory] = useState("speedrun");
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
  async function openFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error("Group file exceeds 1 MiB.");
      const group = JSON.parse(await file.text());
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
      <section className="library-main">
        <header className="page-heading">
          <span className="eyebrow">
            {local ? "Your game collection" : "The Karters 2 · Curated library"}
          </span>
          <h1>{local ? "My groups" : "Browse groups"}</h1>
          <p>
            {local
              ? "These are your custom groups in the game. Import a file, create a group from Workshop IDs, rename or export one."
              : "Choose a curated collection, review its tracks, then add it to My groups and your game."}
          </p>
        </header>
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
            <p>
              {category === "speedrun"
                ? "Collections for Speedrun.com categories, maintained in the reviewed catalog."
                : "Community-curated collections for exploring and racing together."}
            </p>
          </div>
        )}
        <div className="toolbar">
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
          <input
            ref={input}
            hidden
            type="file"
            accept=".tk2group.json,.json"
            onChange={openFile}
          />
        </div>
        <div className="list-heading">
          <span>
            {groups.length} {groups.length === 1 ? "group" : "groups"}
          </span>
          <span>
            {local
              ? "Custom groups only"
              : category === "speedrun"
                ? "Reviewed Speedrun collections"
                : "Curated community groups"}
          </span>
        </div>
        {groups.length ? (
          <GroupList
            groups={groups}
            selected={selected}
            onSelect={(g) => {
              select(g.id);
            }}
            local={local}
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
        {!local && (
          <p className="footer-note">
            Have a group to share? Export it from My groups and{" "}
            <a
              href="https://github.com/The-Karters-Community/TK2-trackGroup-tool/blob/main/CONTRIBUTING.md"
              target="_blank"
              rel="noreferrer"
            >
              submit it for review
            </a>
            .
          </p>
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
          onRename={onRename}
          trackStatus={state.trackStatus}
        />
      )}
    </div>
  );
}
