import Feedback from "../components/Feedback.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  StackIcon,
  PersonIcon,
  QuestionMarkCircledIcon,
  FilePlusIcon,
  Cross2Icon,
  LockClosedIcon,
  HomeIcon,
} from "@radix-ui/react-icons";
import { assetUrl } from "../assets.js";
import InputNavigation from "../input/InputNavigation.jsx";
import { catalog, trackMapping, withPreviews } from "./catalog.js";
import {
  MAX_SAVE,
  customGroups,
  editGroup,
  importGroup,
  portableGroup,
  readProfile,
  reviewImport,
  validateGroup,
} from "./profile.js";
import { download } from "./download.js";
import useGameFolder from "./useGameFolder.js";
import SaveReview from "./SaveReview.jsx";
import SaveDownloads from "./SaveDownloads.jsx";
import HowTo from "./HowTo.jsx";
import Library from "./Library.jsx";
import GroupDetails from "./GroupDetails.jsx";
import PresetManager from "../presets/PresetManager.jsx";
import Home from "../pages/Home.jsx";
import TracksHub, { TRACK_PAGES } from "../pages/TracksHub.jsx";
import { groupPack, unpackGroups } from "../components/groupPack.js";
import {
  applyPresetChange,
  presetState,
  exportPresets,
} from "../presets/model.js";

