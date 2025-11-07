#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck source=/dev/null
    . "$HOME/.nvm/nvm.sh"
    if [ -f .nvmrc ]; then
        nvm install >/dev/null
        nvm use >/dev/null
    fi
else
    echo "Warning: nvm not found; ensure Node.js >= 18 is available" >&2
fi

if command -v node >/dev/null 2>&1; then
    node -e 'const major = Number(process.versions.node.split(".")[0]); if (Number.isNaN(major) || major < 18) { console.error("Node.js 18+ required; found", process.versions.node); process.exit(1); }'
else
    echo "Error: Node.js is not installed" >&2
    exit 1
fi

npm install

# Ensure Readability script is up to date for fetch-readable.js
LIB_DIR="$ROOT/lib"
READABILITY_URL="https://raw.githubusercontent.com/mozilla/readability/master/Readability.js"
READABILITY_PATH="$LIB_DIR/Readability.js"
mkdir -p "$LIB_DIR"
if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$READABILITY_URL" -o "$READABILITY_PATH"
elif command -v wget >/dev/null 2>&1; then
    wget -q "$READABILITY_URL" -O "$READABILITY_PATH"
else
    echo "Warning: curl/wget not available; skipping Readability.js refresh" >&2
fi

echo "Browser tools ready. Start Brave with: node tools/start.js [--profile]"
