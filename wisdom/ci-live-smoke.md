# Live smoke: stale blob source after SPA navigation

- Failure: [run 36716035671](https://github.com/tnfssc/html-preview/actions/runs/36716035671), `smoke/live.spec.ts:95`.
- Downloaded `live-github-diagnostics` to `/tmp/html-preview-smoke-36716035671` and inspected its trace/network/error context. GitHub’s new page textarea contained “This is my page”; the executable iframe still contained the previous “Header” document. Its stylesheet was requested from the new file’s directory (404), proving mixed source/route ownership rather than a visibility timeout.
- Cause: current GitHub metadata lives in `payload.codeViewLayoutRoute` (repo, path, refInfo), while styled raw lines remain in `codeViewBlobLayoutRoute.StyledBlob`. GitHub retains initial embedded JSON during SPA navigation, and its cursor textarea can lag the URL. The parser ignored nested metadata and bound stale source to the new URL.
- Fix: read nested layout metadata; when the embedded path differs from the route, discard both embedded/cursor source and stale commit metadata, fetch the current route through existing public/session-only paths, and keep the fallback diagnostic. Matching files still use canonical commits. No smoke assertions, timeouts, skips, sandbox permissions, or retries were weakened.

## Validation

Using `corepack pnpm` (plain `pnpm` was not on PATH):

- Production build and `run compile`: passed.
- `exec vitest run`: 75 tests passed, including ten source-ownership cases across flat/nested payloads and private metadata. Against the original parser, nine of these ten cases failed.
- `exec playwright test --output=/tmp/html-preview-fixed-e2e-results`: 19 passed. Blob fixtures now mirror nested live metadata; SPA regression retains old JSON and old cursor source, verifies one current-route fetch, active Preview, only new content, and unchanged sandbox.
- `exec playwright test --config=playwright.smoke.config.ts --output=/tmp/html-preview-fixed-live-results`: all three live smoke tests passed, including the original line 95 assertion (no network skip).

## Caveats / release

Live GitHub DOM/network may change again. When retained metadata cannot identify the current file, existing URL fallback uses the route ref (not a guaranteed immutable SHA); refs containing unencoded slashes remain ambiguous. This change detects mismatched file paths, not every possible same-path ref/repository navigation race. Session/private handling remains conservative and credential-free.

**Product release needed:** yes; this changes shipped content-script behavior, not just CI. No version/tag was created and nothing was pushed.

- Worktree: `/home/tnfssc/.die/worktrees/html-preview-b71d59ffacdb-task_bbe791b2`
- Branch: `die/fix-live-smoke-failure-bbe791b2`

## Integration

The fix was cherry-picked to `develop` as `215e063`. Version is now `0.6.2` (`3202cd0`). The parent reviewed the parser and regression tests. Local archive checks and GitHub CI/live smoke must pass before the stable tag is pushed. Initial values were drawn from this diagnosis; no older wisdom existed.

## Released 2026-09-30

- Pushed `develop` through `3b3b4a1` and tagged that tested commit as `v0.6.2`.
- GitHub checks passed: CI `36722787427`, unchanged live smoke `36722788136`, nightly `36722787473`, stable release `36723064621`.
- Parent also passed frozen install, typecheck, 75 unit tests, ZIP build, version contract, and exact-ZIP extension smoke.
- Stable release: https://github.com/tnfssc/html-preview/releases/tag/v0.6.2. Asset: `github-html-preview-0.6.2-chrome.zip` (150416 bytes).
- Follow-up: CI debug-artifact reported no ZIP at its upload step even though that job passed; stable/nightly release assets did publish. Actions also warn about Node 20 action runtimes and the coming ubuntu-latest image change. These did not block this release.
- Values: added the small source/route ownership and trace-first checks above. Release review adds no new value. This final note is docs-only and skips CI to avoid another nightly release.
