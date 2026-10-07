# Scoped HTML Retry

## Design

HTML documents are the product, not cache management. Keep successful previews quiet and the existing failure-only Retry; no extra visible controls or permissions.

Explicit document Retry passes refresh: true through source fetching and one resolver invocation. Repository fetches use native cache: 'reload': bypass the HTTP cache for these requests and let the browser update those entries. Normal loads omit the cache override. No browser/origin/repository clearing, browsingData, CacheStorage sweep, persisted registry, or URL query cache-buster is used. The existing resolution-local request deduplication, concurrency, aborts, and byte/depth/output limits remain.

Blob Retry must ignore embedded sourceHtml and fetch the selected HTML again at its existing exact ref. Failed fresh requests do not fall back to old source. The previous render/snapshot is replaced only for that route.

PR Retry destroys only that card's base/head renders and refreshes their HTML and dependencies (including renamed-base fallback). Keep the card's comparison commits and shared route metadata/in-flight promises; do not reset them to refresh content. Metadata failure promises already clear themselves. Another card can finish while Retry runs.

The normal public resolver rewrites some assets to browser-loaded CDN URLs. A Retry cannot set their request cache mode through HTML attributes, and a query on an entry URL would not propagate to CSS/module descendants. For a public sandbox Retry, reuse the existing packaging traversal, fetching repository CSS imports, CSS images/fonts, attributes/srcset and script/module descendants with the same reload policy and embedding the results. Public/private transport selection is independent of packaging: public requests still omit credentials; private requests still use only the signed-in GitHub-tab session transport. Exact refs are unchanged. A literal dynamic-import regression exposed dropped quotes in lexer replacements; preserve quotes for those spans so packaged dynamic descendants actually execute.

## Limits and full preview

- This refreshes the statically discoverable, loader-supported repository graph, within existing resource/depth/byte limits. Literal module imports are packaged; computed dynamic imports are diagnosed, not guessed. Runtime fetch/XHR, runtime-created URLs, external authored resources and their descendants are not under this per-resolution repository-fetch policy. Do not claim arbitrary external/dynamic traffic is fully refreshed. Nested iframe documents are not recursively resolved as HTML graphs.
- Shared dependency URLs are legitimately refreshed when used by the selected document. Unrelated URLs retain their normal cache policy; this is not a separate cache partition for each HTML file. Upstream servers/CDNs may still return old content even after a fresh browser fetch.
- Full preview loads a session-stored resolved snapshot, rather than repository source. Its existing error-only Retry reloads that package, not a document network Retry. Missing/expired snapshots already direct the reader back to GitHub. Keep this behavior: fetching private source from an extension-origin page would break the GitHub-session boundary. Use the GitHub document's Retry and reopen full preview for freshly packaged content; opening/reloading an old snapshot is not a freshness guarantee. No new cross-tab broker is needed.

## Checks

- corepack pnpm test: extension build and **102 unit tests passed**.
- corepack pnpm exec tsc --noEmit and git diff --check: passed.
- corepack pnpm test:e2e: extension build and **25 Chromium E2E tests passed**, including existing public/private full-preview and PR Retry tests.
- Focused cache-model regression primes two documents, changes server content, then verifies only the selected source/CSS imports/images/fonts/static and literal-dynamic modules use reload and contain fresh bytes. An unrelated document retains old cached source and default fetch policy; normal public URL rewriting remains.
- Blob controller regression rejects stale embedded source on Retry. PR regression changes embedded commit metadata during Retry and holds another card in flight: original base/head refs remain pinned and unrelated work is not aborted/re-fetched. Private transport regression verifies reload without public requests or credential leakage.
- Browser regression uses existing routed fixtures, executes both static/literal-dynamic module descendants, checks fresh source/CSS/image output, exact requested graph, failure-only Retry disappearance, and an unrelated document. CDP observes the extension isolated world's native fetch init without changing its policy: every selected Retry request uses reload. Playwright routing disables Chromium HTTP caching, so this is a request-policy/rendering integration test, **not** a real disk-cache eviction test; the deterministic unit cache model supplies the stale/fresh proof.
- Earlier unnecessary xvfb wrapper runs reported successful Playwright checks but failed during wrapper cleanup; the harness already uses Chromium's new headless mode. The final direct run above exited zero. The existing es-module-lexer asm.js warning is nonfatal; unit assertions pass.

