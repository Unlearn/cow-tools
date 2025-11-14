# Browser Tools

Minimal Chromium DevTools automation helpers for Brave on macOS. This project is
primarily intended to be driven by automated agents; human operators mostly care
about installation, environment setup, and running the test suite.

Tool-by-tool usage and agent flows are documented in `AGENTS.md`.

## Requirements

- macOS with Brave Browser installed at the default path
  (`/Applications/Brave Browser.app`).
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

- Install npm dependencies (including `puppeteer-core` and `turndown`).
- Refresh `lib/Readability.js`.
- Create `.bin/node`, a wrapper that pins the correct Node binary and injects
  the environment expected by the browser tools.

Agents **must not** invoke `setup.sh` directly; if the shim is missing or out of
date, a human should rerun the script.

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
profiles.

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
