# Browser Tools

Lightweight Brave automation helpers built on the Chrome DevTools Protocol. Every script except `tools/ddg-search.js` requires Brave running on `http://localhost:9222` with remote debugging enabled.

## Requirements & Install
- macOS with Brave at `/Applications/Brave Browser.app`.
- Node.js 18+ (ES modules + built-in `fetch`). `.nvmrc` pins 20.11.1 when using nvm.
- Initial setup (**human-only, never agents**): run `./setup.sh` once to install dependencies (`puppeteer-core`, `cheerio`, `turndown`), refresh `lib/Readability.js`, and create `.bin/node` which pins the correct Node binary. If the shim is missing/outdated, pause and ask a human to rerun the script.
- Shell usage assumes BSD/macOS userland: prefer BSD-friendly flags (`sed`, `awk`, etc.) and remember `mktemp` templates must end with `XXXXXX` (for example, `mktemp /tmp/readable.XXXXXX`).
- Agent sessions: after running `setup.sh`, execute commands via `node tools/<script>.js` (or `node tools/<script>.js --help`). The generated `.bin/node` wrapper automatically sets `BROWSER_TOOLS`, prepends `.bin`/`tools` to `PATH`, and execs the pinned Node binary, so no manual `export`/`cd` gymnastics are required.
- Codex CLI note: each `shell` call runs in a fresh process. Provide `workdir="/Users/user/Projects/ansible-macos/ansible/roles/macos/files/ai/browser-tools"` (or equivalent) and simply invoke `node tools/start.js`, `node tools/nav.js …`, etc.—the shim handles the rest. Avoid embedding `cd`/`export` sequences inside the command string so the harness can track paths correctly.
- All CLI scripts validate the working directory on startup and exit with an error if you run them from elsewhere. If a command fails immediately with “set the Codex CLI workdir…”, rerun the `shell` call with the correct `workdir` instead of chaining `cd`.

## Start Brave

```bash
node tools/start.js [--profile] [--reset]
```

- Default: `node tools/start.js` runs Brave headless in incognito mode using the
  automation profile directory so nothing from previous runs leaks forward.
- `--profile` opens a visible session backed by the persistent automation
  profile under `./.cache/automation-profile`. Use this for UI workflows such as
  `pick.js`.
- `--reset` wipes that automation profile before launch (only meaningful with
  `--profile`) so you can log in from scratch.
- The helper terminates only prior automation instances using this profile,
  launches a fresh one on :9222, and waits until DevTools responds. Keep the
  automation browser running while using other tools, and run
  `node tools/stop.js` when you’re done.
- Environment overrides: set `BROWSER_TOOLS_WINDOW_SIZE` (default `2560,1440`)
  or `BROWSER_TOOLS_USER_AGENT` (defaults to a modern macOS Chrome UA) when you
  need alternate viewports/agents.

## Navigate

```bash
node tools/nav.js https://example.com
node tools/nav.js https://example.com --new
```

Navigate the current tab; `--new` opens a separate tab. Errors if no tab is
available.

## Evaluate JavaScript

```bash
node tools/eval.js 'document.title'
node tools/eval.js 'document.querySelectorAll("a").length'
```

Run arbitrary async-friendly JavaScript in the active tab to inspect DOM state or return structured data.

## Screenshot

```bash
node tools/screenshot.js [--selector "#main"] [--viewport]
```

Captures a PNG in the system temp directory (full page by default) and prints the
path. Use `--selector` to capture only a specific element or `--viewport` to limit the
shot to what’s currently visible.

## Pick Elements

```bash
node tools/pick.js "Click the submit button"
```

Interactive overlay for collecting element metadata. Cmd/Ctrl+click adds to the
selection, Enter confirms, Esc cancels. Returns tag/id/class/text/html snippets
for each pick. Requires a visible browser session (`node tools/start.js --profile`).
Highlights stay visible until you click elsewhere or press Enter/Esc so you can
confirm the selection without racing a timeout, and single clicks aren’t committed
until you press Enter—click another element to replace the pending selection.

## Cookies

```bash
node tools/cookies.js
```

Prints cookie name/value plus domain/path/httpOnly/secure flags for the active tab.

## DuckDuckGo Search

```bash
node tools/ddg-search.js "prompt engineering" [--limit 5]
```

Queries DuckDuckGo's lightweight HTML endpoint and returns JSON results (title, URL, snippet, position). Useful when you need quick search hits without spinning up the browser.

## Fetch Readable Content

```bash
node tools/fetch-readable.js https://example.com > article.md
```

Loads the page in the active Brave session, injects Mozilla Readability to grab the main article, converts it to Markdown, and streams the content to stdout so you can pipe or redirect it. Ideal for logged-in or JS-heavy pages where curl/readability isn’t enough.

**Note:** Prefer piping directly (e.g. `node tools/fetch-readable.js … | rg keyword`). Only redirect to a file when necessary, and if you do, use a temporary path (e.g. `tmpfile="$(mktemp /tmp/readable.XXXXXX)"` then `node … > "${tmpfile}.md"`), so nothing lingers in the repo.
**Policy:** Avoid `curl`/`wget` for article content—spin up Brave with `node tools/start.js` and use `fetch-readable.js` (or `nav.js` + `screenshot.js`) so the output is normalized to Markdown. Reserve raw HTTP fetches for lightweight API calls or status checks and call out the reason if you must use them.

When you capture screenshots, share them by running `open /path/to/file.png` so the user sees the image immediately. The screenshot tool returns a temp-file path—opening it is expected unless told otherwise.

## Stop Automation Browser

```bash
node tools/stop.js
```

Terminates any Brave processes launched via `tools/start.js` for the current
cache directory (`./.cache/automation-profile` or `BROWSER_TOOLS_CACHE`). Run this when
the browsing task is complete so subsequent sessions start cleanly and no
windows are left open.

---

Troubleshooting:
- `✗ No active tab found` → make sure Brave was started via `tools/start.js` and at least one tab is open.
- Changing ports or browsers → update `browserURL` in each script.
