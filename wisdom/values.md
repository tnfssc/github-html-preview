# Values

## Check source and route together

A page can keep old data while its URL changes. Check that preview source belongs to the current file before using it. Keep a test where old data survives navigation. This helps with GitHub SPA pages; it does not prove that every same-path ref change is safe. See [live smoke](ci-live-smoke.md).

## Keep live failures useful

Read traces before changing a smoke test. Fix a real product fault without weakening its checks. Use a deterministic regression too. A remote outage may need a different fix. See [live smoke](ci-live-smoke.md).
