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

## Release requested

User asked to push, merge the PR, and release. Public GitHub API confirms latest stable is v0.6.5 and no open PR exists (2026-10-05). Prepare v0.6.6 on branch t3code/remember-html-view-preference, then push this branch, open a PR against develop, link it to this thread, wait for checks, squash-merge, and tag the tested merge commit v0.6.6. The Release workflow publishes only after build, typecheck, unit/E2E, version contract, and exact-ZIP smoke pass. Confirm the workflow and GitHub release before claiming publication.

Current blocker: system gh CLI returns HTTP 401 for authenticated requests, and gh auth token cannot retrieve a credential. Public HTTPS API works. The initial id_rsa/libcrypto warning is nonfatal: a direct SSH check authenticated as tnfssc, and Git push succeeded. User confirmed gh CLI does not work. No PR, merge, tag, or stable release has been published. Do not ask for tokens in chat. Values stay unchanged; this is an access issue, not a new product lesson.

Local v0.6.6 checks passed in task_b8e52612: typecheck, 98 unit tests, ZIP build, release version contract, 24 browser tests, and one exact-ZIP extension smoke. Archive: .output/github-html-preview-0.6.6-chrome.zip. Release version and tests are ready; API/browser authentication still needs a user fix before PR/merge/tag/publication.

Branch pushed successfully to origin/t3code/remember-html-view-preference through f168c00. Create PR URL: https://github.com/tnfssc/html-preview/compare/develop...t3code%2Fremember-html-view-preference?expand=1 (or use the normal new-PR form). Browser automation is disabled for this thread: MCP refused the preview capability and says not to retry. The user can enable Agent browser access in Settings, effective on the next agent session. A signed-in browser can handle PR creation and merge without gh; direct Git can then push the merge-commit tag to trigger Release. Do not bypass the requested PR merge by pushing feature commits directly to develop.

Further auth diagnosis: both gh binaries run (system 2.92.0, user 2.102.0). hosts.yml selects tnfssc and SSH, with no inline OAuth token. System gh auth token reports “no oauth token found for github.com.” The login Secret Service collection reports Locked=true. A locked keyring can explain inaccessible stored credentials; this does not prove the token is missing or revoked. Ask the user to unlock the login keyring, then retry normal gh authentication. If no credential is available after unlock, reauthenticate. Do not reset or delete their keyring. Values unchanged.
