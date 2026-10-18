import { useEffect, useState } from "react";

export default function Settings({ state, busy, run }) {
  const [game, setGame] = useState(state.settings.game);
  const [profile, setProfile] = useState(state.settings.profile);
  useEffect(() => {
    setGame(state.settings.game);
    setProfile(state.settings.profile);
  }, [state.settings.game, state.settings.profile]);
  return (
    <section className="settings-page">
      <header className="page-heading">
        <span className="eyebrow">Local connections</span>
        <h1>Settings</h1>
        <p>
          Your saves and account stay on this computer. The app shares only the
          group files you choose to export.
        </p>
      </header>
      <div className="settings-section">
        <h2>Game & profile</h2>
        <label>
          Game installation folder
          <input value={game} onChange={(e) => setGame(e.target.value)} />
        </label>
        <p className="hint">
          Folder containing TheKarters2.exe. Garage resolves the installed
          runtime automatically; game patches do not require a version allowlist
          update.
        </p>
        <label>
          Local profile
          <select value={profile} onChange={(e) => setProfile(e.target.value)}>
            <option value="">Choose a profile</option>
            {state.settings.profiles.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <p className="hint path">{state.settings.profileDirectory}</p>
        <button
          className="primary"
          disabled={busy}
          onClick={() => run("settings", { game, profile })}
        >
          Save settings
        </button>
      </div>
      <div className="settings-section">
        <h2>Steam connection</h2>
        <p>
          {state.steamConnected
            ? "Connected to the active Steam account."
            : "Steam has not been verified yet."}
        </p>
        <p>
          Steam must be running, the account must own the game, and Steam Cloud
          must be enabled. Imports can save through the supported running game.
        </p>
        <button disabled={busy} onClick={() => run("refresh", {})}>
          Connect / refresh Steam
        </button>
      </div>
      <div className="settings-section">
        <h2>Live Quick Setup & lobby</h2>
        <p>
          Preview and customize your racer, save Quick Setup while playing, or
          copy a setup from the lobby.
        </p>
        <p className="hint">
          {state.nativeQuickSaveAvailable
            ? "Ready to save while the game is running."
            : "Live saving is unavailable. You can still edit with the game closed."}{" "}
          Changes apply to your next setup selection.
        </p>
      </div>
      <div className="settings-section">
        <h2>App updates</h2>
        <p>
          Installed version: {state.version}. {state.update?.message}
        </p>
        <p className="hint">
          Public releases are checked at startup. Portable updates replace app
          files and restart automatically. Your groups, settings and save
          recovery copies stay in their existing locations.
        </p>
        <button
          disabled={busy || state.update?.state === "checking"}
          onClick={() => run("check-update", {})}
        >
          Check for updates
        </button>
        {state.update?.state === "available" && state.update.portable && (
          <button
            className="primary"
            disabled={busy}
            onClick={() => run("update", {})}
          >
            Update app
          </button>
        )}
      </div>
      <div className="settings-section">
        <h2>Recovery copies</h2>
        <p>
          Every changed save has an original copy and a transaction report.
          Successful subscriptions are retained if an import is cancelled.
        </p>
        <p className="path">{state.settings.dataDirectory}\backups</p>
        <p className="hint">
          Do not restore an old whole profile over newer game progress. Follow
          the recovery guide included with this app.
        </p>
      </div>
    </section>
  );
}
