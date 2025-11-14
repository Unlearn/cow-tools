# Browser Tools

Lightweight Brave automation helpers built on the Chrome DevTools Protocol. All scripts require Brave running on `http://localhost:9222` with remote debugging enabled, launched with `start.js`.

These tools are designed to be orchestrated by agents, not by humans directly. This document describes
how agents should compose them into robust, repeatable workflows.

## Requirements & Install

- macOS with Brave at `/Applications/Brave Browser.app`.
- Node.js 18+ (ES modules + built-in `fetch`). `.nvmrc` pins the required Node major version (currently `24`) when using nvm.
- Initial setup (**human-only, never agents**): run `./setup.sh` once to install dependencies (`puppeteer-core`, `turndown`), refresh `lib/Readability.js`, and create `.bin/node` which pins the correct Node binary. If the shim is missing/outdated, pause and ask a human to rerun the script.
- Shell usage assumes BSD/macOS userland: prefer BSD-friendly flags (`sed`, `awk`, etc.) and remember `mktemp` templates must end with `XXXXXX` (for example, `mktemp /tmp/readable.XXXXXX`).
- Agent sessions: after running `setup.sh`, **always** execute commands through the repo’s Node shim. Either set `PATH="/Users/user/Projects/cow-tools/.bin:$PATH"` (preferred) or call `/Users/user/Projects/cow-tools/.bin/node browser-tools/<script>.js`. Scripts invoked via any other Node binary will exit immediately.
- Each `shell` call runs in a fresh process. Set `workdir="/Users/user/Projects/cow-tools/browser-tools"` in the CLI before running `node <script>.js`; commands from other directories now fail fast so you fix the workdir instead of relying on auto-`cd`.
- Once the correct PATH and workdir are in place, invoke `node start.js`, `node nav.js …`, etc.—the shim handles `BROWSER_TOOLS` and PATH wiring. Avoid embedding `cd`/`export` sequences inside the command string so the harness can track paths correctly.
- CLI scripts validate both the Node shim and the working directory on startup. If you see the error message about using `/Users/user/Projects/cow-tools/.bin/node` or setting the browser-tools workdir, update the `workdir`/`PATH` in your `shell` call and rerun; chaining `cd` in the command string will not work.

## Search & Source Selection Guidelines

Agents SHOULD:

- Issue one or two well-scoped `ddg-search.js` queries, then filter results with `jq` or similar tools,
  rather than sending many small variations of the same query.
- Treat `ddg-search.js` as a structured JSON producer. Always parse and filter the JSON; do not treat
  the output as plain text.
- Prefer higher-signal sources when choosing URLs:
  1. Official domains (the site or organization’s own domain).
  2. Well-known guides, official documentation, or primary sources.
  3. Other results only when higher-signal sources are unavailable.
- Use `domain`, `siteName`, `date`, and `snippet` to avoid thin directories and low-quality pages when
  better options exist.

When reporting specific facts derived from web content (for example, a particular item, price, or line
of text), agents MUST ensure at least one tool output includes that exact string (or a close variant) so
the extraction is auditable. This can come from:

- a `ddg-search.js` snippet,
- a `fetch-readable.js` match line,
- a `pdf2md.js` match line,
- or a targeted `eval.js` result.

## Start Brave

```bash
node start.js [--profile] [--reset]
```

- Default: `node start.js` runs Brave headless in incognito mode using the automation profile directory so nothing from previous runs leaks forward.
- `--profile` opens a visible session backed by the persistent automation profile under `./.cache/automation-profile`. Use this for UI workflows such as `pick.js`.
- `--reset` wipes that automation profile before launch (only meaningful with `--profile`) so you can log in from scratch.
- The helper terminates only prior automation instances using this profile, launches a fresh one on :9222, and waits until DevTools responds. Keep the automation browser running while using other tools, and run `node stop.js` when you’re done.
- Environment overrides: set `BROWSER_TOOLS_WINDOW_SIZE` (default `2560,1440`) or `BROWSER_TOOLS_USER_AGENT` (defaults to a modern macOS Chrome UA) when you need alternate viewports/agents.

## Navigate

```bash
node nav.js https://example.com
node nav.js https://example.com --new
```

