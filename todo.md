## Tooling ideas

- `pdf2md.js`: PDF → Markdown menu extractor CLI (PDF-focused, self-contained, but able to use the browser stack for fetching):
  - Location and invocation: lives under `browser-tools/` as `pdf2md.js` and is invoked via the Node shim (for agents: `PATH="/Users/user/Projects/cow-tools/.bin:$PATH"`, `workdir="/Users/user/Projects/cow-tools/browser-tools"`, then `node pdf2md.js …`).
  - Accepts a PDF URL or local file path and emits Markdown (not plain text) to stdout, using `pdftotext` + a light Markdown normaliser tuned for menus.
  - When given a URL, prefers a browser-based fetch path (driving Brave/headless via a helper) to follow redirects and JS-heavy download flows cleanly; falls back to a simple HTTP fetch when a direct PDF link is sufficient.
  - Interface mirrors `fetch-readable.js`: `<source>` argument plus `--search`, `--context`, and `--search-flags` to find matches in the generated Markdown, so agents can use the same mental model for HTML and PDF content.
  - Always uses temporary files for downloads (e.g. `mktemp /tmp/pdf-menu.XXXXXX`) and cleans them up on success/failure, and emits a small citation block on stderr (source URL/path, download time, page count if available) so snippets can be referenced.
  - Testing plan (Playwright-focused, end-to-end):
    - Add new Playwright specs (e.g. `tests/pdf-tools.spec.mjs`) that invoke `pdf2md.js` via `child_process` against local PDF fixtures and assert on stdout (Markdown), stderr (citation), and exit codes.
    - Add PDF→Markdown conversion fixtures (small, deterministic menus) to validate headings, line wrapping, and dessert item extraction; include error-path cases like corrupted PDFs and missing files.
    - Exercise the `--search` / `--context` / `--search-flags` flags end-to-end on the generated Markdown, ensuring the “Matches (pattern: …, context words: …)” block matches `fetch-readable.js` formatting (including the no-match case).
    - Optionally add gated integration tests that drive the browser-based fetch path for a known public PDF (using `start.js` + Brave), controlled via an env flag so they don’t run by default.
- aws-docs-search CLI: automate https://docs.aws.amazon.com/search/doc-search.html?searchPath=... via Puppeteer, support filters (path, limit, service) and extract title/url/snippet/service from shadow DOM.
  - Consider upgrading later to call any JSON search endpoint if exposed; for now rely on DOM extraction and 'Load more' button.
