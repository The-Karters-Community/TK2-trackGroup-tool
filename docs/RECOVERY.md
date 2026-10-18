# Save recovery

Failures before saving leave the profile untouched. Failed writes restore the original copies when no external save has intervened. Completed subscriptions stay subscribed.

Changed imports retain `%LOCALAPPDATA%\TK2 Track Groups\backups\<timestamp>\original.save` and `transaction.json`, with hashes and state:

- `committed`: both copies verified.
- `rolled-back`: original retained/restored.
- `prepared` or `recovery-required`: interrupted or restoration unconfirmed. **Keep the game closed.**

For interrupted operations or recovery-required:

1. Keep the backup/journal. Copy the current local profile elsewhere too; do not immediately replace it with an old save.
2. Inspect the journal's profile path and errors. Concurrent saves may contain newer progress. Do not discard that progress or edit `remotecache.vdf`.
3. Fix Steam connection/account, permissions, or file locks. Compare current-copy hashes against `originalHash` and `importedHash`.
4. Ask a maintainer to reconcile copies through Steam Remote Storage, preserving unrelated fields. Share journal/error text first; full saves contain private data and must not be posted publicly.
5. Refresh Steam. Import only when copies agree and the supported profile decodes correctly.

## Running-game library transactions

A journal with `mode: live-library` follows a different recovery path. Its
`original.save` is retained evidence, **not a file to restore over a running
game**. New race progress, Quick Setup slots and settings may have changed since
that backup.

Garage changes only the saved-preset list and group containers on the game's
thread. It compares both complete collections with the reviewed baseline before
assignment, lets the game serialize/save, then verifies memory, local and Steam
copies. An uncertain acknowledgement is checked before any retry.

On failure, Garage reads the current collections using native operation 6. Only
when they exactly match the attempted result may operation 5 replace those two
collections with the original ones. It never restores a whole profile while the
game runs. An external collection change stops automatic recovery and retains
the journal for reconciliation. Resolve that journal before another library
write; keep both the current save and safety copy.

Without an interrupted import, use the game's normal Steam synchronization/conflict UI and reconnect. The app stops rather than choosing conflicting saves.
