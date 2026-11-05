# Live blob smoke: GitHub 504s and slow soft navigation

Run [42047432893](https://github.com/tnfssc/github-html-preview/actions/runs/42047432893) failed all three attempts of the blob test during GitHub degradation, not an extension defect.

- Attempts 1–2: error context shows GitHub's "504 Gateway Time-out" page, so no Preview tab existed. No test change can help; retries already cover this.
- Retry 2: every Preview assertion passed. After clicking `getting-started/index.html` in the file tree, GitHub's `_file_tree`/`_layout` calls returned but the blob request was still pending, so the SPA URL had not changed when `toHaveURL` hit Playwright's 5s default.

Fix: `toHaveURL` now uses `liveTimeout` (30s) like every other live wait. Assertions, retries and product behavior unchanged. When a live smoke fails, read each attempt's `error-context.md` snapshot first: a GitHub error page means outage, not regression.
