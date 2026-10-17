import { useCallback, useEffect, useRef, useState } from "react";
import {
  StackIcon,
  PersonIcon,
  GearIcon,
  ReloadIcon,
  Cross2Icon,
  HomeIcon,
  AvatarIcon,
} from "@radix-ui/react-icons";
import { api, download, loadPreview } from "./api.js";
import Library from "./pages/Library.jsx";
import Settings from "./pages/Settings.jsx";
import Tracks from "./pages/Tracks.jsx";
import Home from "./pages/Home.jsx";
import Lobby from "./pages/Lobby.jsx";
import InputNavigation from "./input/InputNavigation.jsx";
import TracksHub, { TRACK_PAGES } from "./pages/TracksHub.jsx";
import ImportDialog from "./components/ImportDialog.jsx";
import GroupEditor from "./components/GroupEditor.jsx";
import PresetManager from "./presets/PresetManager.jsx";
import { download as downloadFile } from "./web/download.js";

export default function App() {
  const [state, setState] = useState(null);
  const [page, setPage] = useState("home");
  const [trackPage, setTrackPage] = useState("browse");
  const [quickRequest, setQuickRequest] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(null);
  const [editor, setEditor] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [focusId, setFocusId] = useState(null);
  const [seenJob, setSeenJob] = useState("");
  const [presetDirty, setPresetDirty] = useState(false);
  const polling = useRef(false);
  const lastSnapshot = useRef("");
  const loadModel = useCallback(
    (body, signal) => api("preset-model", body, signal),
    [],
  );
  const saveLibraryPreferences = useCallback(
    (value) => api("library-preferences", value),
    [],
  );
  const refreshModels = useCallback(async () => {
    await api("refresh-appearances", {});
    for (let i = 0; i < 120; i++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const next = await api("state");
      setState(next);
      if (!next.presetState?.appearance?.loading) return;
    }
    throw new Error(
      "The installed asset scan is still running. Please try again shortly.",
    );
  }, []);
  const refresh = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    try {
      const next = await api("state");
      const snapshot = JSON.stringify(next);
      if (snapshot !== lastSnapshot.current) {
        lastSnapshot.current = snapshot;
        setState(next);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      polling.current = false;
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
        setEditor(null);
        setConfirmed(false);
      }
    }
  }, [state?.job, seenJob]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 10000);
    return () => clearTimeout(timer);
  }, [message]);
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
  async function exportGroups(groups) {
    try {
      const result = await api("export-groups", {
        ids: groups.map((g) => g.id),
      });
      if (result.pack)
        downloadFile(
          "track-groups.tk2groups.json",
          JSON.stringify(result.pack, null, 2),
          "application/json",
        );
      setMessage(result.message || `${groups.length} track groups exported.`);
    } catch (err) {
      setError(err.message);
    }
  }
  async function changePresets(change, edit = {}) {
    try {
      if (change.mode === "quick" && state?.gameRunning) {
        const result = await api("live-save-quick", {
          profile: state.settings?.profile,
          change,
          baseline: edit.baseline,
        });
        setMessage(result.message || "Preset saved by the running game.");
        await refresh();
        return true;
      }
      await api("presets", {
        change,
        expectedHash: edit.expectedHash || state.profileHash,
        baseline: edit.baseline,
      });
      let current;
      do {
        await new Promise((resolve) => setTimeout(resolve, 250));
        current = await api("state");
        setState(current);
      } while (current.job?.state === "running");
      if (current.job?.state !== "completed")
        throw new Error(current.job?.message || "Preset save failed.");
      return true;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }
  async function exportPresets(ids, groups) {
    try {
      const result = await api("export-presets", { ids, groups });
      if (result.pack)
        downloadFile(
          "customizations.tk2presets.json",
          JSON.stringify(result.pack, null, 2),
          "application/json",
        );
      setMessage(result.message || "Preset pack exported.");
    } catch (err) {
      setError(err.message);
    }
  }
  if (!state)
    return (
      <div className="loading">
        <h1>Bobby’s Garage</h1>
        <p role="status">{error || "Opening your group library…"}</p>
      </div>
    );
  const busy = state.job?.state === "running" || state.quickSaving;
  const reviewJob =
    confirmed && state.job?.action === "import" ? state.job : null;
  async function prepare(action, body) {
    setPreview(null);
    setConfirmed(false);
    return run(action, body);
  }
  function backToGroups() {
    setPage("local");
    setTrackPage("local");
    setFocusId(preview?.group.id || null);
    setPreview(null);
    setConfirmed(false);
    setEditor(null);
  }
  const nav = [
    ["home", HomeIcon, "Home"],
    ["track-hub", StackIcon, "Tracks"],
    ["presets", PersonIcon, "Presets"],
    ["lobby", AvatarIcon, "Lobby"],
    ["settings", GearIcon, "Settings"],
  ];
  return (
    <div className="app-shell">
      <nav className="sidebar" aria-label="Main navigation">
        <div className="brand">
          <img className="brand-logo" src="/logo.png" alt="The Karters 2" />
          <strong>
            Bobby’s<span>GARAGE</span>
          </strong>
        </div>
        <div className="nav-items">
          {nav.map(([id, Icon, label]) => (
            <button
              key={id}
              className={
                page === id ||
                (id === "track-hub" && TRACK_PAGES.includes(page))
                  ? "active"
                  : ""
              }
              aria-current={
                page === id ||
                (id === "track-hub" && TRACK_PAGES.includes(page))
                  ? "page"
                  : undefined
              }
              disabled={busy}
              onClick={() => {
                if (
                  presetDirty &&
                  !window.confirm("Discard unsaved preset changes?")
                )
                  return;
                setPage(id === "track-hub" ? trackPage : id);
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
          <span>Made by DarkSlayer</span>
          <InputNavigation />
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
        {state.update?.state === "available" && (
          <div className="feedback" role="status">
            <span>{state.update.message}</span>
            {state.update.portable ? (
              <button
                className="primary"
                disabled={busy || Boolean(preview)}
                onClick={() => run("update", {})}
              >
                Update app
              </button>
            ) : (
              <span>Update this source checkout through Git.</span>
            )}
          </div>
        )}
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
          <div className="feedback toast" role="status">
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
              <strong>
                {state.quickSaving
                  ? "Saving through the running game…"
                  : state.job?.message}
              </strong>
              {state.job?.total > 0 && !state.quickSaving && (
                <progress
                  value={state.job.completed || 0}
                  max={state.job.total}
                />
              )}
            </div>
            {!state.quickSaving && (
              <button
                disabled={state.job.phase === "saving"}
                onClick={() => run("cancel", {})}
              >
                Cancel
              </button>
            )}
          </div>
        )}
        {editor ? (
          <GroupEditor
            key={editor.group?.id || "create"}
            group={editor.group}
            tracks={state.tracks}
            initialTracks={editor.tracks}
            busy={busy}
            onCancel={() => setEditor(null)}
            onSubmit={prepare}
          />
        ) : page === "home" ? (
          <Home
            onNavigate={setPage}
            onQuickSetup={() => {
              setQuickRequest((n) => n + 1);
              setPage("presets");
            }}
            presetCount={state.presetState?.presets?.length}
            groupCount={state.localGroups?.length}
          />
        ) : page === "lobby" ? (
          <Lobby
            state={state}
            busy={busy}
            loadImage={loadPreview}
            onCopied={refresh}
            onNotice={setMessage}
          />
        ) : page === "presets" ? (
          <PresetManager
            initialLibraryPreferences={state.libraryPreferences}
            saveLibraryPreferences={saveLibraryPreferences}
            libraryScope={state.settings?.profile || "local"}
            openQuickRequest={quickRequest}
            onQuickOpened={() => setQuickRequest(0)}
            refreshModels={refreshModels}
            state={state.presetState}
            loadImage={loadPreview}
            loadModel={loadModel}
            busy={busy}
            available={
              state.steamConnected && !state.syncError && !state.gameRunning
            }
            gameRunning={state.gameRunning}
            quickSaveAvailable={
              state.gameRunning &&
              state.steamConnected &&
              !state.syncError &&
              state.cloudEnabled &&
              state.nativeQuickSaveAvailable
            }
            onChange={changePresets}
            onExport={exportPresets}
            onError={setError}
            onDirty={setPresetDirty}
          />
        ) : page === "settings" ? (
          <Settings state={state} busy={busy} run={run} />
        ) : (
          <TracksHub
            active={page}
            busy={busy}
            onChange={(id) => {
              setPage(id);
              setTrackPage(id);
              setFocusId(null);
            }}
          >
            {page === "tracks" ? (
              <Tracks
                state={state}
                busy={busy}
                onCreate={(tracks) => setEditor({ tracks })}
              />
            ) : (
              <Library
                key={page}
                state={state}
                local={page === "local"}
                busy={busy}
                run={run}
                onPreview={(group) => prepare("preview", { group })}
                onExport={exportGroup}
                onExportMany={exportGroups}
                onCreate={() => setEditor({})}
                onEdit={(body) => run("edit", body)}
                onRepair={(group) => prepare("repair", { id: group.id })}
                focusId={focusId}
              />
            )}
          </TracksHub>
        )}
        {preview && (
          <ImportDialog
            preview={preview}
            confirmed={confirmed}
            job={reviewJob}
            onBack={() => {
              setPreview(null);
              setConfirmed(false);
            }}
            onDone={backToGroups}
            onCancel={() => run("cancel", {})}
            onConfirm={async () => {
              if (await run("import", { token: preview.token }))
                setConfirmed(true);
            }}
          />
        )}
      </main>
    </div>
  );
}
