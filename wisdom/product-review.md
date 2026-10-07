# Product direction — 2026-10-07

The user wants user experience first. The job is reading HTML docs on GitHub without cloning the repo. HTML-only support is enough.

Do not lead with mobile GitHub use, responsive controls, or CSS/JS-only PR support. Those were review ideas the user rejected or deprioritized. A demo link is not a priority if the reading flow is already clear.

Check real documents for readable authored styles, heading links, reading space, and scrolling. These are checks, not confirmed bugs.

## Chosen next step

The user asked to improve Retry. Refresh only the selected HTML document and resources it uses. Leave unrelated documents and browser caches alone. Keep the existing failure-only action; add no cache-clear button or browser-wide cache permission.

Open a PR, merge it after checks, then publish a release. Planned stable version: 0.6.7.

## Implementation and validation

The scoped Retry change and SVG review fix are integrated on t3/product-improvements in /home/tnfssc/.t3/worktrees/gh-html-iframe/t3-7864b6d9. Worker paths, commits, design, and limits are in [scoped HTML Retry](scoped-html-retry.md).

Parent validation passed after the SVG fix: type-check, 108 unit tests, 26 extension E2E tests, and 3 live GitHub smoke tests. Stable and debug ZIPs built. Both exact ZIPs passed the blob-preview installation smoke. Version checks passed for package and both manifests at 0.6.7. No new permissions or controls were added.

Next: final review, push the PR, wait for CI, merge, then tag the merged commit as v0.6.7. The tag workflow publishes the tested stable archive. No release has happened yet. Record later merge/release facts on the PR and release, not by editing this shipped worktree.

Values say to put user experience first. No extra value was added for the cache implementation; its details belong with the feature.
