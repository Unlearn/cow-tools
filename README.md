# Browser Tools

Minimal Chromium DevTools automation helpers for Brave on macOS. These scripts
expect Brave to expose the remote-debugging protocol on `http://localhost:9222`
and interact with the most recently focused tab unless otherwise stated.

## Requirements
- macOS with Brave Browser installed at the default path
  (`/Applications/Brave Browser.app`).
- Node.js 18+ (needed for native `fetch` and ES modules) and npm.
- Homebrew (only required if you plan to run the `bin/bootstrap.sh` playbook).

## Installation
```bash
# Human setup (run once; agents should not invoke this)
cd /Users/user/Projects/cow-tools
./setup.sh
```

`setup.sh` (human-only) installs dependencies (`puppeteer-core`,
`turndown`), refreshes `lib/Readability.js`, and creates `.bin/node`, a wrapper
that pins the discovered Node executable and injects the correct environment.
**Agents must not run `setup.sh`; if the shim is missing or outdated, ask a
human to rerun the script.**

For Codex CLI sessions, every `shell` call is a fresh process. Set
`PATH="/Users/user/Projects/cow-tools/.bin:$PATH"` so the `.bin/node` shim is used,
and set `workdir="/Users/user/Projects/cow-tools/browser-tools"` before running
`node <script>.js …`. Commands launched from other directories now fail fast, so
fix the `workdir` instead of chaining `cd` inside the command string.

## Starting Brave for CDP Access
All CLI tools live under `browser-tools/`. Everything except `ddg-search.js` needs Brave
running with `--remote-debugging-port=9222` and access to the automation
profile stored under `./.cache/automation-profile` (override with
`BROWSER_TOOLS_CACHE` if you need a custom path). Use the helper:

```bash
node browser-tools/start.js [--profile] [--reset]
```

- Without flags it launches Brave headless **in incognito mode** using the
  automation profile directory, so each run starts clean even though the same
  path is reused.
- `--profile` opens a visible session backed by the automation profile under
  `./.cache/automation-profile` (override with `BROWSER_TOOLS_CACHE`).
- `--reset` wipes that automation profile **before** launching; it only applies
  when `--profile` is present.
- The script terminates only previous automation instances that used this
  profile path, launches a fresh one, and waits until DevTools responds before
  exiting with `✓ Brave started on :9222`.
- Set `BROWSER_TOOLS_WINDOW_SIZE` to override the default `2560,1440` viewport
  or `BROWSER_TOOLS_USER_AGENT` to spoof a specific UA string (otherwise a
  modern Chrome-on-macOS UA is used).

You can manually confirm connectivity via `curl http://localhost:9222/json/version`.

## Available Commands

All commands live in `browser-tools/` and use ES modules; invoke them with `node`
(e.g. `node browser-tools/nav.js`) or mark them executable (`./browser-tools/nav.js`).

Tip: every script supports `--help` for a quick reminder of syntax and
examples.

### Automation Helper
Visible sessions load a lightweight helper extension that exposes utilities via
`window.automation`. You can call these helpers from any script using
`automationCall(page, command, payload)` (see `browser-tools/lib/automation.js`).

Available commands:
- `highlight(selector, { color })` / `hideHighlight()`
- `scrollIntoView(selector, { behavior })`
- `collectText(selector, limit)`
- `listClickable(limit)`
- `hideBanner()` / `showBanner()` for the automation badge
- `startPicker(message)` (used internally by `pick.js`)

The helper fires an `automation-ready` event once it loads. The bridge in
`browser-tools/lib/automation.js` waits for that event automatically and, if the helper
extension fails to load (for example, in headless mode), it injects the same
logic directly so downstream tools keep working.

### `nav.js`
```
node browser-tools/nav.js <url> [--new]
```
Navigate the current tab (or open a new one with `--new`). Errors out if no
tab is available.

### `eval.js`
```
node browser-tools/eval.js 'document.title'
```
Evaluates arbitrary JavaScript inside the active tab and prints the returned
value/objects.

### `pick.js`
```
node browser-tools/pick.js 'Select the login button'
```
Injects a visual picker overlay to capture element metadata. Supports multi-
select via Cmd/Ctrl+click, `Enter` to finish, `Esc` to cancel. Requires a visible
browser session (`node browser-tools/start.js --profile`). The highlight now stays on the
selection until you click elsewhere or press Enter/Esc, so you can visually
confirm what was chosen. Single clicks aren’t committed until you press Enter,
so you can click a different element to replace the pending selection without
rerunning the command.

### `cookies.js`
```
node browser-tools/cookies.js
```
Prints cookies for the active tab (name, domain, path, flags).

### `screenshot.js`
```
node browser-tools/screenshot.js [--selector "#main"] [--viewport]
```
Captures the current tab to a PNG in the system temp dir (full-page by default)
and echoes the path. Pass `--selector` to capture a specific element only, or
`--viewport` to restrict the shot to the visible area. The automation badge is
temporarily hidden so images stay clean.

