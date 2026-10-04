# Preview logo

Use a browser-window silhouette, not code brackets or a mascot: the mark should suggest viewing a page. A dark rounded tile (#18242c), warm white frame (#f4f1e8), and restrained mint play (#9ddbc3) keep it flat and quiet. Broad margins and an 8-unit frame remain legible at 16px; omit tiny browser controls and text.

Source: `assets/logo.svg`. Regenerate all five PNG sizes with `./scripts/generate-icons.sh` (requires local `rsvg-convert` from librsvg). No UI or dependency changes.

Validation: inspect the actual 128px and 16px renders; check PNG dimensions and compare each PNG with a fresh render of the SVG.

Worktree: `/home/tnfssc/.bruv/worktrees/t3code-0f02b118-d4d936df1f38-task_47a4d830`.
Branch: `bruv/redesign-extension-logo-47a4d830`.

Applied to the main thread as `00a7eca`. Reviewed both sizes and ran the generator again; all PNG dimensions match and regeneration leaves no diff. No app tests were run for this asset-only change. Reload the extension to see the new toolbar icon. Values stayed the same: this is a one-time design choice, not a new general lesson.

User rejected the browser-window/mint-play design ("nah suks"). Do not treat it as approved. Three distinct options are being explored in `/home/tnfssc/.bruv/worktrees/t3code-0f02b118-d4d936df1f38-task_f64a3d35`, branch `bruv/explore-three-stronger-logo-directions-f64a3d35`. Keep the active assets untouched until a direction is picked.
