# Browser Tools

Lightweight Brave automation helpers built on the Chrome DevTools Protocol. Every script except `tools/ddg-search.js` requires Brave running on `http://localhost:9222` with remote debugging enabled.

## Requirements & Install
- macOS with Brave at `/Applications/Brave Browser.app`.
- Node.js 18+ (ES modules + built-in `fetch`). `.nvmrc` pins 20.11.1 when using nvm.
- Initial setup (human-only): run `./setup.sh` once to install dependencies (`puppeteer-core`, `cheerio`, `turndown`), refresh `lib/Readability.js`, and create `.bin/node` which pins the correct Node binary.
- Agent sessions: in each new shell run:
  ```bash
  export BROWSER_TOOLS=/Users/user/Projects/ansible-macos/ansible/roles/macos/files/ai/browser-tools
  export PATH="$BROWSER_TOOLS/.bin:$BROWSER_TOOLS/tools:$PATH"
  cd "$BROWSER_TOOLS"
  ```
  Then invoke commands with `node ...` (the shim resolves to the pinned version).
  Every script accepts `--help` for a quick usage reminder.

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
node tools/screenshot.js
```

Saves a PNG of the current viewport into the system temp directory and prints the path.

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

**Note:** Prefer piping directly (e.g. `node tools/fetch-readable.js … | rg keyword`). Only redirect to a file when necessary, and if you do, use a temporary path (`tmpfile=$(mktemp /tmp/readable-XXXX.md)`) so nothing lingers in the repo.

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