### `ddg-search.js`
```
node browser-tools/ddg-search.js "best macos automation"
```
Runs a DuckDuckGo web search in the existing Brave automation session and returns structured
results (title, URL, snippet, position) as JSON. Requires Brave on `:9222` via `start.js`.

### `login-helper.js`
```
node browser-tools/login-helper.js [--url https://example.com/login] [--message "Log into Foo"] [--timeout 300]
```
Shows a persistent overlay in the visible automation session asking a human to
complete a login. The agent waits until the user clicks “I’m logged in” (success,
exit code `0`), “Skip” (decline, exit code `2`), or the prompt times out (`--timeout`
in seconds, exit code `3`). Re-displays automatically if the page navigates during
the flow so you can click through multi-step or popup-driven authentication. **Requires
`node browser-tools/start.js --profile`** so the authenticated session can be reused when
continuing deeper into protected areas.

### `fetch-readable.js`
```
node browser-tools/fetch-readable.js https://example.com > article.md
node browser-tools/fetch-readable.js https://example.com --search "dessert|Tokyo" --context 1
```
Uses the existing Brave session to load a URL, runs Mozilla Readability inside
the page, converts the article content to Markdown via Turndown, and writes the
result to stdout for piping or redirection. Perfect for capturing logged-in or
JS-rendered pages as clean text. The optional `--search` flag accepts a
JavaScript regular expression (no delimiters; e.g. `"dessert|Tokyo"`) and emits
matching lines (in Markdown) before the full article. `--context N` controls the
number of nearby words included on each side of the match (default `0`), and
`--search-flags` passes additional regex flags (e.g. `i` for case-insensitive).

### `pdf2md.js`
```
node browser-tools/pdf2md.js /path/to/menu.pdf
node browser-tools/pdf2md.js https://example.com/menu.pdf --search "dessert|Tokyo" --context 1
```
Converts menu-style PDFs to Markdown using `pdftotext` under the hood, then
streams the result to stdout. Accepts either a local file path or a direct PDF
URL (fetched via Node's `fetch` with a browser-like User-Agent). When `--search`
is provided, it reuses the same JavaScript regex semantics as
`fetch-readable.js` (`--search`, `--context`, `--search-flags`) and prints a
summary "Matches (pattern: …)" block ahead of the full Markdown so callers can
quickly extract the first dessert, price line, etc.

### `stop.js`
```
node browser-tools/stop.js
```
Terminates any automation Brave processes that are using the automation profile
directory (`./.cache/automation-profile` or its `BROWSER_TOOLS_CACHE` override).
Run this when you wrap up a browsing task so subsequent sessions start cleanly
and no stray Brave window remains open.

## Test Workflow (no picker)
Use this flow to exercise every CLI tool end-to-end (humans only). Run it from this directory after the initial setup; agents should skip these prep steps.

1. **Prep once**
   ```bash
   ./setup.sh              # rerun only if dependencies/Readability might be stale
   cd /Users/user/Projects/cow-tools
   ```
2. **Headless session**
   - `node browser-tools/start.js`
   - `node browser-tools/nav.js https://example.com`
   - `node browser-tools/eval.js 'document.title'`
   - `node browser-tools/nav.js https://news.ycombinator.com` (or any site that sets cookies immediately)
   - `node browser-tools/cookies.js` (should print at least one cookie)
   - `node browser-tools/ddg-search.js "automation helpers"`
   - `node browser-tools/stop.js`
3. **Visible profile session**
   - `node browser-tools/start.js --profile --reset`
   - `node browser-tools/nav.js https://example.org --new`
  - `node browser-tools/eval.js 'window.__automationReady ?? false'` (should be `true`; if not, `start.js` logs a warning and the CLI falls back to inline injection)
   - `node browser-tools/eval.js 'window.automation ? (window.automation.hideBanner(), setTimeout(() => window.automation.showBanner(), 500), "banner toggled") : "automation helper unavailable"'`
   - `node browser-tools/screenshot.js`
   - `node browser-tools/fetch-readable.js https://example.org --search "coffee" --context 1 > /tmp/article.md` (inspect output)
   - Navigate to a site with cookies (or set one manually via `node browser-tools/eval.js '(()=>{document.cookie="foo=bar";return document.cookie;})()'`) and rerun `node browser-tools/cookies.js`
   - `node browser-tools/eval.js 'Array.from(document.links).length'`
   - `node browser-tools/stop.js` (run twice; second call should report no automation processes)

## Tips
- Always run the commands from this directory or add `browser-tools/` to your PATH so the
  local `node_modules` can be resolved.
- If any script reports `✗ No active tab found`, ensure Brave is running via
  `browser-tools/start.js` and at least one tab is open.

## Development Workflow & Tests
- Every tool has an accompanying Playwright test in `tests/`. When adding a new CLI or changing an existing one, **write or update the Playwright test first** to capture the desired behavior, then implement the script so it satisfies that test.
- Run `./test.sh` for the one-step setup + Playwright test runner (it installs npm deps if needed), or invoke `npx playwright test` / `npm run test:playwright` directly when dependencies are already in place. The harness covers headless tools, visible automation helpers, DuckDuckGo fetching, and lifecycle scripts, so regressions surface quickly.
