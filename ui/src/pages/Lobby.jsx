import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  CopyIcon,
  DownloadIcon,
  ReloadIcon,
  PersonIcon,
  ExternalLinkIcon,
  EyeOpenIcon,
} from "@radix-ui/react-icons";
import { api } from "../api.js";
import PresetPreview from "../presets/PresetPreview.jsx";
import LobbySetupImage from "../presets/LobbySetupImage.jsx";
import { createSetupSnapshots } from "../presets/setupSnapshots.js";
import { slots, itemInfo } from "../presets/appearance.js";
import "./Lobby.css";

const ModelViewer = lazy(() => import("../presets/ModelViewer.jsx"));
const playerName = (player) => {
  const name = player.name?.trim();
  if (
    name &&
    !["player", "racer", "cpu", "cpu racer"].includes(name.toLowerCase())
  )
    return name;
  if (player.local) return "You";
  const slot = Number.isInteger(player.player) ? ` ${player.player + 1}` : "";
  return player.ai ? `CPU${slot}` : `Racer${slot}`;
};
const cosmeticKey = (data) =>
  JSON.stringify(data, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
        )
      : value,
  );

export default function Lobby({
  state,
  busy = false,
  request = api,
  loadImage,
  loadModel,
  refreshModels,
  onCopied,
  onNotice,
  onEditPlayer,
  editedPlayer,
}) {
  const [room, setRoom] = useState({ status: "loading", players: [] });
  const [pending, setPending] = useState({});
  const [error, setError] = useState("");
  const [readError, setReadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedKey, setSelectedKey] = useState(null);
  const [targetPlayer, setTargetPlayer] = useState(0);
  const [view, setView] = useState("effective");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [snapshots, setSnapshots] = useState(null);
  const mounted = useRef(true),
    polling = useRef(false),
    inspector = useRef(),
    queue = useRef(Promise.resolve()),
    pendingKeys = useRef(new Set()),
    busyRef = useRef(busy);
  busyRef.current = busy;
  const appearance = state.presetState?.appearance;
  const selected =
    room.players.find((p) => p.key === selectedKey) ||
    room.players.find((p) => !p.local && !p.ai) ||
    room.players[0];
  const locked = busy && !Object.keys(pending).length;
  const connected =
    state.steamConnected && state.cloudEnabled && !state.syncError;
  const quickPlayers = state.presetState?.quickSetups?.length
    ? state.presetState.quickSetups
    : [{ player: 0 }];
  useEffect(() => {
    if (!loadModel) return;
    const pool = createSetupSnapshots(loadModel);
    setSnapshots(pool);
    return () => pool.dispose();
  }, [loadModel]);
  const editedSignature = editedPlayer
    ? JSON.stringify([editedPlayer.key, editedPlayer.data, editedPlayer.serial])
    : "";
  useEffect(() => {
    if (!editedSignature) return;
    const [key, data] = JSON.parse(editedSignature);
    if (!key || !data) return;
    setRoom((previous) => ({
      ...previous,
      players: previous.players.map((player) =>
        player.key === key
          ? {
              ...player,
              data,
              parts: {},
              alreadySaved: false,
              canSave: true,
              canCopy: !player.local,
            }
          : player,
      ),
    }));
  }, [editedSignature]);
  const refresh = useCallback(async () => {
    if (
      pendingKeys.current.size ||
      busyRef.current ||
      polling.current ||
      document.hidden
    )
      return;
    polling.current = true;
    setRefreshing(true);
    try {
      const value = await request("lobby", {});
      if (mounted.current) {
        setRoom(value);
        setReadError("");
      }
    } catch (e) {
      if (mounted.current) {
        setReadError(e.message);
        setRoom((previous) => ({
          ...previous,
          status: "error",
          message:
            "Connection interrupted. Your last player list stays here while you reconnect.",
        }));
      }
    } finally {
      polling.current = false;
      if (mounted.current) setRefreshing(false);
    }
  }, [request]);
  useEffect(() => {
    mounted.current = true;
    refresh();
    const timer = setInterval(refresh, 4000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [refresh]);

  function enqueue(player, mode, part, perform) {
    if (locked || pendingKeys.current.has(player.key)) return;
    pendingKeys.current.add(player.key);
    const action = { mode, part, status: "queued" };
    setPending((previous) => ({ ...previous, [player.key]: action }));
    const task = queue.current.then(async () => {
      if (!mounted.current) return;
      setPending((previous) => ({
        ...previous,
        [player.key]: { ...action, status: "running" },
      }));
      setError("");
      try {
        const result = await perform();
        if (mounted.current) {
          if (mode === "save")
            setRoom((previous) => ({
              ...previous,
              players: previous.players.map((entry) =>
                entry.key === player.key &&
                cosmeticKey(entry.data) === cosmeticKey(player.data)
                  ? {
                      ...entry,
                      alreadySaved: true,
                      canSave: false,
                      savedPresetId: result.presetId,
                    }
                  : entry,
              ),
            }));
          if (mode === "subscribe" && result.subscribed)
            setRoom((previous) => ({
              ...previous,
              players: previous.players.map((entry) =>
                entry.key === player.key
                  ? {
                      ...entry,
                      parts: {
                        ...entry.parts,
                        [part]: {
                          ...entry.parts?.[part],
                          subscribed: true,
                          canSubscribe: false,
                          temporary: false,
                        },
                      },
                    }
                  : entry,
              ),
            }));
          onNotice?.(result.message);
          await onCopied?.(result);
        }
      } catch (e) {
        if (mounted.current) setError(e.message);
      } finally {
        pendingKeys.current.delete(player.key);
        if (mounted.current)
          setPending((previous) => {
            const next = { ...previous };
            delete next[player.key];
            return next;
          });
      }
    });
    queue.current = task.catch(() => {});
    return task;
  }
  function act(player, mode, part) {
    const destination = targetPlayer;
    return enqueue(player, mode, part, () =>
      request("copy-lobby-preset", {
        key: player.key,
        mode,
        ...(mode === "quick" ? { player: destination } : {}),
        ...(part ? { part } : {}),
      }),
    );
  }
  function subscribe(player, kind) {
    return enqueue(player, "subscribe", kind, () =>
      request("subscribe-lobby-part", {
        key: player.key,
        kind,
      }),
    );
  }
  function canCopy(player, kind) {
    const part = kind && player.parts?.[kind];
    return (
      !locked &&
      !pending[player.key] &&
      !readError &&
      connected &&
      (kind ? (part?.canCopy ?? player.canCopy) : player.canCopy)
    );
  }
  function alreadySaved(player) {
    return (
      player.alreadySaved ||
      state.presetState?.presets?.some(
        (preset) => cosmeticKey(preset.data) === cosmeticKey(player.data),
      )
    );
  }
  function inspect(player) {
    setSelectedKey(player.key);
    setPreviewOpen(true);
    if (window.matchMedia?.("(max-width: 1000px)").matches)
      inspector.current?.scrollIntoView?.({
        block: "start",
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")
          .matches
          ? "instant"
          : "smooth",
      });
  }

  return (
    <section className="lobby-page" aria-labelledby="lobby-heading">
      <header className="lobby-heading">
        <div>
          <h1 id="lobby-heading">Lobby setups</h1>
          <p>Try a racer’s setup now, or save it to your collection.</p>
        </div>
        <div className="lobby-toolbar">
          <label className="lobby-target">
            Quick copy to
            <select
              aria-label="Local saved Quick Setup slot"
              value={targetPlayer}
              disabled={locked}
              onChange={(e) => setTargetPlayer(Number(e.target.value))}
            >
              {quickPlayers.map((p) => (
                <option key={p.player} value={p.player}>
                  Local slot {p.player + 1} · Quick Setup
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={locked || refreshing || Object.keys(pending).length > 0}
            onClick={refresh}
          >
            <ReloadIcon aria-hidden="true" />
            {refreshing ? "Refreshing…" : "Refresh players"}
          </button>
          {loadModel && (
            <button
              aria-expanded={previewOpen}
              onClick={() => setPreviewOpen((open) => !open)}
            >
              {previewOpen ? "Hide interactive 3D" : "Show interactive 3D"}
            </button>
          )}
        </div>
      </header>
      {(error || readError) && (
        <p role="alert" className="inline-error">
          {error || readError}
        </p>
      )}
      <p className="hint lobby-connection" role="status">
        {room.status === "loading"
          ? "Reading the current game lobby…"
          : room.message ||
            `${room.players.length} players · ${room.online ? "Online" : "Local"} ${room.inRace ? "race" : "lobby"} · Updates automatically`}
      </p>
      {room.warning && (
        <p className="hint" role="status">
          {room.warning}
        </p>
      )}
      {room.settings && (
        <details className="lobby-game-settings">
          <summary>Game download settings</summary>
          <dl>
            {[
              [
                "autoDownloadTracks",
                "Lobby tracks",
                "Automatically download Workshop tracks needed by a lobby.",
              ],
              [
                "autoDownloadPresets",
                "Player customizations",
                "Automatically download other racers’ Workshop characters, vehicles and wheels.",
              ],
              [
                "keepAutoDownloaded",
                "Keep automatic downloads",
                "Keep automatically subscribed Workshop items after leaving the lobby. When off, the game can remove temporary subscriptions.",
              ],
            ]
              .filter(([key]) => typeof room.settings[key] === "boolean")
              .map(([key, label, help]) => (
                <div key={key}>
                  <dt>
                    {label}
                    <strong>{room.settings[key] ? "On" : "Off"}</strong>
                  </dt>
                  <dd>{help}</dd>
                </div>
              ))}
          </dl>
          <p className="hint">
            These are the game’s current settings. Garage shows public lobby
            appearances; account identifiers stay private.
          </p>
        </details>
      )}
      {!!room.players.length && (
        <div
          className={`lobby-workspace${loadModel && previewOpen ? " with-viewer" : ""}`}
        >
          <div className="lobby-player-grid">
            {room.players.map((player) => (
              <article
                className={`lobby-player${selected?.key === player.key ? " is-inspected" : ""}`}
                key={player.key}
                aria-label={`${playerName(player)} setup`}
              >
                <header>
                  <PersonIcon aria-hidden="true" />
                  <h2>{playerName(player)}</h2>
                  <span className="hint">
                    {player.local
                      ? "You"
                      : player.ai
                        ? "CPU"
                        : `P${Number.isInteger(player.player) ? player.player + 1 : "?"}`}
                  </span>
                  {loadModel && (
                    <button
                      className="icon-button lobby-inspect"
                      aria-label={`View ${playerName(player)}’s full 3D setup`}
                      aria-pressed={selected?.key === player.key && previewOpen}
                      title="View full 3D setup"
                      onClick={() => inspect(player)}
                    >
                      <EyeOpenIcon aria-hidden="true" />
                    </button>
                  )}
                </header>
                {loadModel && (
                  <LobbySetupImage
                    snapshots={snapshots}
                    data={player.data}
                    revision={appearance?.revision}
                    loading={appearance?.loading}
                    name={playerName(player)}
                    onInspect={() => inspect(player)}
                  />
                )}
                <div className="lobby-appearance-parts">
                  {slots.map(([label, kind, field]) => {
                    const info = player.parts?.[kind];
                    const item =
                      info?.configId !== undefined
                        ? appearance?.items?.[kind]?.[info.configId]
                        : itemInfo(
                            player.data,
                            kind,
                            field,
                            appearance,
                            player.data.bUsingModdedVersion === false
                              ? "original"
                              : "modded",
                          );
                    const installed = info?.installed ?? Boolean(item);
                    const subscribing =
                      pending[player.key]?.mode === "subscribe" &&
                      pending[player.key]?.part === kind;
                    const subscriptionLabel = info?.subscribed
                      ? `${label} subscribed`
                      : `Subscribe to ${playerName(player)}’s ${label.toLowerCase()}`;
                    return (
                      <div key={kind} className="lobby-part">
                        {item?.image || !info?.previewUrl ? (
                          <PresetPreview
                            source={item?.image}
                            loadImage={loadImage}
                            alt={item?.label || label}
                          />
                        ) : (
                          <span className="preset-preview lobby-package-preview">
                            <img
                              src={info.previewUrl}
                              alt="Workshop package preview"
                              referrerPolicy="no-referrer"
                              loading="lazy"
                            />
                            <small>Package preview</small>
                          </span>
                        )}
                        <span className="lobby-part-copy">
                          <small>{label}</small>
                          <strong title={item?.label || info?.label}>
                            {item?.label ||
                              info?.label ||
                              "Appearance unavailable locally"}
                          </strong>
                          {info?.fallback ? (
                            <small
                              className={
                                [-1, 0].includes(info.requestedConfigId)
                                  ? undefined
                                  : "lobby-missing"
                              }
                            >
                              {[-1, 0].includes(info.requestedConfigId)
                                ? "Original appearance"
                                : "Using original · mod unavailable"}
                            </small>
                          ) : info?.checking ? (
                            <small>Checking installed content…</small>
                          ) : (
                            !installed && (
                              <small className="lobby-missing">
                                Not installed
                              </small>
                            )
                          )}
                        </span>
                        <button
                          className="icon-button"
                          disabled={!canCopy(player, kind)}
                          aria-label={`Copy ${playerName(player)}’s ${label.toLowerCase()} to Quick Setup`}
                          title={
                            info?.reason ||
                            `Use this ${label.toLowerCase()} in your saved local Quick Setup slot ${targetPlayer + 1}`
                          }
                          onClick={() => act(player, "quick", kind)}
                        >
                          <CopyIcon aria-hidden="true" />
                        </button>
                        <button
                          className="icon-button lobby-workshop"
                          aria-label={subscriptionLabel}
                          disabled={
                            locked ||
                            !!pending[player.key] ||
                            !info?.canSubscribe ||
                            info?.subscribed
                          }
                          title={
                            info?.reason ||
                            (info?.workshopId
                              ? `Workshop item ${info.workshopId}${info.subscribed ? " · subscribed" : ""}`
                              : "No Workshop page was supplied for this item")
                          }
                          onClick={() => subscribe(player, kind)}
                        >
                          {subscribing ? (
                            <ReloadIcon
                              className="lobby-spinning"
                              aria-hidden="true"
                            />
                          ) : (
                            <ExternalLinkIcon aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="lobby-player-actions">
                  <button
                    className="primary"
                    disabled={!canCopy(player)}
                    title={`Apply to your saved local Quick Setup slot ${targetPlayer + 1}. This does not edit another online player.`}
                    onClick={() => act(player, "quick")}
                  >
                    <CopyIcon aria-hidden="true" />
                    {pending[player.key]?.mode === "quick" &&
                    !pending[player.key]?.part
                      ? pending[player.key].status === "queued"
                        ? "Queued…"
                        : "Copying…"
                      : "Copy preset"}
                  </button>
                  <button
                    disabled={
                      locked ||
                      !!pending[player.key] ||
                      alreadySaved(player) ||
                      !!readError ||
                      !connected ||
                      !(player.canSave ?? player.canCopy)
                    }
                    title="Add a new preset to All presets"
                    onClick={() => act(player, "save")}
                  >
                    <DownloadIcon aria-hidden="true" />
                    {alreadySaved(player)
                      ? "Saved to presets"
                      : pending[player.key]?.mode === "save"
                        ? pending[player.key].status === "queued"
                          ? "Queued…"
                          : "Saving…"
                        : "Save preset"}
                  </button>
                  {player.ai && player.canEditCpu === true && onEditPlayer && (
                    <button
                      disabled={locked || !!pending[player.key]}
                      onClick={() => onEditPlayer(player)}
                    >
                      Edit CPU setup
                    </button>
                  )}
                  {player.local &&
                    player.canEdit === true &&
                    Number.isInteger(player.localPlayerTarget) &&
                    onEditPlayer && (
                      <button
                        disabled={locked || !!pending[player.key]}
                        onClick={() => onEditPlayer(player)}
                      >
                        Edit your setup
                      </button>
                    )}
                </div>
              </article>
            ))}
          </div>
          {loadModel && selected && previewOpen && (
            <aside
              className="lobby-inspector"
              ref={inspector}
              aria-label="Selected player 3D setup"
            >
              <header>
                <div>
                  <small>Full setup</small>
                  <h2>{playerName(selected)}</h2>
                </div>
                {previewOpen && (
                  <div
                    className="view-switch"
                    aria-label="Lobby appearance view"
                  >
                    {["effective", "original"].map((mode) => (
                      <button
                        key={mode}
                        aria-pressed={view === mode}
                        onClick={() => setView(mode)}
                      >
                        {mode === "effective" ? "In game" : "Original"}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  className="lobby-preview-toggle"
                  aria-expanded={previewOpen}
                  onClick={() => setPreviewOpen((open) => !open)}
                >
                  {previewOpen ? "Hide preview" : "Show 3D preview"}
                </button>
              </header>
              {previewOpen && (
                <Suspense
                  fallback={
                    <p role="status" className="preview-loading">
                      Loading 3D viewer…
                    </p>
                  }
                >
                  <ModelViewer
                    kind="setup"
                    preset={selected.data}
                    view={view}
                    loadModel={loadModel}
                    refreshModels={refreshModels}
                    revision={appearance?.revision || ""}
                    assetsLoading={appearance?.loading}
                  />
                </Suspense>
              )}
              {previewOpen && (
                <p className="hint">
                  One interactive preview at a time keeps the lobby light.
                  Select the eye on another player to compare.
                </p>
              )}
            </aside>
          )}
        </div>
      )}
      {!room.players.length &&
        room.status !== "loading" &&
        room.status !== "error" && (
          <div className="lobby-empty">
            <PersonIcon aria-hidden="true" />
            <h2>Your next favorite could be in this lobby</h2>
            <p>
              Join a race lobby in the game. Player setups stay available here
              during the race, without a plugin.
            </p>
          </div>
        )}
      {!!room.players.length && (
        <p className="hint lobby-help">
          Copy preset changes only your saved local Quick Setup slot, never
          another online player. Save preset adds a new entry to All presets.
          Other racers are unchanged. Matching cosmetic content must be
          installed.
        </p>
      )}
    </section>
  );
}
