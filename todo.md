## Tooling ideas

- aws-docs-search CLI: automate https://docs.aws.amazon.com/search/doc-search.html?searchPath=... via Puppeteer, support filters (path, limit, service) and extract title/url/snippet/service from shadow DOM.
  - Consider upgrading later to call any JSON search endpoint if exposed; for now rely on DOM extraction and 'Load more' button.