## Provenance

- Inherited commit: 1ccd8786c8fc2e14651f36c8189b1929aff5f68c.
- Worktree: /home/tnfssc/.bruv/worktrees/t3-7864b6d9-d4d936df1f38-task_1e568cb6.
- Branch: fix/scoped-html-retry.
- Parent owns integration/release. No push, PR, merge, release-version change, or release. Existing advice/wisdom files are untouched.


## SVG packaging review fix (0.6.7)

- The Retry/private packaging traversal now includes SVG `<image href>` and `<image xlink:href>`. Repository images use the existing bounded, per-resolution deduplicated loader, so explicit Retry requests use `cache: 'reload'` with the original exact ref and public/private transport. The normal public browser-loaded path is unchanged. Updating attribute nodes retains authored SVG/xlink namespaces; local fragments and external URLs are retained, including SVG image view fragments after embedding.
- Do **not** embed external `<use>` targets as data URLs: Chromium in the actual opaque-origin preview sandbox renders no geometry for `<use href="data:…#box">`, while inline `#box` targets render. Repository-file `use` references (both href spellings) are explicitly omitted by the packaging path with `svg-use-not-packaged` diagnostics, not fetched or claimed refreshed. The diagnostic tells authors to embed symbols in the HTML and use `href="#symbol"`, or use an `<image>` with a standalone SVG. Arbitrary external-host URLs and authored data URLs remain unchanged and outside Retry freshness; cross-origin external `use` also did not render in Chromium. No sprite-import engine, new permission/control, public private-resource fallback, or cache-wide clearing was added.
- Focused checks: `corepack pnpm exec vitest run tests/resolveHtml.test.ts` (**23 passed**), `corepack pnpm exec tsc --noEmit`, and `git diff --check` passed. New unit regressions cover both SVG image attributes, namespace retention, view/local fragments, external URL preservation, normal public behavior, reload/deduplication/exact refs with both transports, byte-limit failures, and actionable external-use diagnostics.
- `corepack pnpm test:e2e --grep "Retry freshens|Retry diagnoses"`: extension build and **2 Chromium tests passed**. The selected-document graph now includes a valid SVG diagram, checks actual image load events for href/xlink:href, fresh SVG bytes, local-use geometry, one reload fetch for the shared SVG, and untouched unrelated work. The external-use regression checks the displayed author guidance, omitted repository references, unchanged authored external/data URLs, and actual zero-vs-nonzero browser geometry. Routed requests remain policy/rendering evidence, not real disk-cache eviction proof.
- Final full validation: `corepack pnpm test` (extension build, **108 unit tests passed**), `corepack pnpm test:e2e` (extension build, **26 Chromium tests passed**), `corepack pnpm exec tsc --noEmit`, and `git diff --check` all exited zero. The existing es-module-lexer asm.js warning remains nonfatal.
- Review-fix base: `d6f231c` (parent's integrated scoped Retry commit). Branch: `fix/scoped-html-retry-svg`. Worktree: `/home/tnfssc/.bruv/worktrees/t3-7864b6d9-d4d936df1f38-task_36737353`. Package remains **0.6.7**; parent owns integration. No push, PR, merge, or release.

## Parent integration proof

Parent integrated both worker commits and repeated type-check, all 108 unit tests, 26 extension E2E tests, and 3 live GitHub smoke tests successfully. Stable and debug 0.6.7 ZIPs built, their package/manifest versions match, and both exact archives passed the blob-preview installation smoke. The SVG browser test checks load events, fresh decoded SVG bytes, and changed screenshots of both modern/legacy SVG image elements. The final two focused Retry tests passed with these rendered-pixel comparisons. They compare before/after in the same run; no platform-specific golden images or new image dependency is needed.

The current environment's normal /home/tnfssc/.local/bin/gh wrapper works. Forcing the older headless config path from github-cli.md reported no login here. Do not print credentials while troubleshooting this difference.

Remaining release steps belong to the parent: final review, PR/CI, merge, then push v0.6.7 at the merged commit. No repository edits after shipping. Release facts go on the PR/release.
