# HTML view startup

## Request

Remember explicit Code or Preview choices across PRs and HTML files. Default to Preview when no choice exists. Do not show two empty panes while PR previews load. Look for load speed wins that change what users feel.

PR and blob choices stay separate. PR viewport and scroll settings keep their existing storage item. A new local:blobViewMode item holds the file tab choice. Automatic mounts must not save a choice. Read settings before mounting. Code mode must not fetch hidden preview resources.

## Integrated work

Parent workspace: /home/tnfssc/.t3/worktrees/gh-html-iframe/t3code-e17f1d98.

- PR worker: task_686ee40f. Worktree /home/tnfssc/.bruv/worktrees/t3code-e17f1d98-d4d936df1f38-task_686ee40f. Branch bruv/pr-view-preference-and-loading-layout-686ee40f. Owns entrypoints/pr.content.ts.
- Blob worker: task_183207ff. Worktree /home/tnfssc/.bruv/worktrees/t3code-e17f1d98-d4d936df1f38-task_183207ff. Branch bruv/blob-view-choice-persistence-183207ff. Owns entrypoints/content.ts.
- Resource worker: task_cbd39fb6. Worktree /home/tnfssc/.bruv/worktrees/t3code-e17f1d98-d4d936df1f38-task_cbd39fb6. Branch bruv/preview-resource-loading-performance-cbd39fb6. Owns resolver and its unit tests.

Worker commits are integrated: blob 1c4c1af → a173cc2, resources 3b741fb → 2f29ce3, PR 9b7bec0 → d91c21c. Parent owns storage defaults and e2e/extension.spec.ts. New browser tests check fresh defaults without writes, saved choices across SPA and full navigation, no hidden resource loads in Code mode, and slow added-file loading without split placeholders.

The PR load layout follows real render results, never guessed Before/After panes. Available file metadata skips missing sides and renamed-path misses. No extra file-list request blocks normal previews. The shared resolver now overlaps independent stylesheet/script fetches and independent private styles. Authored DOM order and module-map merge order stay intact; existing fetch slots and byte limits stay in force. Deferred-response tests prove concurrency, not a measured real-world speed percentage.

Review caught the old PR empty-pane and rapid-toggle faults while PR integration was pending. d91c21c fixes both, with tests. The first integrated browser run passed 22 of 24 tests. Two failures exposed unwanted presentation changes: the error heading had changed and partial-preview resource counts became visible. Parent kept the prior error wording and compact partial-preview chrome (Retry remains visible), while retaining the single loading/error status for previews with no rendered side. No existing failure checks were weakened.

Final checks passed in task_a92d03dc: typecheck, production build, all 98 unit tests, and all 24 browser tests. Browser artifacts are in /tmp/html-view-final-e2e. No live smoke, release, version bump, or push requested. Starting in Code avoids preview fetches, but already-rendered frames remain hidden and reusable, not destroyed. Blob choice reads on mount and updates locally; existing tabs do not watch choices from another tab. Source/ref ownership limits still apply as described in values.md. PR file-list pagination and offscreen scheduling are unchanged.
