# Browser Tools – Agent Guide

Lightweight Brave automation helpers built on the Chrome DevTools Protocol. All scripts require
Brave running on `http://localhost:9222` with remote debugging enabled, launched via `start.js`.

These tools are designed to be orchestrated by agents, not by humans directly. This guide explains
how agents should compose them into robust, repeatable workflows.

---

## Quick Start

### Environment Requirements

- macOS with Brave Browser Nightly installed at `/Applications/Brave Browser Nightly.app`.
- Node.js 18+ (native `fetch` + ES modules). `.nvmrc` pins the expected major version.
- Poppler’s `pdftotext` on `PATH` (required for `pdf2md.js`).

### Agent Session Setup

After a human has run `./setup.sh` once **(agents must not invoke this script)**:

1. Set PATH so the Node shim is preferred:

   ```bash
   PATH="/Users/user/Projects/cow-tools/.bin:$PATH"
   ```

2. Set the working directory to the tools folder in your harness configuration:

   ```bash
   workdir="/Users/user/Projects/cow-tools/browser-tools"
   ```

3. Invoke tools via the shim:

   ```bash
   node start.js
   node nav.js https://example.com
   node ddg-search.js "query"
   ```

Scripts invoked with any other Node binary, or from the wrong working directory, will exit with an
error and instructions to fix PATH/workdir.

### Shell and Process Model

- Each `shell` call runs in a fresh process; no state is preserved between calls.
- Do not embed `cd`/`export` in command strings. Instead, configure PATH and `workdir` at the
  harness level so every call starts in `browser-tools/` with the shim on PATH.
- The tools assume BSD/macOS userland:
  - Use BSD-friendly flags for `sed`, `awk`, etc.
  - `mktemp` templates must end with `XXXXXX` (for example, `mktemp /tmp/readable.XXXXXX`).

---

## Core Concepts

### Session Management

- **Headless sessions**
  - Start with: `node start.js`
  - Brave runs headless in incognito mode using the automation profile directory.
  - Best for non-interactive tasks (searching, scraping, reading pages, extracting PDFs).

- **Visible sessions**
  - Start with: `node start.js --profile` (optionally `--reset` to wipe the profile first).
  - Loads the automation-helper extension, exposing `window.automation`.
  - Required for:
    - `pick.js` (element picker),
    - `login-helper.js` (human login overlay),
    - any workflows where a human needs to see or interact with the page.

- **Persistence**
  - The automation profile lives under `./.cache/automation-profile` (or `BROWSER_TOOLS_CACHE`).
  - Use `--reset` when you need a clean login state.
  - Use `stop.js` at the end of a run to close tabs and terminate Brave so subsequent sessions start
    clean.

### Content Extraction Policy

- Prefer **browser-based extraction** over raw HTTP:
  - Use `fetch-readable.js` to extract article-like content from the active tab as Markdown.
  - Use `pdf2md.js` to convert PDFs (menus, documents) to Markdown.
  - Use `nav.js` + `screenshot.js` when you need visual confirmation or when the layout is important.
  - Use `eval.js` for targeted DOM inspections and small extractions where Markdown is not needed.
- Reserve `curl`/`wget` for lightweight API calls or health checks only; when you use them, record
  why `fetch-readable.js`/`pdf2md.js` was not suitable.
- Temporary files:
  - When redirecting Markdown, use `/tmp` or similar (for example, `tmpfile="$(mktemp /tmp/readable.XXXXXX)"`).
  - Do not write extracted content into the repo unless you explicitly intend to version it.

Rationale: browser-based tools handle JS, cookies, and layout, and normalize output to Markdown or
structured data that is easier for agents to search, diff, and combine.

### Source Selection Strategy

Agents SHOULD:

- Issue one or two well-scoped `ddg-search.js` queries, then:
  - inspect the Markdown summary for orientation, and
  - use `ddg-search.js --json` + `jq` to filter the structured results.
- Prefer higher-signal sources when choosing URLs:
  1. Official domains (the site or organization’s own domain).
  2. Well-known guides, official documentation, or primary sources.
  3. Other results only when higher-signal sources are unavailable.
- Use `domain`, `siteName`, `date`, and `snippet` to avoid thin directories and low-quality pages.

### Search Pattern Best Practices

