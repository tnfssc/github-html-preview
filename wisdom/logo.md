# Preview logo — Unfurl

## Review state

The user rejected the original brackets/play logo, the replacement browser-window/mint-play logo, and all three later options: code eye, angle monogram, and folded code document. None is approved. The old options remain historical artifacts in `assets/logo-options/`; do not recycle them or treat them as current candidates.

Latest request: “think different.” This is **one new, unapproved abstract direction**, installed as the active assets at the user’s request, not an approved brand decision. “Unfurl” is a direction label, not an application rename.

## Design

A bespoke broad ribbon bends into two unequal planes with an open, asymmetric cut. Its diagonal orientation evokes lifting/unfolding without depicting a software feature. Deep violet (`#262144`) grounds apricot (`#FFB17A`) and persimmon (`#FF714F`). No brackets, slash, eye, browser frame, play glyph, document, mascot, or letter monogram; no gradients or shadows. The generous inset and broad negative space keep the fold readable at toolbar size.

Source: `assets/logo.svg`. Regenerate all five active icons with `./scripts/generate-icons.sh` (local librsvg / `rsvg-convert`). Generator unchanged. No dependencies or UI changes.

Single presentation: `assets/logo-presentation.png` (1200 × 820), showing the same finished direction on light/dark backgrounds and native 16px toolbar renders. It was rendered with `rsvg-convert`; ImageMagick was used for dimensions and a nearest-neighbor small-size inspection.

## Validation and stop point

Inspected the large draft, refined the lower plane and diagonal orientation, then inspected the final presentation and actual 128px/16px renders. All icons are exactly 16, 32, 48, 96, and 128 pixels square. Re-running the generator produced byte-identical PNGs; five independent fresh renders also matched byte-for-byte. `git diff --check` passed. No app tests run: asset-only change.

Worktree: `/home/tnfssc/.bruv/worktrees/t3code-0f02b118-d4d936df1f38-task_af1dad02`.
Branch: `bruv/create-abstract-preview-brand-mark-af1dad02`.

Stop point: implementation and presentation ready for user review; this direction remains unapproved. Reload the extension to see the active toolbar icon. Worktree and branch retained. Values unchanged: a specific design decision, not a new general lesson.

Parent reviewed the presentation and applied the design in the main thread. Ran the generator again: no PNG diff, and dimensions match. Await user feedback on this abstract direction; no release or user approval claimed.
