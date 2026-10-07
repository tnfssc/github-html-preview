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
