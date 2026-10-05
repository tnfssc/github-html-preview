# Blob view choice

- Load `blobViewModeStorage` with enabled state before mounting; its Preview fallback is not written back. Only explicit Preview/native tab clicks save a choice. Update the in-memory choice first so pending writes cannot reset navigation or remounts.
- Keep GitHub’s native tab state intact. Reuse the existing route/source extraction checks; retained metadata from another file still triggers a current-route fetch, never an old-source preview.
- Code cancels unfinished source/resource resolution. Each attempt owns its abort controller so an old completion cannot render or clear a newer attempt. Already rendered previews remain hidden and reusable on Code.
- Coalesce mutation reconciliation in one 80 ms window instead of continually postponing it, and scan added nodes without allocating copies (skip the scan if disconnected). Remove snapshots whose saves finish after teardown to avoid leaking session storage.
- Focused jsdom tests cover delayed initialization/writes, native Code, navigation/remounts, stale source, cancellation, and snapshot cleanup. They mock executable rendering; parent-owned extension e2e supplies browser integration coverage. No live GitHub validation or cross-tab preference synchronization; same-path ref/source limitations remain as described in values.md.
