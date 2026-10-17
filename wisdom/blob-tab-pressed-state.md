# Blob tab pressed state

Live GitHub (Primer React, checked 2026-10-17) paints the selected File view segment from the button's `aria-pressed`, not `aria-current` or the item's `data-selected`. The blob script only flipped the latter, so Preview rendered while Code still looked selected, on public and private repos alike.

`setSelectedTab` now writes `aria-pressed` with the others. React writes `aria-pressed` only when its own selection changes, so a click on the already-selected native tab cannot restore it: the native click listener reselects the clicked button itself, and teardown of an active preview reselects the native button that was pressed at mount.

The e2e blob fixture mirrors Primer's `aria-pressed` markup, and the view-choice test asserts the pressed state both ways. Verified live on an MDN blob page: Preview, Code, Preview, and reload all show the matching tab.
