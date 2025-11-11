#!/usr/bin/env bash

set -euo pipefail

function setup() {
  text_green="\e[1;32m"
  text_red="\e[1;31m"
  text_blue="\e[1;34m"
  text_yellow="\e[1;33m"
  text_default="\e[0m"
  show_duration=1

  # Disable colors and duration if not running in a terminal
  if [[ ! -t 1 ]]; then
    text_green=""
    text_red=""
    text_blue=""
    text_yellow=""
    text_default=""
    show_duration=0
  fi

  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  prerequisites=("node" "npm" "curl" "awk")
  prerequisites_check

  debug_mode=0
  export NVM_DEBUG=1
}

function prerequisites_check() {
  for prerequisite in "${prerequisites[@]}"; do
    if ! command -v "$prerequisite" &> /dev/null; then
      fail ""\$prerequisite" must be installed." 70
    fi
  done
}

function success() {
  printf "${text_green}%s${text_default}\n" "$1"
}

function info() {
  printf "${text_blue}%s${text_default}\n" "$1"
}

function warn() {
  printf "${text_yellow}Warning: %s${text_default}\n" "$1"
}

function fail() {
  local status="${2:-1}"
  printf >&2 "${text_red}ERROR: %s${text_default}\n" "$1"
  exit "$status"
}

function debug() {
  if (( debug_mode )); then
    printf "${text_yellow}DEBUG: %s${text_default}\n" "$1"
  fi
}

function usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Description:
  Sets up the browser-tools environment by installing Node.js dependencies,
  creating a local Node.js shim for tool execution, and downloading required
  third-party scripts like Readability.js.

Options:
  -h, --help     Show this help message and exit
  -d, --debug    Enable debug output

Examples:
  $(basename "$0")
EOF
}

strip_path_entry() {
    local raw_path="${1:-}"
    local target="$2"
    awk -v path="$raw_path" -v target="$target" '
        BEGIN {
            n = split(path, parts, ":");
            output = "";
            for (i = 1; i <= n; i++) {
                if (parts[i] == target) {
                    continue;
                }
                if (output != "") {
                    output = output ":" parts[i];
                } else {
                    output = parts[i];
                }
            }
            print output;
        }
    '
}

function nvm_cmd() {
  set +u
  nvm "$@"
  local status=$?
  set -u
  return "$status"
}

function main() {
  cd "$ROOT"

  info "Configuring PATH for setup..."
  local SHIM_DIR="$ROOT/.bin"
  local CLEAN_PATH
  CLEAN_PATH="$(strip_path_entry "${PATH:-}" "$SHIM_DIR")"
  if [ -z "$CLEAN_PATH" ]; then
      PATH="/usr/bin:/bin"
  else
      PATH="$CLEAN_PATH"
  fi
  export PATH
  debug "PATH set to: $PATH"

  info "Checking for NVM and Node.js version..."
  if [ -s "$HOME/.nvm/nvm.sh" ] && [ -f .nvmrc ]; then

      # shellcheck source=/dev/null
      set +u
      source "$HOME/.nvm/nvm.sh" || true
      set -u

      info "Using Node.js version from .nvmrc..."

      # nvm use will read from .nvmrc automatically and will fail if not installed
      if ! nvm_cmd use 2>/dev/null; then
          info "Required Node.js version not installed, installing..."
          local node_version="$(cat .nvmrc)"
          nvm_cmd install "$node_version"
          nvm_cmd use "$node_version"
      fi

      info "Using Node.js version $(node --version)"
  else
      fail "nvm not found or .nvmrc missing"
  fi

  local NODE_BIN
  NODE_BIN="$(type -p node || true)"
  if [ -z "$NODE_BIN" ]; then
      fail "Node.js is not installed or not in PATH."
  fi

    info "Checking Node.js version..."
  "$NODE_BIN" -e 'const major = Number(process.versions.node.split(".")[0]); if (Number.isNaN(major) || major < 18) { console.error("Node.js 18+ required; found", process.versions.node); process.exit(1); }'

  info "Installing Node.js dependencies..."
  if [ -f package-lock.json ]; then
      npm ci
  else
      npm install
  fi

  info "Creating local Node.js shim..."
  local SHIM_DIR="$ROOT/.bin"
  local TOOLNODE_SHIM="$SHIM_DIR/toolnode"
  if [ "$NODE_BIN" = "$TOOLNODE_SHIM" ]; then
      fail "Resolved Node binary points to the shim path; remove $TOOLNODE_SHIM and rerun setup."
  fi

  if [ -n "$NODE_BIN" ]; then
      mkdir -p "$SHIM_DIR"
      cat >"$TOOLNODE_SHIM" <<EOF
#!/usr/bin/env bash
set -euo pipefail

ROOT="${ROOT}"
NODE_BIN="${NODE_BIN}"

export BROWSER_TOOLS="\${BROWSER_TOOLS:-\${ROOT}}"

case ":\$PATH:" in
    *:"\${ROOT}/.bin":*)
        ;;
    *)
        PATH="\${ROOT}/.bin:\$PATH"
        ;;
esac

case ":\$PATH:" in
    *:"\${ROOT}/tools":*)
        ;;
    *)
        PATH="\${ROOT}/tools:\$PATH"
        ;;
esac

export PATH
exec "\$NODE_BIN" "\$@"
EOF
      chmod +x "$TOOLNODE_SHIM"
      debug "Node shim created at $TOOLNODE_SHIM pointing to $NODE_BIN"
  else
      warn "Unable to locate node binary for shim creation."
  fi

  info "Updating Readability.js script..."
  local LIB_DIR="$ROOT/lib"
  local READABILITY_URL="https://raw.githubusercontent.com/mozilla/readability/master/Readability.js"
  local READABILITY_PATH="$LIB_DIR/Readability.js"
  mkdir -p "$LIB_DIR"
  if ! curl -fsSL --fail --show-error "$READABILITY_URL" -o "$READABILITY_PATH.tmp"; then
      warn "Failed to download Readability.js; using existing version if available."
      rm -f "$READABILITY_PATH.tmp"
  else
      mv "$READABILITY_PATH.tmp" "$READABILITY_PATH"
      info "Readability.js updated successfully."
  fi

  success "Browser tools setup is complete."
  info "You can now start Brave with: node tools/start.js"
}

function _execute() {
  local start
  start=$(date +%s)

  setup

  while [[ $# -gt 0 ]]; do
    case $1 in
      -h | --help)
        usage
        exit 0
        ;;
      -d | --debug)
        debug_mode=1
        ;;
      *)
        warn "Unknown option: $1"
        usage
        exit 1
        ;;
    esac
    shift
  done

  main

  local duration=$(( $(date +%s) - start ))
  local completion_msg="Completed"
  if (( duration > 0 )); then
    completion_msg="Completed in $((duration / 60)) min $((duration % 60)) sec"
  fi

  if (( show_duration )); then
    success "$completion_msg"
  else
    printf '%s\n' "$completion_msg"
  fi
}

_execute "$@"