- Use semantically meaningful patterns:
  - Proper nouns, section titles, key phrases, product names.
  - Distinctive phrases that uniquely identify content.
- Avoid generic patterns:
  - Single digits or lone characters.
  - Very common words which will match everywhere.
- For prices and currencies:
  - Patterns like `"S$"` or `"¥"` are treated as literal tokens in `fetch-readable.js` / `pdf2md.js`
    search; prefer these over raw digits when looking for price lines.

### Auditability Requirements

When reporting specific facts derived from web content (for example, a particular menu item, price,
or line of text), agents MUST ensure at least one tool output includes that exact string (or a close
variant) so the extraction is auditable. This can come from:

- a `ddg-search.js` snippet (Markdown summary or snippet text),
- a `fetch-readable.js` match line,
- a `pdf2md.js` match line,
- or a targeted `eval.js` result.

---

## Tool Reference (Workflow Order)

### 1. Session Control

#### `start.js`

**Purpose:** Launch Brave with the automation profile and DevTools protocol exposed on `:9222`.

**When to Use:**

- At the beginning of any workflow that needs to use other browser tools.
- With `--profile` (and optionally `--reset`) when a human needs to see or interact with the page.

**Usage:**

```bash
node start.js [--profile] [--reset] [--no-proxy]
```

Key options:

- `--profile` – Launch a visible session using the persistent automation profile cache.
- `--reset` – Wipe the automation profile before launching (only meaningful with `--profile`).
- `--no-proxy` – Skip the baked-in SSH SOCKS proxy (rare; default is to keep it enabled).

Guidelines:

- Start Brave once per workflow and reuse the session for `nav.js`, `fetch-readable.js`, `ddg-search.js`,
  `pdf2md.js`, etc.
- If you see connection errors from other tools, verify Brave is running via `start.js` and that the
  remote debugging port is still `:9222`.
- Unless you pass `--no-proxy`, every run goes through the SSH tunnel configured in
  `browser-tools/lib/ssh-proxy-config.js`. Confirm that file points at the right VPS before launching.

#### `stop.js`

**Purpose:** Cleanly shut down the automation browser and close tabs.

**When to Use:**

- At the end of a workflow to ensure the next session starts fresh.
- Before re-running `start.js` when you suspect stale state.

**Usage:**

```bash
node stop.js
```

Behavior:

- Attempts to connect to Brave on `:9222` and close all tabs.
- Terminates any Brave processes launched with the automation profile directory.
- Stops the SSH SOCKS proxy started by `start.js` (unless you launched with `--no-proxy`).

Guidelines:

- Use `stop.js` rather than sending random signals to Brave processes.
- If no automation processes are found, the script prints an informational message and exits cleanly.

---

### 2. Discovery & Search

#### `ddg-search.js`

**Purpose:** Discover URLs and basic metadata via DuckDuckGo, using the full SERP rendered in Brave.

**When to Use:**

- As the entry point for most web lookups.
- Before `nav.js` when you need to find ranking articles, official sites, menus, or PDFs.

**Usage:**

```bash
node ddg-search.js "query"
node ddg-search.js --json "query"
```

**Output Formats:**

- Default: Markdown summary, e.g.:

  ```md
  # DuckDuckGo results for "query"

  ## 1. Title of Result

  - URL: https://example.com/path
  - Domain: example.com
  - Site: Example
  - Date: 4 days ago
  - Snippet: Short description…
  ```

- `--json`: JSON array, each element:

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

**Source Selection Strategy:**

- Prefer official domains (e.g., the bar/restaurant/site’s own domain) when moving from ranking
  articles to menus or pricing. Only fall back to aggregators or third-party listings when no
  official menu or pricing information is discoverable.
- Use `domain`, `siteName`, and `snippet` to filter out low-signal results (thin directories, SEO spam).
- Use `date` to bias toward recent sources when multiple rankings exist.

**Common Patterns (`--json`):**

```bash
# Top result URL
node ddg-search.js --json "topic here" \
  | jq -r '.[0].url'

# First result from a specific domain
node ddg-search.js --json "restaurant menu pdf" \
  | jq -r '[.[] | select(.domain | contains("restaurant.com"))][0].url'

# Ranked listing for scoring
node ddg-search.js --json "best restaurants city 2025" \
  | jq -r '.[] | "\(.position). [\(.date)] \(.title) — \(.domain)"'
```

