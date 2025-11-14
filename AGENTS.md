# Browser Tools

Lightweight Brave automation helpers built on the Chrome DevTools Protocol. All scripts require Brave running on `http://localhost:9222` with remote debugging enabled launched with start.js.

## Requirements & Install

- macOS with Brave at `/Applications/Brave Browser.app`.
- Node.js 18+ (ES modules + built-in `fetch`). `.nvmrc` pins the required Node major version (currently `24`) when using nvm.
- Initial setup (**human-only, never agents**): run `./setup.sh` once to install dependencies (`puppeteer-core`, `turndown`), refresh `lib/Readability.js`, and create `.bin/node` which pins the correct Node binary. If the shim is missing/outdated, pause and ask a human to rerun the script.
- Shell usage assumes BSD/macOS userland: prefer BSD-friendly flags (`sed`, `awk`, etc.) and remember `mktemp` templates must end with `XXXXXX` (for example, `mktemp /tmp/readable.XXXXXX`).
- Agent sessions: after running `setup.sh`, **always** execute commands through the repo’s Node shim. Either set `PATH="/Users/user/Projects/cow-tools/.bin:$PATH"` (preferred) or call `/Users/user/Projects/cow-tools/.bin/node browser-tools/<script>.js`. Scripts invoked via any other Node binary will exit immediately.
- Each `shell` call runs in a fresh process. Set `workdir="/Users/user/Projects/cow-tools/browser-tools"` in the CLI before running `node <script>.js`; commands from other directories now fail fast so you fix the workdir instead of relying on auto-`cd`.
- Once the correct PATH and workdir are in place, invoke `node start.js`, `node nav.js …`, etc.—the shim handles `BROWSER_TOOLS` and PATH wiring. Avoid embedding `cd`/`export` sequences inside the command string so the harness can track paths correctly.
- CLI scripts validate both the Node shim and the working directory on startup. If you see the error message about using `/Users/user/Projects/cow-tools/.bin/node` or setting the browser-tools workdir, update the `workdir`/`PATH` in your `shell` call and rerun; chaining `cd` in the command string will not work.

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

Entry point for most web lookups. After Brave is running via `node start.js` or `node start.js --profile`, call `ddg-search.js` to run a DuckDuckGo web search and return structured JSON results (position, title, URL, domain, siteName, date, snippet). Use these results to choose one or more URLs, then hand them off to `nav.js` / `fetch-readable.js` / `screenshot.js` as needed.

## Fetch Readable Content

```bash
node fetch-readable.js https://example.com > article.md
node fetch-readable.js https://example.com --search "dessert|Tokyo" --context 1 --search-flags i
```

Loads the page in the active Brave session, injects Mozilla Readability to grab the main article, converts it to Markdown, and streams the content to stdout so you can pipe or redirect it. Ideal for logged-in or JS-heavy pages where curl/readability isn’t enough. `--search` accepts a JavaScript regular expression (no delimiters) and prints matching lines (in Markdown) before the full article; `--context N` controls how many nearby words accompany each hit (default `0`), and `--search-flags` passes additional regex flags (e.g. `i` for case-insensitive).

**Note:** Prefer piping directly (e.g. `node fetch-readable.js … | rg keyword`). Only redirect to a file when necessary, and if you do, use a temporary path (e.g. `tmpfile="$(mktemp /tmp/readable.XXXXXX)"` then `node … > "${tmpfile}.md"`), so nothing lingers in the repo. **Policy:** Avoid `curl`/`wget` for article content—spin up Brave with `node start.js` and use `fetch-readable.js` (or `nav.js` + `screenshot.js`) so the output is normalized to Markdown. Reserve raw HTTP fetches for lightweight API calls or status checks and call out the reason if you must use them.

## PDF → Markdown

```bash
node pdf2md.js /path/to/menu.pdf [--search pattern] [--context N] [--search-flags ie]
node pdf2md.js https://example.com/menu.pdf [--search pattern] [--context N] [--search-flags ie]
```

- Use `pdf2md.js` for menu-style PDFs only; it shells out to `pdftotext` (Poppler) and streams Markdown to stdout.
- Prefer the built-in `--search` / `--context` / `--search-flags` flags (same semantics as `fetch-readable.js`) instead of piping to `rg`—the tool already emits contextual “Matches (…)” blocks followed by the full Markdown.
- When you need the full output, stream it and page it (e.g. `node pdf2md.js … | less`); only redirect to a file when necessary, and if you do, use a temp path under `/tmp` as with `fetch-readable.js`.
- URL inputs are fetched directly via Node `fetch` with a browser-like User-Agent; no Brave session is required for simple PDF URLs, but still prefer `fetch-readable.js` + `nav.js` for HTML/article flows.

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
