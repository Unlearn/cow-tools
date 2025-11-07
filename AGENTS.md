# Browser Tools

Lightweight Brave automation helpers built on the Chrome DevTools Protocol. All scripts expect Brave running on `http://localhost:9222` with remote debugging enabled.

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
node tools/start.js [--profile] [--visible|--headless]
```

- Default: `node tools/start.js` (headless) runs Brave in incognito mode using
  the automation cache under `./.cache/scraping` (override via
  `BROWSER_TOOLS_CACHE`). Tabs start blank every run.
- `--visible` launches a real window. Run this before using tools that need UI,
  such as `pick.js`. This flag is implied automatically when you pass
  `--profile` so you can supervise the session.
- `--profile` only when you must reuse the user’s cookies/logins; otherwise keep
  sessions clean. Passing this flag wipes the cache, copies your profile, and
  forces visible mode.
- The helper terminates only prior automation instances that use the same cache
  path, launches a fresh one on :9222, and waits until DevTools responds. Keep
  the automation browser running while using other tools.
- When you’re done, close any temporary tabs you opened (or just
  `node tools/stop.js`) so the next session starts blank. Incognito clears session
  data automatically, but leaving tabs open can still briefly flash old pages on
  restart.

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
for each pick. Requires a visible browser session (`node tools/start.js --visible`).
Highlights now stay visible until you click elsewhere or press Enter/Esc so you
can confirm the selection without racing a timeout.

## Cookies

```bash
node tools/cookies.js
```

Prints cookie name/value plus domain/path/httpOnly/secure flags for the active tab.

## Hacker News Scraper

```bash
node tools/hn-scraper.js [--limit 20]
```

Fetches and parses the Hacker News front page using `cheerio`. Does **not** require Brave or remote debugging to be running.

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
cache directory (`./.cache/scraping` or `BROWSER_TOOLS_CACHE`). Run this when
the browsing task is complete so subsequent sessions start cleanly and no
windows are left open.

---

Troubleshooting:
- `✗ No active tab found` → make sure Brave was started via `tools/start.js` and at least one tab is open.
- Changing ports or browsers → update `browserURL` in each script.
