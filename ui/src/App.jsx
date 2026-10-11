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
import ImportDialog from "./components/ImportDialog.jsx";

export default function App() {
  const [state, setState] = useState(null);
  const [page, setPage] = useState("browse");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(null);
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
    if (job.state === "failed") setError(job.message);
    else {
      setMessage(job.message);
      if (job.result?.preview) setPreview(job.result.preview);
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
              onClick={() => {
                setPage(id);
                setPreview(null);
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
          <button disabled={busy} onClick={() => run("refresh", {})}>
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
        {busy && (
          <div className="operation" role="status">
            <div>
              <strong>{state.job.message}</strong>
              {state.job.items &&
                Object.entries(state.job.items).map(([id, item]) => (
                  <small key={id}>
                    {id}:{" "}
                    {item.ready
                      ? "Installed"
                      : item.total
                        ? `${Math.round((item.downloaded / item.total) * 100)}% downloaded`
                        : "Waiting for Steam"}
                  </small>
                ))}
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
        {page === "settings" ? (
          <Settings state={state} busy={busy} run={run} />
        ) : (
          <Library
            key={page}
            state={state}
            local={page === "local"}
            busy={busy}
            run={run}
            onPreview={(group) => run("preview", { group })}
            onExport={exportGroup}
          />
        )}
      </main>
      {preview && (
        <ImportDialog
          preview={preview}
          busy={busy}
          onCancel={() => setPreview(null)}
          onConfirm={async () => {
            const token = preview.token;
            setPreview(null);
            await run("import", { token });
          }}
        />
      )}
    </div>
  );
}
