import { useCallback, useEffect, useRef, useState } from "react";
import { CopyIcon, ReloadIcon, PersonIcon } from "@radix-ui/react-icons";
import { api } from "../api.js";
import PresetPreview from "../presets/PresetPreview.jsx";
import { slots, itemInfo } from "../presets/appearance.js";
import "./Lobby.css";

export default function Lobby({
  state,
  busy = false,
  request = api,
  loadImage,
  onCopied,
  onNotice,
}) {
  const [room, setRoom] = useState({ status: "loading", players: [] });
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  const polling = useRef(false);
  const appearance = state.presetState?.appearance;
  const refresh = useCallback(async () => {
    if (pending || busy || polling.current || document.hidden) return;
    polling.current = true;
    setRefreshing(true);
    try {
      const value = await request("lobby", {});
      if (mounted.current) {
        setRoom(value);
        setError("");
      }
    } catch (e) {
      if (mounted.current) {
        setError(e.message);
        setRoom((previous) => ({
          ...previous,
          status: "error",
          message: "Could not refresh the lobby. Try Refresh players.",
        }));
      }
    } finally {
      polling.current = false;
      if (mounted.current) setRefreshing(false);
    }
  }, [request, pending, busy]);
  useEffect(() => {
    mounted.current = true;
    refresh();
    const timer = setInterval(refresh, 4000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [refresh]);
  async function copy(player) {
    setPending(player.key);
    setError("");
    try {
      const result = await request("copy-lobby-preset", { key: player.key });
      if (mounted.current) {
        onNotice?.(result.message);
        onCopied?.(result);
      }
    } catch (e) {
      if (mounted.current) setError(e.message);
    } finally {
      if (mounted.current) setPending("");
    }
  }
  return (
    <section className="lobby-page" aria-labelledby="lobby-heading">
      <header className="lobby-heading">
        <div>
          <h1 id="lobby-heading">Lobby setups</h1>
          <p>Find a setup you like. Copy it straight into All presets.</p>
        </div>
        <button disabled={busy || !!pending || refreshing} onClick={refresh}>
          <ReloadIcon aria-hidden="true" />
          {refreshing ? "Refreshing…" : "Refresh players"}
        </button>
      </header>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <p className="hint lobby-connection" role="status">
        {room.status === "loading"
          ? "Reading the current game lobby…"
          : room.message ||
            `${room.players.length} players · ${room.online ? "Online" : "Local"} lobby · Updates automatically`}
      </p>
      {!!room.players.length && (
        <div className="lobby-player-grid">
          {room.players.map((player) => (
            <article className="lobby-player" key={player.key}>
              <header>
                <PersonIcon aria-hidden="true" />
                <h2>{player.name || (player.ai ? "CPU racer" : "Racer")}</h2>
                <span className="hint">
                  {player.local
                    ? "You"
                    : player.ai
                      ? `CPU${Number.isInteger(player.player) ? " " + player.player : ""}`
                      : `Player${Number.isInteger(player.player) ? " " + (player.player + 1) : ""}`}
                </span>
              </header>
              <div className="lobby-appearance-parts">
                {slots.map(([label, kind, field]) => {
                  const item = itemInfo(player.data, kind, field, appearance);
                  return (
                    <div key={kind}>
                      <PresetPreview
                        source={item?.image}
                        loadImage={loadImage}
                        alt={item?.label || label}
                      />
                      <span>
                        <small>{label}</small>
                        <strong>
                          {item?.label || "Appearance not installed"}
                        </strong>
                      </span>
                    </div>
                  );
                })}
              </div>
              <button
                className="primary"
                disabled={
                  !player.canCopy ||
                  busy ||
                  !!pending ||
                  !!error ||
                  !state.steamConnected ||
                  !state.cloudEnabled
                }
                onClick={() => copy(player)}
              >
                <CopyIcon aria-hidden="true" />
                {pending === player.key
                  ? "Copying…"
                  : player.local
                    ? "Your current setup"
                    : "Copy & save preset"}
              </button>
            </article>
          ))}
        </div>
      )}
      {!room.players.length &&
        room.status !== "loading" &&
        room.status !== "error" && (
          <div className="lobby-empty">
            <PersonIcon aria-hidden="true" />
            <h2>Your next favorite could be in this lobby</h2>
            <p>
              Open the game’s race lobby. Player setups appear here without
              installing a plugin.
            </p>
          </div>
        )}
      {!!room.players.length && (
        <p className="hint">
          The source player is unchanged. Matching cosmetic content must be
          installed in your game before copying.
        </p>
      )}
    </section>
  );
}