**Examples of Markdown-mode usage:**

```bash
# Preview results for debugging/logging
node ddg-search.js "best restaurants tokyo 2025"

# Scan for specific domains in the summary
node ddg-search.js "top bars in japan 2025" | rg "worlds50best.com"

# Keep a human-readable trace alongside structured output
node ddg-search.js "target query" > /tmp/search-summary.md
node ddg-search.js --json "target query" | jq '...'
```

**Anti-patterns:**

- Running many similar `ddg-search.js` queries with tiny variations instead of:
  - issuing 1–2 precise queries, then
  - filtering the JSON via `jq`.
- Treating `--json` output as free text instead of structured data.

---

### 3. Navigation & Inspection

#### `nav.js`

**Purpose:** Navigate the active Brave tab to a URL, or open a new tab.

**When to Use:**

- After `start.js`, to open pages discovered via `ddg-search.js`.
- Before `fetch-readable.js` / `eval.js` / `screenshot.js` when you need the page loaded.

**Usage:**

```bash
node nav.js <url> [--new]
```

Guidelines:

- Use `--new` when you need to keep the current page open (for example, while opening a menu in a
  separate tab).
- If you see `✗ No active tab found`, ensure Brave was started via `start.js` and that at least one
  tab is open.

#### `eval.js`

**Purpose:** Evaluate JavaScript in the active tab and print the result.

**When to Use:**

- To inspect DOM state (titles, link lists, specific elements).
- To extract small pieces of data or probe for the presence of sections before running heavier tools.

**Usage:**

```bash
node eval.js 'document.title'
node eval.js 'document.querySelectorAll("a").length'
```

Guidelines:

- Prefer targeted queries over `document.body.innerText` dumps.
- Return structured data (arrays/objects) when possible so later steps can filter them.

Examples:

```bash
# All links on the page
node eval.js "[...document.links].map(a => a.href)"

# Links that look like menus
node eval.js "[...document.links].map(a => a.href).filter(h => /menu/i.test(h))"

# First element whose text contains a distinctive keyword
node eval.js "[...document.querySelectorAll('body *')].find(el => /keyword/i.test(el.textContent||''))?.textContent"
```

#### `cookies.js`

**Purpose:** Inspect cookies for the active tab.

**When to Use:**

- To confirm login/session state after `login-helper.js`.
- To verify that authentication cookies are present before continuing with protected pages.

**Usage:**

```bash
node cookies.js
```

Output:

- Prints one block per cookie:

  ```text
  name: value
    domain: example.com
    path: /
    httpOnly: true
    secure: true
  ```

---

### 4. Content Extraction

#### `fetch-readable.js`

**Purpose:** Extract the main article content from the active tab using Mozilla Readability, convert it
to Markdown, and optionally search within it.

**When to Use:**

- For article-like pages (rankings, news, blogs, long-form content).
- When you need normalized Markdown output for further analysis or matching.

**Usage:**

```bash
node fetch-readable.js <url> > article.md
node fetch-readable.js <url> --search "pattern" --context N --search-flags ie
```

Guidelines:

- Prefer meaningful search patterns (section titles, proper nouns, key phrases) over generic ones.
- Use `--search` + `--context` to get a compact “Matches” block ahead of the full Markdown.
- Keep raw HTTP (`curl`/`wget`) as a last resort and document why `fetch-readable.js` was not used.

Examples:

```bash
# Extract article and save Markdown
node fetch-readable.js https://example.com/article > /tmp/article.md

# Search for a section heading with minimal context
node fetch-readable.js https://example.com/article \
  --search "Restaurant of the Year|Top 50" \
  --context 0
```

#### `pdf2md.js`

**Purpose:** Convert PDFs to Markdown and optionally search within the text.

**When to Use:**

- For menus and other PDFs where you need text extraction (prices, item names, sections).
- When you need to search inside PDFs by heading, item name, or price token.

**Usage:**

```bash
node pdf2md.js /path/to/file.pdf
node pdf2md.js https://example.com/file.pdf --search "pattern" --context N --search-flags ie
```

Guidelines:

- Use `--search` / `--context` / `--search-flags` as the primary way to locate relevant lines.
- Choose patterns that correspond to headings or distinctive terms (e.g., `"Desserts"`, `"Signature"`),
  not generic numbers.
