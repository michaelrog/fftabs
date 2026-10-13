# fftabs

A Firefox extension that grabs metadata for all your open tabs. Click the toolbar button to see every tab as JSON, then copy it to your clipboard with one click.

Each tab includes these [`tabs.Tab`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/Tab) properties, when Firefox provides them:
- `id`
- `index`
- `windowId`
- `highlighted`
- `hidden`
- `discarded`
- `incognito`
- `lastAccessed`
- `audible`
- `sharingState`
- `mutedInfo`
- `successorTabId`
- `groupId`
- `url`
- `title`
- `attention`

## Architecture

fftabs is a plain WebExtension (Manifest V2, so a persistent background script can be added later; Firefox still fully supports MV2).

It has no build step, no dependencies, and no background script.

```
toolbar button ──► popup/popup.html
                     └─ popup.js ──► browser.tabs.query({}) ──► pick properties ──► JSON.stringify ──► <textarea>
                                                                                            Copy ──► navigator.clipboard
```

| File | Role |
| --- | --- |
| `extension/manifest.json` | Extension metadata: gecko id `fftabs@michaelrog.com`, the `tabs` permission, the toolbar action, and the data-collection declaration AMO requires |
| `extension/popup/popup.html` | Popup markup: a tab count, a Copy button, and a read-only textarea |
| `extension/popup/popup.js` | Queries all tabs when the popup opens, keeps the selected properties, renders the result as pretty-printed JSON, and handles Copy |
| `extension/popup/popup.css` | Popup layout, with light and dark styling that follows the system |
| `extension/icons/icon.svg` | Toolbar and add-on icon |

Design notes:

- **The only permission is `tabs`.** Without it, Firefox leaves `url` and `title` out of each tab. Clipboard writes happen on a user click, so the extension doesn't need `clipboardWrite`.
- **Nothing leaves the browser.** The manifest declares `data_collection_permissions: none`.
- **The source is the shipped code.** There is no bundler or minifier, so what's in `extension/` is exactly what gets packaged and reviewed.
- **It requires Firefox 142 or later,** the first version that supports the data-collection declaration on both desktop and Android.

## Installation

### From a release (once published)

Install fftabs from addons.mozilla.org, or open a signed `.xpi` file in Firefox. Neither exists yet; see [the POC plan](docs/plan/2026-10-13-extension-poc.md).

### From source, as a temporary add-on

1. Clone this repo.
2. In Firefox, open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and select `extension/manifest.json`.
4. Click the fftabs toolbar button. If you don't see it, look under the puzzle-piece Extensions menu and pin it.

The add-on stays loaded until Firefox restarts.

### From source, with web-ext

[web-ext](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/) launches a clean Firefox profile with the extension loaded and reloads it when you edit files. It needs Node.js.

```sh
npx web-ext run   --source-dir extension   # dev loop
npx web-ext lint  --source-dir extension   # the same checks addons.mozilla.org runs
npx web-ext build --source-dir extension   # unsigned zip in web-ext-artifacts/
```

## License

Copyright © 2026 Michael Rog. Licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).