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
# Human setup (run once)
cd ansible/roles/macos/files/ai/browser-tools
./setup.sh

# Agent session prep
export BROWSER_TOOLS=/Users/user/Projects/ansible-macos/ansible/roles/macos/files/ai/browser-tools
export PATH="$BROWSER_TOOLS/.bin:$BROWSER_TOOLS/tools:$PATH"
cd "$BROWSER_TOOLS"
```

`setup.sh` (human-only) installs dependencies (`puppeteer-core`, `cheerio`,
`turndown`), refreshes `lib/Readability.js`, and creates `.bin/node`, a shim that
locks the Node version for agents. After setup, agents just extend PATH as shown
above—no need to source nvm in each session.

## Starting Brave for CDP Access
All CLI tools live under `tools/`. Everything except `hn-scraper.js` and
`ddg-search.js` needs Brave running with `--remote-debugging-port=9222` and a
dedicated automation profile stored under `./.cache/scraping` (override with
`BROWSER_TOOLS_CACHE` if you need a custom path). Use the helper:

```bash
node tools/start.js [--profile] [--visible|--headless]
```

- Without flags it launches Brave headless in incognito mode using the
  automation cache at `./.cache/scraping` (or `BROWSER_TOOLS_CACHE` if set).
  Tabs start empty on every run and session data is discarded when you call
  `tools/stop.js`.
- `--visible` launches Brave with a window. Use this before running tools that
  need UI interaction (e.g. `pick.js`). `--headless` forces headless mode
  explicitly (it is the default).
- `--profile` wipes the automation cache, makes a one-time rsync copy of your
  default Brave profile, and forces visible mode so you can supervise. The copy
  stays isolated; changes do not sync back to your main profile.
- The script terminates only previous automation instances (those using the
  cache path), launches a fresh one, and waits until DevTools responds before
  exiting with `✓ Brave started on :9222`.
- Set `BROWSER_TOOLS_CACHE=/writable/location` before calling `start.js` if this
  repository root is not writable in your environment.

You can manually confirm connectivity via `curl http://localhost:9222/json/version`.

## Available Commands

All commands live in `tools/` and use ES modules; invoke them with `node` (e.g.
`node tools/nav.js`) or mark them executable (`./tools/nav.js`).

Tip: every script supports `--help` for a quick reminder of syntax and
examples.

### Automation Helper
Visible sessions load a lightweight helper extension that exposes utilities via
`window.automation`. You can call these helpers from any script using
`automationCall(page, command, payload)` (see `tools/lib/automation.js`).

Available commands:
- `highlight(selector, { color })` / `hideHighlight()`
- `scrollIntoView(selector, { behavior })`
- `collectText(selector, limit)`
- `listClickable(limit)`
- `hideBanner()` / `showBanner()` for the automation badge
- `startPicker(message)` (used internally by `pick.js`)

The helper fires an `automation-ready` event once it loads. The bridge in
`tools/lib/automation.js` waits for that event automatically.

### `nav.js`
```
node tools/nav.js <url> [--new]
```
Navigate the current tab (or open a new one with `--new`). Errors out if no
tab is available.

### `eval.js`
```
node tools/eval.js 'document.title'
```
Evaluates arbitrary JavaScript inside the active tab and prints the returned
value/objects.

### `pick.js`
```
node tools/pick.js 'Select the login button'
```
Injects a visual picker overlay to capture element metadata. Supports multi-
select via Cmd/Ctrl+click, `Enter` to finish, `Esc` to cancel. Requires a visible
browser session (`node tools/start.js --visible`). The highlight now stays on the
selection until you click elsewhere or press Enter/Esc, so you can visually
confirm what was chosen.

### `cookies.js`
```
node tools/cookies.js
```
Prints cookies for the active tab (name, domain, path, flags).

### `screenshot.js`
```
node tools/screenshot.js
```
Takes a PNG screenshot of the current tab, saving it to your system temp dir
and echoing the full path. Automatically hides the automation badge before
capturing so images stay clean.

### `ddg-search.js`
```
node tools/ddg-search.js "best macos automation" [--limit 5]
```
Posts a query to DuckDuckGo's HTML endpoint and returns structured search
results (title, URL, snippet, position) as JSON. Does **not** require Brave to
be running.

### `fetch-readable.js`
```
node tools/fetch-readable.js https://example.com > article.md
```
Uses the existing Brave session to load a URL, runs Mozilla Readability inside
the page, converts the article content to Markdown via Turndown, and writes the
result to stdout for piping or redirection. Perfect for capturing logged-in or
JS-rendered pages as clean text.

### `stop.js`
```
node tools/stop.js
```
Terminates any automation Brave processes that are using the current cache
directory (`./.cache/scraping` or `BROWSER_TOOLS_CACHE`). Run this when you wrap
up a browsing task so subsequent sessions start cleanly and no stray Brave
window remains open.

## Tips
- Always run the commands from this directory or add `tools/` to your PATH so the
  local `node_modules` can be resolved.
- If any script reports `✗ No active tab found`, ensure Brave is running via
  `tools/start.js` and at least one tab is open.
- When changing ports or browser flavors, edit the shared
  `browserURL: "http://localhost:9222"` definitions accordingly.
