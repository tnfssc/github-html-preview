# Product direction — 2026-10-07

The user wants user experience first. The job is reading HTML docs on GitHub without cloning the repo. HTML-only support is enough.

Do not lead with mobile GitHub use, responsive controls, or CSS/JS-only PR support. Those were review ideas the user rejected or deprioritized. A demo link is not a priority if the reading flow is already clear.

Check real documents for readable authored styles, heading links, reading space, and scrolling. These are checks, not confirmed bugs.

## Chosen next step

The user asked to improve Retry. Refresh only the selected HTML document and resources it uses. Leave unrelated documents and browser caches alone. Keep the existing failure-only action; add no cache-clear button or browser-wide cache permission.

Open a PR, merge it after checks, then publish a release. Planned stable version: 0.6.7.

## Work in progress

Implementation is delegated to task_1e568cb6 on branch fix/scoped-html-retry in its own worktree. Read wisdom/scoped-html-retry.md from that result for its actual path, design, tests, and limits. Parent branch is t3/product-improvements in /home/tnfssc/.t3/worktrees/gh-html-iframe/t3-7864b6d9.

No release has happened yet. The tag must point at the merged commit. The tag workflow builds and tests the exact archive before publishing it.

Values now say to put user experience first. This comes directly from the user, not a guessed engineering lesson.
