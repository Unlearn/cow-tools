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
cd ansible/roles/macos/files/ai/browser-tools
./setup.sh
```

The script loads `.nvmrc` (via nvm when available), verifies Node 18+, installs
dependencies (`puppeteer-core`, `cheerio`, `turndown`), and refreshes
`lib/Readability.js` from the upstream Mozilla repository so the readable-fetch
tool always uses the latest parser.

## Starting Brave for CDP Access
All CLI tools live under `tools/`. Everything except `hn-scraper.js` and
`ddg-search.js` needs Brave running with `--remote-debugging-port=9222` and a
known profile directory. Use the helper:

```bash
node tools/start.js [--profile]
```

- Without flags it creates a clean profile at `~/.cache/scraping`.
- `--profile` rsyncs your default Brave profile into that directory (cookies,
  logins, etc.). Missing profile directories are tolerated and fall back to a
  blank profile.
- The script kills any existing Brave processes, launches a new instance, and
  waits until DevTools responds before exiting with `✓ Brave started on :9222`.

You can manually confirm connectivity via `curl http://localhost:9222/json/version`.

## Available Commands

All commands live in `tools/` and use ES modules; invoke them with `node` (e.g.
`node tools/nav.js`) or mark them executable (`./tools/nav.js`).

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
select via Cmd/Ctrl+click, `Enter` to finish, `Esc` to cancel.

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
and echoing the full path.

### `hn-scraper.js`
```
node tools/hn-scraper.js [--limit 20]
```
Standalone script that fetches and parses the Hacker News front page using
`cheerio`. Does **not** require a browser session.

### `ddg-search.js`
```
node tools/ddg-search.js "best macos automation" [--limit 5]
```
Posts a query to DuckDuckGo's HTML endpoint and returns structured search
results (title, URL, snippet, position) as JSON. Does **not** require Brave to
be running.

### `fetch-readable.js`
```
node tools/fetch-readable.js https://example.com article.md
```
Uses the existing Brave session to load a URL, runs Mozilla Readability inside
the page, converts the article content to Markdown via Turndown, and saves it to
the specified file (defaults to `readable-<timestamp>.md`). Perfect for capturing
logged-in or JS-rendered pages as clean text.

## Tips
- Always run the commands from this directory or add `tools/` to your PATH so the
  local `node_modules` can be resolved.
- If any script reports `✗ No active tab found`, ensure Brave is running via
  `tools/start.js` and at least one tab is open.
- When changing ports or browser flavors, edit the shared
  `browserURL: "http://localhost:9222"` definitions accordingly.
