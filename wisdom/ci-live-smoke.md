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
