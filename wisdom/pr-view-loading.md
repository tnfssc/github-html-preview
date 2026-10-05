# PR HTML view loading

- Wait for saved comparison preferences before mounting PR controls, including SPA route events during bootstrap. Preview is the no-saved-choice default (the shared storage fallback is owned separately).
- Only explicit Code/Preview or toolbar changes save preferences. Update the in-memory cache immediately and watch storage for later PR mounts; automatic Preview activation must not synthesize a click or write a default.
- Show one loading status, not empty Before/After panes. Layout follows successfully rendered sides, including cached previews, retries, and resize. Modified files still compare both sides; added/deleted files show only the existing side.
- Reuse available embedded or cached file metadata to skip nonexistent source requests and fetch renamed base files at their old path. Do not put a new files-API round trip in front of every modified preview. Code-only cards no longer prefetch comparison metadata.
- Reject embedded PR metadata when its supplied PR number differs from the route; match comparison SHAs before adopting embedded file status. Payloads without PR identity remain an existing GitHub integration gap, not proof against every stale SPA payload.

## Checks and gaps

Deterministic PR entrypoint tests cover delayed preference bootstrap, explicit choices across SPA PRs, external storage updates, added/deleted loading and source counts, normal modified comparisons, rapid Code → Preview cancellation, and identified stale PR payloads. Browser e2e should also verify fresh storage defaults and persistence across full navigation, iframe rendering, and resize. File status unavailable locally still falls back to a source fetch and error-driven metadata lookup; large-PR API pagination and lazy/offscreen preview scheduling are unchanged.
