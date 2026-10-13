# Build `fftabs`: a CLI that returns my open Firefox tabs as JSON

## Placeholders
- Extension ID (gecko id): `fftabs@michaelrog.com`
- Native host name: `fftabs`
- Target OSes: Linux, macOS, Windows

## Goal
A single Go binary `fftabs` that any local program (scripts, cron, a Claude skill) can run to get the user's currently open Firefox tabs as JSON on stdout. It works by talking to a small companion Firefox extension via native messaging.

## Architecture
One binary comprising both `client` and `server` _modes_, connects to the browser extension via native messaging. The browser extension provides access to query open tabs. 

```
caller --> `fftabs` (client mode) --local socket--> `fftabs` (host mode) --stdio native messaging--> extension → browser.tabs.query({})
```

- **Host mode**: Firefox launches the binary as a native messaging host. It listens on a user-private local socket and relays each request to the extension over stdio, then routes the reply back to the right socket client.
- **Client mode**: anything else running `fftabs` connects to that socket, sends a request, prints the JSON reply to stdout, and exits.
- **Mode detection**: Firefox launches native hosts with two arguments, the absolute path of the host manifest (ends in `.json`) and the extension ID. If `len(os.Args) >= 3 && strings.HasSuffix(os.Args[1], ".json")`, run host mode. Otherwise dispatch subcommands.

## Repo layout
```
fftabs/
  extension/
    manifest.json
    background.js
  cmd/fftabs/main.go
  internal/
    framing/    # native messaging read/write (+ tests)
    host/       # host mode: socket server ↔ stdio relay
    client/     # client mode
    install/    # per-OS host manifest install/uninstall
    paths/      # per-OS socket + manifest locations
  Makefile
  README.md
```

## Part 1: Firefox extension

Use **Manifest V2 with a persistent background script**. Firefox still fully supports MV2, and MV3 event pages can be suspended, which would drop the native messaging port. Don't "upgrade" this to MV3.

`manifest.json`:
- `manifest_version: 2`, `name`, `version`
- `permissions: ["tabs", "nativeMessaging"]`
- `background: { "scripts": ["background.js"], "persistent": true }`
- `browser_specific_settings.gecko.id`
- No popup, no content scripts, no UI.

`background.js`:
- On startup, call `browser.runtime.connectNative("fftabs")`.
- On `port.onDisconnect`, log `browser.runtime.lastError` and reconnect with exponential backoff (cap ~30s).
- On message `{id, cmd: "list"}`: run `browser.tabs.query({})` and reply.
- On success: reply `{id, ok: true, tabs: [...]}`.
- On exception, reply `{id, ok: false, error: "<message>"}`.
- Unknown `cmd`: reply `{id, ok: false, error: "unknown command"}`.
- Tab fields to return: `id`, `windowId`, `index`, `title`, `url`, `active`, `pinned`, `incognito`, `lastAccessed`, `groupId` (if present).

## Part 2: Native messaging protocol (stdio)

- Each message is a 4-byte unsigned length in **native byte order**, followed by that many bytes of UTF-8 JSON. Use `binary.NativeEndian` (Go 1.21+).
- **Host mode must never write anything to stdout except protocol frames.** All logging goes to stderr or a log file in the user cache dir. Stray stdout output corrupts the stream.
- Guard writes to stdout with a mutex. Concurrent socket clients mean concurrent writers.
- Read stdin in one dedicated goroutine. EOF on stdin means Firefox closed the port: shut down cleanly and remove the socket.
- Request IDs: the host assigns a monotonically increasing integer `id` to each socket request. It keeps a `map[id]chan reply` (mutex-protected) to route extension replies back to the waiting client. On timeout, delete the entry.

## Part 3: Local socket (CLI ↔ host)

- Use AF_UNIX sockets on all platforms. Go's `net.Listen("unix", path)` works on Windows 10 1803+ too.
- Socket path, via an `internal/paths` package:
    - Linux: `$XDG_RUNTIME_DIR/fftabs.sock`, falling back to `os.UserCacheDir()/fftabs/fftabs.sock`
    - macOS: `os.UserCacheDir()/fftabs/fftabs.sock` (watch the ~104-byte sun_path limit; fall back to a short path under `os.TempDir()` with a per-user name if too long)
    - Windows: `%LOCALAPPDATA%\fftabs\fftabs.sock` (user-private by default ACL)
