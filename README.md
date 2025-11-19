# Browser Tools

Minimal Chromium DevTools automation helpers for Brave on macOS. This project is
primarily intended to be driven by automated agents; human operators mostly care
about installation, environment setup, and running the test suite.

Tool-by-tool usage and agent flows are documented in `AGENTS.md`.

## Requirements

- macOS with [Brave Browser Nightly](https://brave.com/download-nightly/) installed at the
  default path (`/Applications/Brave Browser Nightly.app`).
- Node.js 18+ (needed for native `fetch` and ES modules) and npm.
- Homebrew (only required if you plan to run the `bin/bootstrap.sh` playbook).
- `pdftotext` from Poppler available on `PATH` (required for `pdf2md.js` and the
  associated tests).

## Installation & Setup

From the project root:

```bash
cd /Users/user/Projects/cow-tools
./setup.sh   # human-only; run once or when dependencies/Readability need refreshing
```

`setup.sh` will:

- Ensure Brave Browser Nightly is installed, run a one-time manual update via
  Brave’s updater binary, and disable Brave’s background auto-updater so the
  automation binary stays pinned.
- Install npm dependencies (including `puppeteer-core` and `turndown`).
- Refresh `lib/Readability.js`.
- Create `.bin/node`, a wrapper that pins the correct Node binary and injects
  the environment expected by the browser tools.

Agents **must not** invoke `setup.sh` directly; if the shim is missing or out of
date, a human should rerun the script.

## SSH Proxy Tunnel

Every automation session routes through an SSH-based SOCKS proxy by default. The
command lives in `browser-tools/lib/ssh-proxy-config.js` and is preconfigured to
run `ssh -N -D 127.0.0.1:1080 proxy-exit` with strict keepalive flags. Define
that `proxy-exit` alias in your personal `~/.ssh/config` so credentials stay out
of the repo. A typical stanza looks like:

```ssh-config
Host proxy-exit
    HostName ssh.example.com
    User user
    Port 4193
    IdentityFile ~/.ssh/id_proxy
    ServerAliveInterval 30
    ServerAliveCountMax 3
```

`start.js` launches the tunnel first, passes `--proxy-server=socks5://127.0.0.1:1080`
to Brave, and `stop.js` tears the tunnel down at the end. Use `start.js --no-proxy`
only when you explicitly need to bypass the proxy; update the code only if you
rename the alias.

## Brave Nightly Binary

Automation runs exclusively against Brave Browser Nightly. `start.js` will launch
`/Applications/Brave Browser Nightly.app/Contents/MacOS/Brave Browser Nightly`
unless you override it with `BROWSER_TOOLS_BRAVE_PATH`. The Nightly channel keeps
Brave’s UI and feature flags aligned with what agents expect while remaining
isolated from the Stable/Beta installs you might use for personal browsing.

During setup we still allow Nightly to update (via `BraveUpdater --update-apps`)
so the binary is fresh, but the script removes Brave’s LaunchAgents and cached
updater bundles afterwards and toggles the Sparkle preferences that enable
automatic checks. If you want to point at a different Chromium build, export
`BROWSER_TOOLS_BRAVE_PATH` before invoking `start.js`.

## Session Watchdog

`start.js` also arms a 10-minute watchdog: if no browser-tool command touches the
session heartbeat within that window, a helper automatically invokes `stop.js` to
shut Brave and the SSH tunnel down. Every CLI tool updates the heartbeat when it
starts, so standard workflows keep the session alive. To change the timeout, set
`BROWSER_TOOLS_SESSION_TIMEOUT_MS`, `BROWSER_TOOLS_SESSION_TIMEOUT_MINUTES`, or
pass `--session-timeout <minutes>` to `start.js`.

Tests set `BROWSER_TOOLS_SSH_PROXY_TEST_CONFIG` to point at a local stub so they
can validate proxy handling without dialing the real VPS.

## Project Layout

- `browser-tools/` – CLI entry points and shared helpers used by agents.
- `lib/Readability.js` – vendored Mozilla Readability used by `fetch-readable.js`.
- `extensions/automation-helper/` – small extension injected into visible Brave
  sessions to provide `window.automation`.
- `tests/` – Playwright tests that exercise the tools end-to-end.
- `test.sh` – convenience wrapper to install dependencies (if needed) and run
  the Playwright suite with the correct shim and environment.

The detailed behavior and composition of the tools (`start.js`, `nav.js`,
`ddg-search.js`, `fetch-readable.js`, `pdf2md.js`, etc.) is described in
`AGENTS.md`, which is the source of truth for how agents should call into this
project.

## Running Tests

Most changes should be validated via the Playwright test suite. From the project
root:

```bash
./test.sh
```

`test.sh` will:

- Ensure `node_modules/` is present (running `npm install` if necessary).
- Export `PATH` so the repo’s `.bin/node` shim is used.
- Set `BROWSER_TOOLS_ALLOW_ROOT=1` for local runs.
- Invoke `npx playwright test` with the current arguments.

If you prefer to call Playwright directly once dependencies are installed:

```bash
export PATH="/Users/user/Projects/cow-tools/.bin:$PATH"
npx playwright test
```

Playwright will launch Brave via `browser-tools/start.js` as part of the test
harness and exercise the tools under both headless and visible automation
profiles. The harness passes `--no-proxy` to `start.js` so the suite does not
depend on the real SSH tunnel; proxy behavior is tested separately via stubs.

## Contributing

When adding or modifying tools:

- Start by updating or adding a Playwright test in `tests/` that describes the
  desired behavior from an agent’s perspective.
- Implement the corresponding logic under `browser-tools/` so it satisfies the
  test.
- Run `./test.sh` locally before sending changes.

Human-facing documentation about agent workflows should live in `AGENTS.md`. The
README is intentionally focused on installation, environment setup, and test
execution.