- When you need the full text, stream it (e.g., `pdf2md.js … | less`) or direct it into downstream
  processing; avoid writing to the repo.

Examples:

```bash
# Locate a section heading and show nearby items
node pdf2md.js https://example.com/menu.pdf \
  --search "Desserts" \
  --context 4 \
  --search-flags i

# Find all occurrences of a keyword with minimal padding
node pdf2md.js /path/to/menu.pdf \
  --search "oyster" \
  --search-flags i \
  --context 1
```

---

### 5. Visual & Interactive

#### `screenshot.js`

**Purpose:** Capture PNG screenshots of the current tab for visual inspection or logging.

**When to Use:**

- To verify page layout, element presence, or highlight choices.
- To include visual evidence alongside textual extractions.

**Usage:**

```bash
node screenshot.js [--selector <css>] [--viewport]
```

Guidelines:

- Use `--selector` to capture just a specific element (e.g., a menu section).
- Use `--viewport` to capture only the visible area rather than the full page.
- The script prints the PNG path; agents can pass this path to `open` or attach it to logs.

#### `pick.js`

**Purpose:** Let a human select one or more elements in a visible session and return metadata
about the selection.

**When to Use:**

- When you need a human to identify a specific element (e.g., a tricky button or menu section).
- To capture stable selectors or text snippets for further automation.

**Usage:**

```bash
node pick.js "Instruction to display to the human"
```

Guidelines:

- Requires a visible session (`node start.js --profile`).
- Supports multi-select via Cmd/Ctrl+click, Enter to confirm, Esc to cancel.
- Returns objects with fields like `tag`, `id`, `class`, `text`, `html`, and `parents`.

#### `login-helper.js`

**Purpose:** Display a persistent overlay prompting a human to log in, and wait for confirmation.

**When to Use:**

- At the start of workflows that require authenticated access to protected areas.
- Before accessing pages that depend on a human’s credentials (accounts, dashboards, etc.).

**Usage:**

```bash
node login-helper.js [--url <page>] [--message <text>] [--timeout <seconds>]
```

Guidelines:

- Requires a visible session (`node start.js --profile`).
- The overlay persists across navigations and popup-based flows until the user:
  - confirms login (exit code `0`),
  - skips (exit code `2`),
  - or the timeout expires (exit code `3`).
- After successful login, use `cookies.js` or `eval.js` to confirm session state, then continue.

---

## Common Workflows

### Workflow 1: Find and Extract Article Content

```bash
# 1. Search for content (human-readable summary + JSON for structure)
node ddg-search.js "topic of interest" > /tmp/topic-search.md
url="$(node ddg-search.js --json "topic of interest" \
  | jq -r '.[0].url')"

# 2. Extract readable content
node fetch-readable.js "$url" --search "keyword|Section Title" --context 2

# 3. Verify visually if needed
screenshot_path="$(node screenshot.js --viewport)"
open "$screenshot_path"
```

### Workflow 2: Extract Specific Data from a PDF Menu

```bash
# 1. Discover a likely menu PDF URL
pdf_url="$(
  node ddg-search.js --json "restaurant menu pdf" \
    | jq -r '[.[] | select(.domain | contains("restaurant.com"))][0].url'
)"

# 2. Extract the target section with context
node pdf2md.js "$pdf_url" \
  --search "Desserts" \
  --context 5 \
  --search-flags i
```

### Workflow 3: Interactive Login Flow

```bash
# 1. Start a visible session
node start.js --profile --reset

# 2. Navigate to login page
node nav.js https://example.com/login

# 3. Wait for human login
node login-helper.js --message "Log into Example.com" --timeout 300

# 4. Verify login state
node cookies.js | rg "session"

# 5. Continue with authenticated session
node nav.js https://example.com/protected-page
```

---

## Troubleshooting

- `✗ No active tab found`
  - Ensure Brave was started via `start.js`.
  - Ensure at least one tab is open before running tools that depend on the active tab.

- `✗ Wrong Node binary / Node shim error`
  - Confirm `PATH` includes the `.bin/node` shim and that tools are launched via the shim.

- `✗ Wrong working directory`
  - Ensure the harness `workdir` is set to `/Users/user/Projects/cow-tools/browser-tools`.

- `✗ Unable to connect to Brave on http://localhost:9222`
  - Ensure `start.js` has been run and that no firewall or port conflict is blocking DevTools.
