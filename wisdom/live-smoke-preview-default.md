# Live PR smoke: Preview startup

## Diagnosis / evidence

Run [37327174526](https://github.com/tnfssc/github-html-preview/actions/runs/37327174526) failed at `smoke/live.spec.ts:120` because the test expected Code on a fresh profile. Read all three failed-attempt traces/error contexts under `/tmp/html-preview-ci-37327174526/test-results` before changing the test. Their snapshots show the rich container visible, both Before/After sandbox iframes rendered, and `.js-file-content` explicitly hidden with `display: none !important`. The trace reaches the Code visibility assertion without clicking a view tab; this is not a GitHub loading timeout.

Release #24 (`945d536`) intentionally made Preview the no-saved-choice default: `comparisonPreferencesStorage` falls back to `mode: 'split'` and the PR entrypoint automatically renders that mode. See [HTML view startup](html-view-startup.md). No product defect was found; restore neither the old startup default nor test-only storage seeding.

## Fix

The live smoke now checks automatic Preview selection and hidden source, explicitly selects Code and verifies the real source diff is visible and Preview hidden, then selects Preview again. All existing before/after rendering, executable guessing-game, synchronized horizontal/vertical scroll, lightweight chrome, unique controls, and final Code recovery checks remain. No skips, retries, timeouts, or product behavior changed. Existing deterministic PR loading and browser preference tests cover this intended startup contract; no new product regression is needed for a test-only correction.

## Checks / gaps

Using `corepack pnpm`:

- Frozen dependency install, production build, and typecheck passed.
- Focused PR/blob preference unit tests: 18 passed.
- Focused browser checks: authenticated PR source/rich controls and PR choice persistence, 2 passed (`/tmp/html-preview-ci-37327174526/fixed-e2e`).
- Full live smoke: 3 passed, no skips/retries (`/tmp/html-preview-ci-37327174526/fixed-live`), including repository CSS/SPA navigation and executable PR comparisons.
- Full unit suite: 98 passed (11 files). A nonfatal es-module-lexer asm.js warning appeared.

Live GitHub can still change its DOM or experience outages; this fixes a stale startup assumption, not every remote compatibility issue. No extension release/version bump is needed for this test/docs-only change. Nothing pushed and no PR opened; parent handles push, PR, checks, and merge.

Worktree: `/home/tnfssc/.bruv/worktrees/t3code-7d9c2dbf-d4d936df1f38-task_bf77adec`.
Values unchanged: existing trace-first guidance applies.
