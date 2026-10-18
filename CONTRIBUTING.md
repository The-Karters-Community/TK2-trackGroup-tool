# Contributing

Use Python 3.14 x64, Node.js 24 and npm for source development. This repository is independent of TK2-Mod-SDK. Keep UI, save handling, and Steam code separate; do not add a general plugin framework or ship game files.

## Source setup

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
npm ci
npm run build
.venv\Scripts\python.exe launch.py
```

For UI development, start `python launch.py --no-window`, then `npm run dev`.
Vite reads the local session and proxies the API at `http://127.0.0.1:5173`.
Python changes require a backend restart. UI changes reload automatically.
Native integration contributors need Visual Studio C++ x64 Build Tools;
`python tools/build_native_bridge.py` compiles the authored bridge.

Run `python -m unittest discover -s tests`, `python tools/check_catalog.py`,
`npm test`, `npm run format:check`, and `npm run build` before committing.
On Windows, also run `python tools/check_native_contracts.py`.

## Submit a group

1. Create and order the custom group in the game. Close the game and connect Steam in this app.
2. Export from **My groups**. Correct unresolved Workshop dependencies first.
3. Copy the export into `catalog/<group-id>.tk2group.json`. Preserve its ID and order; optionally add a concise description.
4. Run `python tools/check_catalog.py --write-index` to normalize JSON line endings and regenerate filenames/checksums in `catalog/index.json`. For an existing group, keep its ID and increase `revision` when changing its name/order/dependencies. The index and format versions remain 1.
   Each index entry has a reviewed `category`: `speedrun` or `community`. New entries default to `community`; maintainers review Speedrun.com category membership before labeling them `speedrun`. Category labels belong to the catalog index, not the portable group file, so local imports cannot claim official category status. Regenerating the index preserves existing labels.
5. Run `python tools/check_catalog.py` and tests, then submit a pull request. Include evidence that dependencies are public compatible tracks and match their internal mod IDs.

CI validates allowed fields, ordered references, IDs, dependency types, uniqueness, and checksums. CI cannot authenticate to Steam: maintainers must review live availability before merging. Never include profiles, account identifiers, upload keys/passwords, or track bundles.

## Verification

Automated tests cover codec preservation, imports, rollback, dependency rejection, authenticated API, and UI behavior. Real-account testing must additionally exercise Steam metadata, subscription/download callbacks, save agreement, and an import after restarting the game. Record limitations; mocks are not live integration proof.

Runtime metadata determines compatibility; do not add patch-number or binary-hash allowlists. Keep typed contract checks and preservation tests. Keep saves and backups outside Git.

## Builds and releases

`python tools/build_portable.py` builds without publishing. `trackgroups/__init__.py` owns the version; keep `package.json` consistent. This release is `0.1.1`, following stable `0.1.0`. Do not bump for routine edits or publish automatically. Release the entire portable folder as ZIP with a SHA-256. Test from a relocated path without source dependencies, close it, and verify its folder can be removed.

For the browser edition, use `npm run dev:web` without launching Python. Build with `npm run build:web` and check with `python tools/check_web_build.py`. Pages deploys verified source from `main` independently of desktop releases. Keep save data in browser memory; do not add profile uploads or Steam account credentials. See [browser development and evidence](docs/WEB.md).