Navigate the current tab; `--new` opens a separate tab. Errors if no tab is available.

## Evaluate JavaScript

```bash
node eval.js 'document.title'
node eval.js 'document.querySelectorAll("a").length'
```

Run arbitrary async-friendly JavaScript in the active tab to inspect DOM state or return structured data.

Agents SHOULD:

- Prefer targeted DOM queries over full `document.body.innerText` dumps. Use selectors and filters to
  return only the relevant nodes or text.
- Return structured data where possible (arrays or objects) so later steps can filter and transform the
  results programmatically.

Examples of targeted patterns:

```bash
# All links on the page
node eval.js "[...document.links].map(a => a.href)"

# Links that look like menus
node eval.js "[...document.links].map(a => a.href).filter(h => /menu/i.test(h))"

# First element whose text contains a distinctive keyword
node eval.js "[...document.querySelectorAll('body *')].find(el => /keyword/i.test(el.textContent||''))?.textContent"
```

## Screenshot

```bash
node screenshot.js [--selector "#main"] [--viewport]
```

Captures a PNG in the system temp directory (full page by default) and prints the path. Use `--selector` to capture only a specific element or `--viewport` to limit the shot to what’s currently visible.

## Pick Elements

```bash
node pick.js "Click the submit button"
```

Interactive overlay for collecting element metadata. Cmd/Ctrl+click adds to the selection, Enter confirms, Esc cancels. Returns tag/id/class/text/html snippets for each pick. Requires a visible browser session (`node start.js --profile`). Highlights stay visible until you click elsewhere or press Enter/Esc so you can confirm the selection without racing a timeout, and single clicks aren’t committed until you press Enter—click another element to replace the pending selection without rerunning the command.

## Cookies

```bash
node cookies.js
```

Prints cookie name/value plus domain/path/httpOnly/secure flags for the active tab.

## DuckDuckGo Search

```bash
node ddg-search.js "prompt engineering"
```

Entry point for most web lookups. After Brave is running via `node start.js` or `node start.js --profile`, agents call `ddg-search.js` to run a DuckDuckGo web search and receive a JSON array of results. Each element has the shape:

```json
{
  "position": 1,
  "title": "Example Title",
  "url": "https://example.com/path",
  "domain": "example.com",
  "siteName": "Example",
  "date": "4 days ago",
  "snippet": "Result summary text without the date prefix…"
}
```

Agents MUST treat this as structured data, not free text. Typical patterns:

```bash
# Take the top result URL
ddg-search.js "gibney cottesloe dinner menu" \
  | jq -r '.[0].url'

# First result from a specific domain
ddg-search.js "restaurant of the year 2025 perth" \
  | jq -r '[.[] | select(.domain | contains("wagoodfoodguide.com"))][0].url'

# Ranked listing for downstream scoring
ddg-search.js "best restaurants perth 2025" \
  | jq -r '.[] | "\(.position). [\(.date)] \(.title) — \(.domain)"'
```

Flow for web tasks:
1. `ddg-search.js "query"` → JSON list of candidate pages.
2. Pipe to `jq` to select one or more URLs.
3. Pass those URLs to `nav.js`, `fetch-readable.js`, `pdf2md.js`, or `screenshot.js` depending on the content type.

Agents SHOULD refine their choice of URL via JSON filtering (by `domain`, `siteName`, and `snippet`)
instead of issuing many similar `ddg-search.js` queries. Use a small number of precise queries and let
the filters do the work.

## Fetch Readable Content

```bash
node fetch-readable.js https://example.com > article.md
node fetch-readable.js https://example.com --search "dessert|Tokyo" --context 1 --search-flags i
```

Loads the page in the active Brave session, injects Mozilla Readability to grab the main article, converts it to Markdown, and streams the content to stdout so you can pipe or redirect it. Ideal for logged-in or JS-heavy pages where curl/readability isn’t enough. `--search` accepts a JavaScript regular expression (no delimiters) and prints matching lines (in Markdown) before the full article; `--context N` controls how many nearby words accompany each hit (default `0`), and `--search-flags` passes additional regex flags (e.g. `i` for case-insensitive).

