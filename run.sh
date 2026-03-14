#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

have() { command -v "$1" >/dev/null 2>&1; }

if [ ! -f "package.json" ]; then
  echo "Error: package.json not found in: $PWD"
  echo "Place run.sh in the repo root (same folder as package.json) and re-run."
  exit 1
fi

print_install_help_and_exit() {
  echo ""
  echo "Node.js + npm are required to run Neuradventure."
  echo ""
  echo "Install options:"
  echo "  - macOS (Homebrew): brew install node"
  echo "  - Ubuntu/Debian:    sudo apt-get update && sudo apt-get install -y nodejs npm"
  echo "  - Fedora:           sudo dnf install -y nodejs npm"
  echo "  - Arch:             sudo pacman -S nodejs npm"
  echo ""
  echo "Then re-run: ./run.sh"
  exit 1
}

ensure_node_and_npm() {
  if have node && have npm; then
    return 0
  fi

echo "Missing node/npm; attempting install (if possible)..."

  if have brew; then
    brew install node
  elif have apt-get; then
    if have sudo; then
      sudo apt-get update
      sudo apt-get install -y nodejs npm
    else
      print_install_help_and_exit
    fi
  elif have dnf; then
    if have sudo; then
      sudo dnf install -y nodejs npm
    else
      print_install_help_and_exit
    fi
  elif have pacman; then
    if have sudo; then
      sudo pacman -S --noconfirm nodejs npm
    else
      print_install_help_and_exit
    fi
  else
    print_install_help_and_exit
  fi

  if ! (have node && have npm); then
    print_install_help_and_exit
  fi
}

ensure_node_and_npm

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)"
if [ "${NODE_MAJOR}" -lt 18 ]; then
  echo "Warning: Node.js >= 18 is recommended. Detected: $(node -v)"
fi

export npm_config_package_lock=false
export npm_config_fund=false
export npm_config_audit=false

echo "Installing dependencies (no lockfile)..."
npm install --no-package-lock

echo "Building + starting production server on http://localhost:${PORT:-3001} ..."
echo "(Set PORT/HOST env vars to customize.)"
npm run preview
