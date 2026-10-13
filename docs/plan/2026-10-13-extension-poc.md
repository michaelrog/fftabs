# Build `fftabs`: a browser extension to help me grab metadata on my open tabs...

## meta

- Extension ID (gecko id): `fftabs@michaelrog.com`

## The simplest design

- A toolbar button opens a page/popup.
- The page calls `browser.tabs.query({})`, formats the result as JSON, and shows it in a `<textarea>`.
- Include all available properties for each tab.
- Add a “Copy” button to copy the contents to my clipboard.

## Status (2026-10-13)

Implemented in `extension/` as a no-build MV2 WebExtension (`browser_action` popup, `tabs` permission only, `data_collection_permissions: none`, `strict_min_version` 142.0). It passes `web-ext lint` with 0 errors and 0 warnings. `README.md` covers the description, architecture, and installation.

- The extension uses Manifest V2 rather than V3, so a persistent background script can be added later without migrating the manifest.
- Firefox 142 is the minimum because it's the first version where both desktop and Android support `data_collection_permissions`.
- Copy uses `navigator.clipboard.writeText` on a user click, with no `clipboardWrite` permission.

## Verify
- [ ] Load as a temporary add-on and click through it in real Firefox. So far only the linter has checked it.
- [ ] Confirm `navigator.clipboard.writeText` works in the popup without the `clipboardWrite` permission. If it doesn't, add the permission or fall back to `execCommand("copy")`.
- [ ] Check the popup size (600×~520px) on small and HiDPI screens.
- [ ] Test with a large session (hundreds of tabs) to see whether the textarea stays responsive.

## Open issues
- [x] **Output size:** `favIconUrl` could be a long `data:` URI. Resolved: the popup now outputs a fixed list of properties (`TAB_PROPERTIES` in `popup.js`) that excludes it.
- [ ] **Private windows:** `tabs.query({})` returns private-window tabs only when the user allows the extension in private windows. Decide whether that's desired and document it.
- [ ] **Firefox for Android:** the manifest allows Android (min version 142), but nobody has tested it. Popups behave differently there. Either test it or restrict the extension to desktop.
- [ ] **Relationship to `2026-10-13-WIP-kickoff.md` (CLI + native messaging):**
  - That plan wants a persistent background script, `nativeMessaging`, no UI, and a reduced field list.
  - Decide whether the popup survives alongside that bridge, and reconcile its field list with the popup's `TAB_PROPERTIES`.
  - Adding `nativeMessaging` will draw more AMO review scrutiny, and users will have to install the native binary separately.

## Before public distribution
- [ ] License (CC BY 4.0) — addons.mozilla.org may not offer it as a choice when you submit; if not, choose a custom license and paste in the text.
- [ ] Replace the placeholder `icons/icon.svg` with a real icon, and check it at 16, 32, 48, and 96px in light and dark toolbars.
- [ ] Choose a channel: listed on AMO, or unlisted (a self-distributed signed `.xpi`).
- [ ] Create AMO API credentials (`AMO_JWT_ISSUER` / `AMO_JWT_SECRET`) for `web-ext sign`.
- [ ] Write the AMO listing: summary, description, category, screenshots, and a support URL or email. A privacy policy isn't required while data collection is `none`, but a single line saying so helps reviewers.
- [ ] Decide on a versioning and release process (version bumps in `manifest.json`, a CHANGELOG, tags).
- [ ] Optional: a Makefile or npm script wrapping `web-ext lint`, `build`, and `sign`. That's a convenience, not a build step.

## Ideas (not in scope without a decision)
- Filter which fields are shown or copied.
- Download the JSON as a file instead of copying it.
- Limit the output to the current window.
- Re-include `favIconUrl` in `TAB_PROPERTIES`. It was dropped because it can be a long `data:` URI; options are to include it as-is, truncate `data:` URIs, or include only `http(s)` favicon URLs.
