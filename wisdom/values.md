# Values

## Check source and route together

A page can keep old data while its URL changes. Check that preview source belongs to the current file before using it. Keep a test where old data survives navigation. This helps with GitHub SPA pages; it does not prove that every same-path ref change is safe. See [live smoke](ci-live-smoke.md).

## Keep live failures useful

Read traces before changing a smoke test. Fix a real product fault without weakening its checks. Use a deterministic regression too. A remote outage may need a different fix. See [live smoke](ci-live-smoke.md).

## Remember choices, not startup effects

Read the saved view before mounting. Save explicit user choices, not the automatic default. Keep the local choice current while storage writes finish. This helps views that remount on SPA routes; it does not mean another tab must switch its active view. See [HTML view startup](html-view-startup.md).

## Put user experience first

Start with what people actually do, then remove the friction in that job. Rank work by how much it helps users, not by how many controls we can expose. Keep the successful preview path simple. This helps product priorities and UI choices; it is not a reason to weaken credential isolation. See [product review](product-review.md).
