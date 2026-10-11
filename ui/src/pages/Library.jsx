import { useState, useRef } from "react";
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
}) {
  const [search, setSearch] = useState("");
  const [selectedId, select] = useState(null);
  const input = useRef();
  const source = local ? state.localGroups : state.groups;
  const selected = source.find((g) => g.id === selectedId);
  const groups = source.filter((g) =>
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
            {local ? "Export & share" : "The Karters 2 · Community library"}
          </span>
          <h1>{local ? "My groups" : "Find your next race."}</h1>
          <p>
            {local
              ? "Your custom groups, exactly as ordered in the game. Export a group to share it or submit it to the community."
              : "Bring a complete track group into your game. Official tracks and Workshop subscriptions, in one place."}
          </p>
        </header>
        <div className="toolbar">
          <input
            aria-label="Search groups"
            placeholder="Search track groups…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            disabled={busy}
            onClick={() => run(local ? "refresh" : "catalog", {})}
          >
            <ReloadIcon />
            Refresh {local ? "Steam" : "library"}
          </button>
          {!local && (
            <button disabled={busy} onClick={() => input.current.click()}>
              <FilePlusIcon />
              Open group file
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
            {local ? "Custom groups only" : "Reviewed community submissions"}
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
            <h2>{search ? "No matching groups" : "No custom groups found"}</h2>
            <p>
              {search
                ? "Try another search."
                : "Create a group in the game, close the game, then refresh Steam."}
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
          trackStatus={state.trackStatus}
        />
      )}
    </div>
  );
}
