## Tooling ideas

- PDF menu extractor CLI: download via browser-tools stack, convert to text, support section/regex filtering so agents can grab first items without manual curl+pdftotext.
- Ensure helper supports temporary file cleanup and citations so extracted snippets can be referenced.
- aws-docs-search CLI: automate https://docs.aws.amazon.com/search/doc-search.html?searchPath=... via Puppeteer, support filters (path, limit, service) and extract title/url/snippet/service from shadow DOM.
  - Consider upgrading later to call any JSON search endpoint if exposed; for now rely on DOM extraction and 'Load more' button.
