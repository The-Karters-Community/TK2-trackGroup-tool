import { useCallback, useEffect, useState } from "react";
import {
  StackIcon,
  PersonIcon,
  GearIcon,
  ReloadIcon,
  Cross2Icon,
} from "@radix-ui/react-icons";
import { api, download } from "./api.js";
import Library from "./pages/Library.jsx";
import Settings from "./pages/Settings.jsx";
import ImportReview from "./components/ImportReview.jsx";
import GroupEditor from "./components/GroupEditor.jsx";

export default function App() {
  const [state, setState] = useState(null);
  const [page, setPage] = useState("browse");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(null);
  const [editor, setEditor] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [focusId, setFocusId] = useState(null);
  const [seenJob, setSeenJob] = useState("");
  const refresh = useCallback(async () => {
    try {
      setState(await api("state"));
    } catch (err) {
      setError(err.message);
    }
  }, []);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 700);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    const job = state?.job;
    if (!job || job.state === "running" || seenJob === job.id) return;
    setSeenJob(job.id);
    if (job.state === "failed" && job.action !== "import")
      setError(job.message);
    else {
      if (job.action !== "import" && !job.result?.preview)
        setMessage(job.message);
      if (job.result?.preview) {
        setPreview(job.result.preview);
        setPage("local");
        setEditor(null);
        setConfirmed(false);
      }
    }
  }, [state?.job, seenJob]);
  async function run(action, body) {
    if (action === "error") {
      setError(body.message);
      return;
    }
    setError("");
    setMessage("");
    try {
      const value = await api(action, body);
      if (action === "settings") setMessage(value.message);
      await refresh();
      return value;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }
  async function exportGroup(group) {
    try {
      const result = await api("export", { id: group.id });
      if (result.group) download(result.group);
      setMessage(result.message || "Group exported.");
    } catch (err) {
      setError(err.message);
    }
  }
  if (!state)
    return (
      <div className="loading">
        <h1>TK2 Track Groups</h1>
        <p role="status">{error || "Opening your group library…"}</p>
      </div>
    );
  const busy = state.job?.state === "running";
  const reviewJob =
    confirmed && state.job?.action === "import" ? state.job : null;
  async function prepare(action, body) {
    setPage("local");
    setPreview(null);
    setConfirmed(false);
    return run(action, body);
  }
  function backToGroups() {
    setPage("local");
    setFocusId(preview?.group.id || null);
    setPreview(null);
    setConfirmed(false);
    setEditor(null);
  }
  const nav = [
    ["browse", StackIcon, "Browse groups"],
    ["local", PersonIcon, "My groups"],
    ["settings", GearIcon, "Settings"],
  ];
  return (
    <div className="app-shell">
      <nav className="sidebar" aria-label="Main navigation">
        <div className="brand">
          <span className="brand-mark">TG</span>
          <strong>
            TK2<span>TRACK GROUPS</span>
          </strong>
        </div>
        <div className="nav-items">
          {nav.map(([id, Icon, label]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              aria-current={page === id ? "page" : undefined}
              disabled={busy}
              onClick={() => {
                setPage(id);
                setPreview(null);
                setEditor(null);
                setConfirmed(false);
                setFocusId(null);
              }}
            >
              <Icon />
              {label}
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <span>Community edition</span>
          <span>{state.version}</span>
          <a
            href="https://github.com/The-Karters-Community/TK2-trackGroup-tool"
            target="_blank"
            rel="noreferrer"
          >
            Project & help
          </a>
        </div>
      </nav>
      <main>
        <div className="connection-bar">
          <span>
            <i
              className={
                state.steamConnected && !state.syncError ? "connected" : ""
              }
            />
            {state.steamConnected
              ? state.syncError
                ? "Profile needs attention"
                : "Steam connected · profile verified"
              : "Connect Steam to import"}
          </span>
          <button
            disabled={busy || Boolean(preview)}
            onClick={() => run("refresh", {})}
          >
            <ReloadIcon />
            {state.steamConnected ? "Refresh Steam" : "Connect Steam"}
          </button>
        </div>
        {error && (
          <div className="feedback error" role="alert">
            {error}
            <button
              className="icon-button"
              aria-label="Dismiss error"
              onClick={() => setError("")}
            >
              <Cross2Icon />
            </button>
          </div>
        )}
        {message && !busy && (
          <div className="feedback" role="status">
            {message}
            <button
              className="icon-button"
              aria-label="Dismiss message"
              onClick={() => setMessage("")}
            >
              <Cross2Icon />
            </button>
          </div>
        )}
        {state.syncError && state.steamConnected && (
          <div className="feedback error">{state.syncError}</div>
        )}
        {busy && !reviewJob && (
          <div className="operation" role="status">
            <div>
              <strong>{state.job.message}</strong>
              {state.job.total > 0 && (
                <progress
                  value={state.job.completed || 0}
                  max={state.job.total}
                />
              )}
            </div>
            <button
              disabled={state.job.phase === "saving"}
              onClick={() => run("cancel", {})}
            >
              Cancel
            </button>
          </div>
        )}
        {preview ? (
          <ImportReview
            preview={preview}
            confirmed={confirmed}
            job={reviewJob}
            onBack={backToGroups}
            onDone={backToGroups}
            onCancel={() => run("cancel", {})}
            onConfirm={async () => {
              if (await run("import", { token: preview.token }))
                setConfirmed(true);
            }}
          />
        ) : editor ? (
          <GroupEditor
            key={editor.group?.id || "create"}
            group={editor.group}
            busy={busy}
            onCancel={() => setEditor(null)}
            onSubmit={prepare}
          />
        ) : page === "settings" ? (
          <Settings state={state} busy={busy} run={run} />
        ) : (
          <Library
            key={page}
            state={state}
            local={page === "local"}
            busy={busy}
            run={run}
            onPreview={(group) => prepare("preview", { group })}
            onExport={exportGroup}
            onCreate={() => setEditor({})}
            onRename={(group) => setEditor({ group })}
            focusId={focusId}
          />
        )}
      </main>
    </div>
  );
}
