#!/bin/bash
set -euo pipefail

REPO="Nika0000/publisher-cli"
INSTALL_DIR="${PUBLISHER_INSTALL_DIR:-/usr/local/bin}"
BINARY_NAME="publisher"

get_platform() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Linux*)  os="linux" ;;
    Darwin*) os="macos" ;;
    *)       echo "Unsupported OS: $os" >&2; exit 1 ;;
  esac

  case "$arch" in
    x86_64|amd64) arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
    *)             echo "Unsupported architecture: $arch" >&2; exit 1 ;;
  esac

  echo "${os}-${arch}"
}

get_latest_release() {
  curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep '"tag_name"' \
    | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/'
}

main() {
  local platform tag download_url tmp_file

  platform="$(get_platform)"
  echo "Detected platform: ${platform}"

  if [ -n "${1:-}" ]; then
    tag="cli-v${1}"
  else
    echo "Fetching latest release..."
    tag="$(get_latest_release)"
  fi

  echo "Installing publisher ${tag#cli-v}..."

  download_url="https://github.com/${REPO}/releases/download/${tag}/publisher-${platform}"

  tmp_file="$(mktemp)"
  trap 'rm -f "$tmp_file"' EXIT

  echo "Downloading from ${download_url}..."
  curl -fsSL -o "$tmp_file" "$download_url"

  chmod +x "$tmp_file"

  if [ -w "$INSTALL_DIR" ]; then
    mv "$tmp_file" "${INSTALL_DIR}/${BINARY_NAME}"
  else
    echo "Installing to ${INSTALL_DIR} (requires sudo)..."
    sudo mv "$tmp_file" "${INSTALL_DIR}/${BINARY_NAME}"
  fi

  echo "Publisher CLI installed to ${INSTALL_DIR}/${BINARY_NAME}"
  echo "Run 'publisher --help' to get started."
}

main "$@"
