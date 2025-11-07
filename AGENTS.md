# Browser Tools

Lightweight Brave automation helpers built on the Chrome DevTools Protocol. All scripts expect Brave running on `http://localhost:9222` with remote debugging enabled.

## Requirements & Install
- macOS with Brave at `/Applications/Brave Browser.app`.
- Node.js 18+ (ES modules + built-in `fetch`). `.nvmrc` pins 20.11.1 when using nvm.
- From this directory run `./setup.sh` to load the desired Node version, install dependencies (`puppeteer-core`, `cheerio`, `turndown`), and download the latest `lib/Readability.js` used by the fetch-readable tool.

## Start Brave

```bash
node tools/start.js              # Fresh profile in ~/.cache/scraping
node tools/start.js --profile    # rsync user's Brave profile first
```

The helper kills existing Brave, launches a new instance on port 9222, and waits until DevTools responds. Keep the browser running while using the other tools.

## Navigate

```bash
node tools/nav.js https://example.com
node tools/nav.js https://example.com --new
```

Navigate the current tab; `--new` opens a separate tab. Errors if no tab is available.

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

Interactive overlay for collecting element metadata. Cmd/Ctrl+click adds to the selection, Enter confirms, Esc cancels. Returns tag/id/class/text/html snippets for each pick.

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
node tools/fetch-readable.js https://example.com article.md
```

Loads the page in the active Brave session, injects Mozilla Readability to grab the main article, converts it to Markdown, and saves it locally (default `readable-<timestamp>.md`). Ideal for logged-in or JS-heavy pages where curl/readability isn’t enough.

---

Troubleshooting:
- `✗ No active tab found` → make sure Brave was started via `tools/start.js` and at least one tab is open.
- Changing ports or browsers → update `browserURL` in each script.