export default function WebApp() {
  const [page, setPage] = useState("home");
  const [trackPage, setTrackPage] = useState("browse");
  const [quickRequest, setQuickRequest] = useState(0);
  const [fileGroups, setFileGroups] = useState([]);
  const [category, setCategory] = useState("speedrun");
  const [gallery, setGallery] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [source, setSource] = useState(null);
  const [profile, setProfile] = useState(null);
  const [shared, setShared] = useState([]);
  const [review, setReview] = useState(null);
  const [pendingGroup, setPendingGroup] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [presetImages, setPresetImages] = useState({});
  useEffect(
    () => () =>
      Object.values(presetImages).forEach((modes) =>
        Object.values(modes).forEach(URL.revokeObjectURL),
      ),
    [presetImages],
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const saveInput = useRef();
  const groupInput = useRef();
  const mapping = useMemo(
    () => trackMapping([...catalog, ...shared]),
    [shared],
  );
  const localGroups = useMemo(
    () => (profile ? customGroups(profile, mapping).map(withPreviews) : []),
    [profile, mapping],
  );
  const browsed = catalog
    .filter((g) => g.category === category)
    .map(withPreviews);
  const all = page === "local" ? localGroups : browsed;
  const selected = all.find((g) => g.id === selectedId);
  const groups = all.filter((g) =>
    `${g.name} ${g.tracks.map((t) => t.title || t.modId || "").join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 10000);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    if (!dirty && !editorDirty) return;
    function warn(e) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, editorDirty]);

  const {
    folder,
    needsPermission,
    profileChoices,
    pendingFolder,
    folderInput,
    connectFolder,
    applyFolder,
  } = useGameFolder({
    dirty: dirty || editorDirty,
    hasProfile: Boolean(profile),
    onError: setError,
    onConnected({ images, bytes, file, next }) {
      setPresetImages(images);
      if (next) {
        setSource({ bytes, filename: file.name });
        setProfile(next);
        setDirty(false);
        setEditorDirty(false);
        setSelectedId(null);
        setReview(null);
      }
      setError("");
      setMessage(
        `Local folder connected. ${Object.values(images).reduce((sum, modes) => sum + Object.keys(modes).length, 0)} preset pictures loaded. Nothing was uploaded.`,
      );
    },
  });
  function leaveEditor() {
    if (
      editorDirty &&
      !window.confirm("Discard the name or track order changes in this panel?")
    )
      return false;
    setEditorDirty(false);
    return true;
  }
  function navigate(next) {
    if (!leaveEditor()) return;
    const target = next === "track-hub" ? trackPage : next;
    if (TRACK_PAGES.includes(target)) setTrackPage(target);
    setPage(target);
    setSelectedId(null);
    setQuery("");
  }
  function openSave(group = null) {
    if (!leaveEditor()) return;
    setPendingGroup(group);
    saveInput.current.click();
  }
  async function loadSave(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    try {
      if (file.size > MAX_SAVE)
        throw new Error("Save exceeds the 32 MB limit.");
      if (
        dirty &&
        !window.confirm(
          "Replace the edited save in this tab? Download it first if you want to keep those changes.",
        )
      )
        return;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const next = readProfile(bytes, file.name);
      const nextReview = pendingGroup ? reviewImport(next, pendingGroup) : null;
      setPresetImages({});
      setSource({ bytes, filename: file.name });
      setProfile(next);
      setDirty(false);
      setEditorDirty(false);
      setReview(nextReview);
      setPendingGroup(null);
      if (!nextReview) {
        setPage(page === "presets" ? "presets" : "local");
        if (page !== "presets") setTrackPage("local");
        setSelectedId(null);
        setQuery("");
      }
      setMessage("Save opened locally. Nothing was uploaded.");
    } catch (err) {
      setError(err.message);
    }
  }
  async function loadGroup(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    try {
      if (file.size > 16 * 1024 * 1024)
        throw new Error("Group file exceeds the 16 MB limit.");
      const imported = unpackGroups(JSON.parse(await file.text())).map(
        validateGroup,
      );
      if (imported.length > 1) {
        const identities = new Set(imported.map((g) => g.id));
        const nextShared = [
          ...shared.filter((g) => !identities.has(g.id)),
          ...imported,
        ];
        trackMapping([...catalog, ...nextShared]);
        setShared(nextShared);
        setFileGroups(imported);
        return;
      }
      const group = imported[0];
      const nextShared = [...shared.filter((g) => g.id !== group.id), group];
      trackMapping([...catalog, ...nextShared]);
      setShared(nextShared);
      if (profile) setReview(reviewImport(profile, group));
      else {
        setPendingGroup(group);
        setMessage(
          "Group file opened. Choose your game save to review the import.",
        );
      }
    } catch (err) {
      setError(err.message);
    }
  }
  function prepare(group) {
    if (!profile) {
      setSelectedId(null);
      return openSave(group);
    }
    setError("");
    try {
      setReview(reviewImport(profile, group));
      setSelectedId(null);
    } catch (err) {
      setError(err.message);
    }
  }
  function applyImport(options) {
    try {
      const result = importGroup(profile, review.group, options);
      setProfile(readProfile(result.bytes, source.filename));
      setDirty(result.action !== "unchanged" || dirty);
      setReview(null);
      setPage("local");
      setTrackPage("local");
      setSelectedId(null);
      setQuery("");
      setMessage(
        `${result.name} ${result.action} in the edited save. Download it to apply the change.`,
      );
    } catch (err) {
      setError(err.message);
    }
  }
  async function saveEdit(change) {
    try {
      const bytes = editGroup(profile, change);
      setProfile(readProfile(bytes, source.filename));
      setDirty(true);
      setEditorDirty(false);
      setMessage(
        "Group changed in this tab. Download the edited save to apply it.",
      );
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }
  function exportGroup(group) {
    try {
      const value = portableGroup(group);
      download(
        `${group.id}.tk2group.json`,
        `${JSON.stringify(value, null, 2)}\n`,
        "application/json",
      );
    } catch (err) {
      setError(err.message);
    }
  }
  const presets = useMemo(() => {
    if (!profile) return null;
    try {
      const current = presetState(profile);
      const saved = source ? presetState(readProfile(source.bytes)) : null;
      current.appearance = {
        stalePreviews: current.presets
          .filter((p) => {
            const original = saved?.presets.find((entry) => entry.id === p.id);
            return (
              !original ||
              JSON.stringify(original.data) !== JSON.stringify(p.data)
            );
          })
          .map((p) => p.id),
      };
      return current;
    } catch (err) {
      return { presets: [], groups: [], error: err.message };
    }
  }, [profile, source]);
  async function changePresets(change) {
    try {
      const bytes = applyPresetChange(profile, change);
      setProfile(readProfile(bytes, source.filename));
      setDirty(true);
      setMessage(
        "Presets changed in this tab. Download the edited save to apply them.",
      );
      return true;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }
  function sharePresets(ids, groups) {
    try {
      download(
        "customizations.tk2presets.json",
        JSON.stringify(exportPresets(presets, ids, groups), null, 2),
        "application/json",
      );
    } catch (err) {
      setError(err.message);
    }
  }
  const navigation = [
    ["home", HomeIcon, "Home"],
    ["track-hub", StackIcon, "Tracks"],
    ["presets", PersonIcon, "Presets"],
    ["help", QuestionMarkCircledIcon, "How to import"],
  ];
  return (
    <div className="app-shell web-shell">
      <input
        ref={folderInput}
        type="file"
        hidden
        webkitdirectory=""
        multiple
        aria-label="Choose game data folder"
        onChange={async (e) => {
          const files = [...e.target.files];
          e.target.value = "";
          if (!files.length) return;
          try {
            await applyFolder(files);
          } catch (err) {
            setError(err.message);
          }
        }}
      />
      <input
        ref={saveInput}
        type="file"
        hidden
        aria-label="Choose game save file"
        onChange={loadSave}
      />
      <input
        ref={groupInput}
        type="file"
        hidden
        accept=".json"
        aria-label="Choose shared group file"
        onChange={loadGroup}
      />
      <nav className="sidebar" aria-label="Main navigation">
        <div className="brand">
          <img
            className="brand-logo"
            src={assetUrl("/logo.png")}
            alt="The Karters 2"
          />
          <strong>
            Bobby’s<span>GARAGE</span>
          </strong>
        </div>
        <div className="nav-items">
          {navigation.map(([id, Icon, label]) => (
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
              onClick={() => navigate(id)}
            >
              <Icon />
              {label}
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <span>Browser edition</span>
          <span>Made by DarkSlayer</span>
          <InputNavigation />
        </div>
      </nav>
      <main>
        <div className="connection-bar web-status">
          <span>
            <LockClosedIcon />
            {profile
              ? "Save opened locally · never uploaded"
              : "Works in your browser · no executable"}
          </span>
          <div className="preset-actions">
            <button onClick={() => connectFolder(Boolean(folder))}>
              {needsPermission
                ? "Reconnect game folder"
                : folder
                  ? "Refresh local folder"
                  : "Connect game folder"}
            </button>
            <button onClick={() => openSave()}>
              <FilePlusIcon />
              {profile ? "Open another save" : "Open game save"}
            </button>
          </div>
        </div>
        {!profile && page === "presets" && (
          <div className="folder-guide">
            <strong>
              Connect once, keep your pictures and presets together.
            </strong>
            <p>
              Choose{" "}
              <code>
                %USERPROFILE%\AppData\LocalLow\PixelEdgeGames\TheKarters2
              </code>
              . The browser needs your permission before it can read local
              files. Supported browsers remember this folder; no files are
              uploaded.
            </p>
            <button onClick={() => connectFolder(Boolean(folder))}>
              Connect game folder
            </button>
          </div>
        )}
        {profileChoices.length > 0 && (
          <section className="notice" aria-label="Choose game profile">
            <h2>Choose your game profile</h2>
            <p>More than one save was found. Select the one you play with.</p>
            {profileChoices.map((file) => (
              <button
                key={file.name}
                onClick={async () => {
                  const { files, handle } = pendingFolder.current;
                  try {
                    await applyFolder(
                      files.filter(
                        (f) => !profileChoices.includes(f) || f === file,
                      ),
                      handle,
                    );
                  } catch (err) {
                    setError(err.message);
                  }
                }}
              >
                {file.name}
              </button>
            ))}
            <button onClick={() => pendingFolder.current.cancel()}>
              Cancel
            </button>
          </section>
        )}
        <Feedback
          message={error || message}
          error={Boolean(error)}
          onDismiss={() => (error ? setError("") : setMessage(""))}
        />
        {dirty && (
          <SaveDownloads
            key={source.filename}
            source={source}
            profile={profile}
            onHelp={() => navigate("help")}
          />
        )}
        {page === "home" ? (
          <Home
            browser
            onNavigate={navigate}
            onQuickSetup={() => {
              setQuickRequest((n) => n + 1);
              navigate("presets");
            }}
            presetCount={presets?.presets?.length}
            groupCount={localGroups.length}
          />
        ) : page === "presets" ? (
          <PresetManager
            libraryScope={source?.filename || "browser"}
            openQuickRequest={quickRequest}
            onQuickOpened={() => setQuickRequest(0)}
            state={presets}
            browser
            available={Boolean(profile)}
            onOpenSave={() => openSave()}
            onChange={changePresets}
            onExport={sharePresets}
            onError={setError}
            onDirty={setEditorDirty}
            onConnectFolder={() => connectFolder(Boolean(folder))}
            previewImages={presetImages}
            onPreviewImages={setPresetImages}
          />
        ) : page === "help" ? (
          <HowTo onOpen={() => openSave()} />
        ) : (
          <TracksHub active={page} onChange={navigate} browser>
            {pendingGroup && !profile && (
              <div className="feedback">
                <span>{pendingGroup.name} is ready to review.</span>
                <button onClick={() => openSave(pendingGroup)}>
                  Choose destination save
                </button>
              </div>
            )}
            {fileGroups.length > 0 && (
              <section
                className="pack-import"
                aria-label="Groups in shared file"
              >
                <strong>{fileGroups.length} groups in this file</strong>
                <p>Choose a group to review before importing.</p>
                {fileGroups.map((g) => (
                  <button key={g.id} onClick={() => prepare(g)}>
                    {g.name} · {g.tracks.length} tracks
                  </button>
                ))}
                <button onClick={() => setFileGroups([])}>Close file</button>
              </section>
            )}
            <Library
              key={`${page}:${category}`}
              local={page === "local"}
              category={category}
              onCategory={(value) => {
                setCategory(value);
                setSelectedId(null);
              }}
              query={query}
              onQuery={setQuery}
              gallery={gallery}
              onGallery={setGallery}
              groups={groups}
              allGroups={all}
              selected={selected}
              hasProfile={Boolean(profile)}
              onSelect={(group) => {
                if (leaveEditor()) setSelectedId(group.id);
              }}
              onGroupFile={() => {
                if (leaveEditor()) groupInput.current.click();
              }}
              onOpenSave={() => openSave()}
              onExportMany={(selected) => {
                try {
                  download(
                    "track-groups.tk2groups.json",
                    JSON.stringify(
                      groupPack(selected.map(portableGroup)),
                      null,
                      2,
                    ),
                    "application/json",
                  );
                  setMessage(`${selected.length} track groups exported.`);
                } catch (err) {
                  setError(err.message);
                }
              }}
            />
          </TracksHub>
        )}
      </main>
      {selected && (
        <GroupDetails
          group={selected}
          local={page === "local"}
          hasProfile={Boolean(profile)}
          onClose={() => {
            if (leaveEditor()) setSelectedId(null);
          }}
          onImport={prepare}
          onExport={exportGroup}
          onSave={saveEdit}
          onDirty={setEditorDirty}
        />
      )}
      {review && (
        <SaveReview
          review={review}
          images={withPreviews(review.group).previewImages}
          currentGroups={localGroups}
          onClose={() => setReview(null)}
          onConfirm={applyImport}
        />
      )}
    </div>
  );
}
