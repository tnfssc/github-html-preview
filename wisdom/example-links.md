# Popup example links

The popup has two links: **Open example**, which goes to `examples/demo/index.html` on `develop`, and **Open example PR**, which goes to [#28](https://github.com/tnfssc/github-html-preview/pull/28/files).

#28 stays open on purpose. Its base branch `example/base` holds the demo as it was first added. Its head branch `example/after` swaps the ribbon palette and changes the headline, so the PR shows a visible Before/After. Never merge it, and never delete either branch: the popup link would break. The PR does not touch `develop`, so it worked before the demo was merged.

The demo (`index.html`, `style.css`, `main.js`) is plain files with no CDN and no fonts. It loads a classic deferred script, not an ES module, so a clone opened over `file://` still runs.
