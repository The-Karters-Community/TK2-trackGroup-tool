import { useState } from "react";
import { DownloadIcon, CheckIcon } from "@radix-ui/react-icons";
import { download } from "./download.js";

export default function SaveDownloads({ source, profile, onHelp }) {
  const [backup, setBackup] = useState(false);
  const [ready, setReady] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  return (
    <section className="web-downloads" aria-label="Download edited save">
      <div>
        <strong>Your edited save is ready</strong>
        <p>Keep a backup, then replace the original file with your download.</p>
      </div>
      <div className="web-download-actions">
        <button
          onClick={() => {
            download(`${source.filename}.backup`, source.bytes);
            setBackup(true);
          }}
        >
          {backup ? <CheckIcon /> : <DownloadIcon />}Download original backup
        </button>
        <label className="web-check">
          <input
            type="checkbox"
            checked={ready}
            onChange={(e) => setReady(e.target.checked)}
          />
          Game closed · Steam Cloud disabled for this game
        </label>
        <button
          className="primary"
          disabled={!backup || !ready}
          onClick={() => {
            download(source.filename, profile.original);
            setDownloaded(true);
          }}
        >
          <DownloadIcon />
          Download edited save
        </button>
      </div>
      {downloaded && (
        <p className="notice" role="status">
          Replace the original save in the folder you selected it from. Keep its
          exact filename; remove any “(1)” added by your browser. Launch the
          game with Steam Cloud still disabled to verify your groups.
        </p>
      )}
      <button className="text-button" onClick={onHelp}>
        Show where to put the save
      </button>
    </section>
  );
}
