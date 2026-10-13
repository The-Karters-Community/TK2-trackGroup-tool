import { useEffect, useMemo, useRef, useState } from "react";
import {
  StackIcon,
  PersonIcon,
  QuestionMarkCircledIcon,
  FilePlusIcon,
  Cross2Icon,
  LockClosedIcon,
} from "@radix-ui/react-icons";
import { assetUrl } from "../assets.js";
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
import SaveReview from "./SaveReview.jsx";
import SaveDownloads from "./SaveDownloads.jsx";
import HowTo from "./HowTo.jsx";
import Library from "./Library.jsx";
import GroupDetails from "./GroupDetails.jsx";
import PresetManager from "../presets/PresetManager.jsx";
import {
  applyPresetChange,
  presetState,
  exportPresets,
} from "../presets/model.js";

export default function WebApp() {
  const [page, setPage] = useState("browse");
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
    const timer = setTimeout(() => setMessage(""), 5000);
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
    setPage(next);
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
      setSource({ bytes, filename: file.name });
      setProfile(next);
      setDirty(false);
      setEditorDirty(false);
      setReview(nextReview);
      setPendingGroup(null);
      if (!nextReview) {
        setPage(page === "presets" ? "presets" : "local");
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
      if (file.size > 1024 * 1024)
        throw new Error("Group file exceeds the 1 MB limit.");
      const group = validateGroup(JSON.parse(await file.text()));
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
      return presetState(profile);
    } catch (err) {
      return { presets: [], groups: [], error: err.message };
    }
  }, [profile]);
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
      return false;
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
    ["browse", StackIcon, "Browse groups"],
    ["local", PersonIcon, "My groups"],
    ["presets", PersonIcon, "Presets"],
    ["help", QuestionMarkCircledIcon, "How to import"],
  ];
  return (
    <div className="app-shell web-shell">
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
            TK2<span>TRACK GROUPS</span>
          </strong>
        </div>
        <div className="nav-items">
          {navigation.map(([id, Icon, label]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              aria-current={page === id ? "page" : undefined}
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
          <button onClick={() => openSave()}>
            <FilePlusIcon />
            {profile ? "Open another save" : "Open game save"}
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
        {message && (
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
        {dirty && (
          <SaveDownloads
            key={source.filename}
            source={source}
            profile={profile}
            onHelp={() => navigate("help")}
          />
        )}
        {page === "presets" ? (
          <PresetManager
            state={presets}
            browser
            available={Boolean(profile)}
            onOpenSave={() => openSave()}
            onChange={changePresets}
            onExport={sharePresets}
            onError={setError}
            onDirty={setEditorDirty}
          />
        ) : page === "help" ? (
          <HowTo onOpen={() => openSave()} />
        ) : (
          <>
            {!profile && (
              <div className="web-intro">
                <strong>
                  Your next track group, without installing an app.
                </strong>
                <p>
                  Choose a group, open your local save, and download an updated
                  copy.{" "}
                  <button
                    className="text-button"
                    onClick={() => navigate("help")}
                  >
                    See the import steps
                  </button>
                </p>
              </div>
            )}
            {pendingGroup && !profile && (
              <div className="feedback">
                <span>{pendingGroup.name} is ready to review.</span>
                <button onClick={() => openSave(pendingGroup)}>
                  Choose destination save
                </button>
              </div>
            )}
            <Library
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
              selected={selected}
              hasProfile={Boolean(profile)}
              onSelect={(group) => {
                if (leaveEditor()) setSelectedId(group.id);
              }}
              onGroupFile={() => {
                if (leaveEditor()) groupInput.current.click();
              }}
              onOpenSave={() => openSave()}
            />
          </>
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