**Note:** Prefer piping directly (e.g. `node fetch-readable.js … | rg keyword`). Only redirect to a file when necessary, and if you do, use a temporary path (e.g. `tmpfile="$(mktemp /tmp/readable.XXXXXX)"` then `node … > "${tmpfile}.md"`), so nothing lingers in the repo. **Policy:** Avoid `curl`/`wget` for article content—spin up Brave with `node start.js` and use `fetch-readable.js` (or `nav.js` + `screenshot.js`) so the output is normalized to Markdown. Reserve raw HTTP fetches for lightweight API calls or status checks and call out the reason if you must use them.

Search patterns SHOULD be semantically meaningful (proper nouns, section titles, key phrases) rather
than generic patterns like single digits or very common words. When possible, search for headings or
distinctive phrases that uniquely identify the section or concept you care about.

## PDF → Markdown

```bash
node pdf2md.js /path/to/menu.pdf [--search pattern] [--context N] [--search-flags ie]
node pdf2md.js https://example.com/menu.pdf [--search pattern] [--context N] [--search-flags ie]
```

- Use `pdf2md.js` to convert PDFs to Markdown; it shells out to `pdftotext` (Poppler) and streams Markdown to stdout for further processing by the agent. It is especially useful for menu-style PDFs, but can be applied to other document types as well.
- Agents SHOULD use the built-in `--search` / `--context` / `--search-flags` flags (same semantics as `fetch-readable.js`) as the primary way to locate relevant lines, rather than piping raw output to external grep tools. The tool already emits contextual “Matches (…)” blocks followed by the full Markdown.
- When the full Markdown is needed, stream it and page it (e.g. `pdf2md.js … | less`) or feed it into downstream text processing; only redirect to a file when necessary, and if you do, use a temp path under `/tmp` as with `fetch-readable.js`.
- URL inputs are fetched directly via Node `fetch` with a browser-like User-Agent; no Brave session is required for simple PDF URLs, but still prefer `fetch-readable.js` + `nav.js` for HTML/article flows.

When using `--search`, choose patterns that correspond to headings, product names, or other distinctive
terms instead of generic numbers or very short tokens. This keeps the matches focused and reduces noise
for downstream steps.

Search-oriented usage examples for agents:

```bash
# Locate a section heading (e.g. "Seafood Bar") and show nearby items
pdf2md.js https://gibneycottesloe.com/s/DiningMenu \
  --search "Seafood Bar" \
  --context 4

# Find all occurrences of "oyster" (case-insensitive) with minimal padding
pdf2md.js /path/to/menu.pdf \
  --search "oyster" \
  --search-flags i \
  --context 1
```

Pattern: “first item in a menu section”
1. Use `ddg-search.js` + `jq` to discover the menu PDF URL.
2. Call `pdf2md.js <url> --search "<section name>" --context N` to emit the section and its items.
3. From the emitted Markdown, take the first non-empty line following the section heading as the “first item” to report back.

When you capture screenshots, share them by running `open /path/to/file.png` so the user sees the image immediately. The screenshot tool returns a temp-file path—opening it is expected unless told otherwise.

## Login Helper

```bash
node login-helper.js [--url https://example.com/login] [--message "Log into Foo"] [--timeout 300]
```

Displays a dedicated overlay (separate from the automation banner) in the visible Brave session so a human can log in. The prompt stays active across navigations and popup-based flows until the user clicks “I'm logged in” (exit code `0`), “Skip” (exit code `2`), or the timeout elapses (exit code `3`). Use this anytime the agent needs credentials before continuing a workflow. **Must be run with `node start.js --profile`** so the login persists across sessions; this is the only supported way for agents to access protected areas tied to user accounts.

## Stop Automation Browser

```bash
node stop.js
```

Terminates any Brave processes launched via `tools/start.js` for the current cache directory (`./.cache/automation-profile` or `BROWSER_TOOLS_CACHE`). Run this when the browsing task is complete so subsequent sessions start cleanly and no windows are left open.

---

Troubleshooting:

- `✗ No active tab found` → make sure Brave was started via `start.js` and at least one tab is open.
- Changing ports or browsers → update `browserURL` in each script.
