export default function HowTo({ onOpen }) {
  return (
    <section className="settings-page web-help">
      <span className="eyebrow">No installation required</span>
      <h1>From the library to your game</h1>
      <p>
        The website edits a save you choose, entirely in your browser. It cannot
        connect to Steam or write to your game automatically. Garage validates
        the save’s preset and track-group structure before editing. Game patch
        labels do not restrict compatible saves.
      </p>
      <div className="notice">
        <strong>Browser save editing is experimental</strong>
        <p>
          Save preservation and browser downloads have been tested. Applying an
          edited download in the game with Steam Cloud disabled has not yet been
          verified in a live race. Keep your original backup until you have
          checked the result.
        </p>
      </div>
      <ol className="web-steps">
        <li>
          <h2>Close the game and pause Steam Cloud</h2>
          <p>
            Wait for Steam to finish syncing. In your Steam Library, right-click
            The Karters 2 → Properties → General. Disable Steam Cloud for this
            game. Keep it disabled while importing and verifying the result.
          </p>
        </li>
        <li>
          <h2>Open your local save</h2>
          <p>
            Press Win + R, enter{" "}
            <code>
              %USERPROFILE%\AppData\LocalLow\PixelEdgeGames\TheKarters2
            </code>
            , then find your file named{" "}
            <code>&lt;Steam ID&gt;PTK_PlayerData_v19tpp0_bt0</code>. Choose the
            account you play with. Open the original, not a backup or Steam's
            cache files.
          </p>
          <button onClick={onOpen}>Choose game save</button>
        </li>
        <li>
          <h2>Choose a group</h2>
          <p>
            Browse Speedrun groups or open a shared .tk2group.json file. Review
            its numbered tracks. If your save already has the same name,
            explicitly choose whether to update it or add a copy. In My track
            groups, you can also rename and reorder your existing tracks.
          </p>
        </li>
        <li>
          <h2>Subscribe to Workshop tracks</h2>
          <p>
            Use each track's Steam link to subscribe through your signed-in
            Steam account. Let Steam finish downloading before playing. This
            website cannot detect subscriptions, downloads or private/deleted
            items.
          </p>
        </li>
        <li>
          <h2>Download and replace</h2>
          <p>
            Download the original backup first. Download the edited save, then
            manually copy it over the original LocalLow file. Keep the exact
            filename, removing any download suffix such as “(1)”. Do not edit{" "}
            <code>remotecache.vdf</code> or Steam's userdata cache.
          </p>
        </li>
        <li>
          <h2>Verify in the game</h2>
          <p>
            Launch with Steam Cloud still disabled. Check the group name, count,
            track order and playable Workshop tracks, then exit normally. The
            browser cannot reconcile Steam Cloud. If you later enable it again,
            resolve any sync conflict deliberately; an old cloud copy can undo
            your import.
          </p>
        </li>
      </ol>
      <div className="notice">
        <strong>Need to undo?</strong>
        <p>
          Close the game, keep Steam Cloud off, and restore your downloaded
          original backup to its original filename. Profile files never leave
          this tab. Closing or refreshing this page discards edits you haven't
          downloaded.
        </p>
      </div>
    </section>
  );
}
