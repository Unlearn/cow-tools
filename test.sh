#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

function main() {
  cd "$ROOT"

  if [[ ! -d node_modules ]]; then
    echo "Installing npm dependencies…"
    npm install
  fi

  if ! command -v npx >/dev/null 2>&1; then
    echo "ERROR: npm/npx not found in PATH." >&2
    exit 1
  fi

  export PATH="$ROOT/.bin:$PATH"
  export BROWSER_TOOLS_ALLOW_ROOT=1

  echo "Running TypeScript type checks (JSDoc, non-blocking)…"
  if ! npx tsc; then
    echo "Typecheck reported issues (non-blocking); see output above." >&2
  fi

  echo "Running Playwright tests…"
  npx playwright test "$@"
}

main "$@"