- Create the directory as 0700 and chmod the socket 0600 where applicable.
- **Stale socket handling** at host startup: if the path exists, try to dial it. If the dial fails, unlink it and bind. If the dial succeeds, another host instance (e.g. a second Firefox profile) owns it. In that case this instance should log it, keep the stdio connection idle (not exit, or Firefox will spam reconnects via the extension's backoff), and not serve the socket. First instance wins. Document this limitation in the README.
- Wire protocol over the socket: newline-delimited JSON. The client sends `{"cmd":"list"}\n`, and the host responds with one JSON line and closes.

## Part 4: CLI surface
- `fftabs` (no args) is equivalent to `fftabs list`: print JSON to stdout and exit.
    - Output shape: `{"fetched_at": "<RFC3339>", "tabs": [ ... ]}`, pretty-printed only if stdout is a TTY, otherwise compact.
- `fftabs install` writes the native host manifest with `path` = absolute path of the running executable (resolve symlinks via `os.Executable` + `filepath.EvalSymlinks`):
```json
  {"name":"fftabs","description":"fftabs bridge","path":"<abs exe path>","type":"stdio","allowed_extensions":["fftabs@michaelrog.com"]}
```
- Linux: `~/.mozilla/native-messaging-hosts/fftabs.json`
- macOS: `~/Library/Application Support/Mozilla/NativeMessagingHosts/fftabs.json`
- Windows: write the JSON to `%LOCALAPPDATA%\fftabs\fftabs.json` and set the default value of registry key `HKCU\Software\Mozilla\NativeMessagingHosts\fftabs` to that path (`golang.org/x/sys/windows/registry`, build-tagged).
- Print what was written and remind the user to restart Firefox (or reload the extension).
- `fftabs uninstall` removes the manifest and registry key.
- `fftabs version`
- `--timeout <duration>` on list (default 3s).
- **Exit codes** (consumers are unattended scripts, so these matter; document them in README and `--help`):
    - `0` success
    - `2` usage error
    - `3` socket missing / connection refused: "Firefox not running, extension not installed, or host not registered (run `fftabs install`)"
    - `4` timeout waiting for reply
    - `5` extension returned `ok: false`
- **Startup race**: if the socket is missing, the client retries dialing for up to ~1.5s before failing with exit 3, because Firefox may have just started.
- Errors go to stderr as a single human-readable line. stdout stays empty on failure.

## Part 5: Build, sign, distribute
`Makefile` targets:
- `build`: build for host OS
- `dist`: cross-compile `linux/amd64`, `linux/arm64`, `darwin/amd64`, `darwin/arm64`, `windows/amd64` with `CGO_ENABLED=0`, `-trimpath`, `-ldflags "-s -w -X main.version=$(VERSION)"`
- `ext-lint`: `web-ext lint -s extension`
- `ext-run`: `web-ext run -s extension` (temporary install in a clean profile, for dev)
- `ext-sign`: `web-ext sign -s extension --channel=unlisted --api-key=$$AMO_JWT_ISSUER --api-secret=$$AMO_JWT_SECRET`, producing a signed `.xpi` in `dist/`

README covers:
1. Install the signed `.xpi` in Firefox.
2. Put `fftabs` on PATH and run `fftabs install`.
3. Restart Firefox, then run `fftabs | jq '.tabs | length'`.
4. Exit codes, the output schema, and the one-profile-at-a-time limitation.
5. Dev loop: `about:debugging` → This Firefox → Load Temporary Add-on (note: a temporary add-on keeps the same gecko id from the manifest, so `allowed_extensions` still matches).

## Testing
- Unit tests for `internal/framing`: round-trip, zero-length, large (~1 MB) payloads, truncated input → error.
- Integration test for host mode that doesn't need Firefox: spawn the built binary with fake args (`/tmp/fake.json fftabs@<yourdomain>`), wire its stdin/stdout to pipes in the test, act as a fake extension that answers `list` with canned tabs, then run client mode against the socket and assert the JSON output and exit code. Also test concurrent clients (e.g. 20 parallel) to exercise ID routing, stdin EOF → socket removed, and the client timeout → exit 4.
- Use a temp dir for the socket path in tests (make the paths package overridable via env var `FFTABS_SOCKET`).

## Milestones (verify each before moving on)
1. Extension + host echo round-trip with Firefox via a temporary add-on and `fftabs install`.
2. Socket server + client mode: `fftabs | jq` returns real tabs.
3. Error handling: exit codes, timeouts, stale socket, startup retry, second-instance behavior.
4. Tests passing (`go test ./...`), `go vet` clean.
5. Makefile `dist` + `ext-sign`, README.

## Constraints
- Go ≥ 1.21, standard library preferred. Only external dep: `golang.org/x/sys` for the Windows registry.
- Keep the extension tiny and dependency-free: no bundler, no TypeScript.
- Don't add features beyond this spec (no tab-closing/activating commands, no HTTP server, no config file) without asking.