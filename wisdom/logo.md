# Preview logo — Unfurl

## Approved direction

The user approved the abstract folded-ribbon mark with “ok lgtm,” then asked to replace the logo and open a PR. “Unfurl” is a design label, not an app rename.

Two broad, unequal planes form an open fold. Deep violet (#262144), apricot (#FFB17A), and persimmon (#FF714F) give it a strong silhouette. No literal code, browser, eye, or play symbols. No gradients or shadows.

Source: `assets/logo.svg`. Run `./scripts/generate-icons.sh` to regenerate 16, 32, 48, 96, and 128px PNGs. Requires local `rsvg-convert` from librsvg. No UI or dependency changes.

## Checks and next step

Reviewed the 128px and actual 16px renders. All PNG dimensions match. Regeneration leaves no diff. `git diff --check` passes. No app tests run for this asset-only change. Reload the extension to see it. PR: https://github.com/tnfssc/html-preview/pull/23 (base `develop`, head `t3code/improve-logo`). Linked to the thread. Next step: review CI and merge when ready. No release made.

## Rejected attempts

The user rejected the old brackets/play mark, the browser-window/mint-play replacement, and all three code-eye, angle-monogram, and folded-document options. Do not recycle them. Rejected candidate assets and the review presentation are left out of the PR.

Design worktrees stay available:
- Browser mark: `/home/tnfssc/.bruv/worktrees/t3code-0f02b118-d4d936df1f38-task_47a4d830`; branch `bruv/redesign-extension-logo-47a4d830`.
- Three rejected options: `/home/tnfssc/.bruv/worktrees/t3code-0f02b118-d4d936df1f38-task_f64a3d35`; branch `bruv/explore-three-stronger-logo-directions-f64a3d35`.
- Approved ribbon and presentation: `/home/tnfssc/.bruv/worktrees/t3code-0f02b118-d4d936df1f38-task_af1dad02`; branch `bruv/create-abstract-preview-brand-mark-af1dad02`.

Values stayed unchanged: this is a specific design choice, not a new general lesson.
