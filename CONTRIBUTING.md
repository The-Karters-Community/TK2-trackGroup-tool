# Contributing

Follow the root README for setup. This repository is independent of TK2-Mod-SDK. Keep UI, save handling, and Steam code separate; do not add a general plugin framework or ship game files.

## Submit a group

1. Create and order the custom group in the game. Close the game and connect Steam in this app.
2. Export from **My groups**. Correct unresolved Workshop dependencies first.
3. Copy the export into `catalog/<group-id>.tk2group.json`. Preserve its ID and order; optionally add a concise description.
4. Run `python tools/check_catalog.py --write-index` to normalize JSON line endings and regenerate filenames/checksums in `catalog/index.json`. For an existing group, keep its ID and increase `revision` when changing its name/order/dependencies. The index and format versions remain 1.
5. Run `python tools/check_catalog.py` and tests, then submit a pull request. Include evidence that dependencies are public compatible tracks and match their internal mod IDs.

CI validates allowed fields, ordered references, IDs, dependency types, uniqueness, and checksums. CI cannot authenticate to Steam: maintainers must review live availability before merging. Never include profiles, account identifiers, upload keys/passwords, or track bundles.

## Verification

Automated tests cover codec preservation, imports, rollback, dependency rejection, authenticated API, and UI behavior. Real-account testing must additionally exercise Steam metadata, subscription/download callbacks, save agreement, and an import after restarting the game. Record limitations; mocks are not live integration proof.

Only build 0.1.4.18 supports writes. Obtain fresh evidence and preservation tests before enabling another build. Keep saves and backups outside Git.

## Builds and releases

`python tools/build_portable.py` builds without publishing. `trackgroups/__init__.py` owns the version; keep `package.json` consistent. Development remains `0.1.0-dev` until a release is requested. Do not bump for routine edits or publish automatically. Release the entire portable folder as ZIP with a SHA-256. Test from a relocated path without source dependencies, close it, and verify its folder can be removed.
