#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APPLICATIONS_DIR="$(cd "$ROOT_DIR/.." && pwd)"
REPO_DIR="${LOGOS_STORAGE_NIM_BIN_DIR:-$APPLICATIONS_DIR/logos-storage-nim-bin}"
TAG="${LOGOS_STORAGE_VERSION:-v0.3.0}"
LIBS_DIR="${LOGOS_STORAGE_LIBS_DIR:-$ROOT_DIR/.dev/logos-storage/$TAG-linux-amd64}"

usage() {
  cat <<EOF
Usage: scripts/build-logos-storage-libs.sh [options]

Builds the Logos storage native libraries required by packages/forum-storage.

storage-bindings 0.2.x pins libstorage $TAG, but that GitHub release is not
published yet. This script clones logos-storage-nim-bin and builds the libs
locally, then prints the env var needed for forum-storage builds.

Options:
  --force   rebuild even if $LIBS_DIR already exists
  -h, --help
EOF
}

FORCE=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --force) FORCE=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

if [ "$(id -u)" -eq 0 ]; then
  echo "Do not run this script with sudo." >&2
  echo "It builds in your home directory and needs your user PATH (python3, nim, cmake)." >&2
  exit 1
fi

need git
need python3
need gcc
need g++
need ar
need cmake
need nim

if [ "$FORCE" -eq 0 ] && [ -f "$LIBS_DIR/libstorage.h" ] && compgen -G "$LIBS_DIR"/*.a >/dev/null; then
  echo "[✓] Logos storage libs already built: $LIBS_DIR"
  echo "export STORAGE_BINDINGS_LOCAL_LIBS=$LIBS_DIR"
  exit 0
fi

if [ ! -d "$REPO_DIR/.git" ]; then
  echo "[·] Cloning logos-storage-nim-bin into $REPO_DIR"
  git clone --depth 1 https://github.com/nipsysdev/logos-storage-nim-bin "$REPO_DIR"
else
  echo "[✓] Using logos-storage-nim-bin at $REPO_DIR"
fi

echo "[·] Building libstorage tag $TAG; this can take several minutes"
(
  cd "$REPO_DIR"
  TAG="$TAG" python3 build.py
)

BUILT_DIR="$REPO_DIR/dist/$TAG-linux-amd64"
if [ ! -f "$BUILT_DIR/libstorage.h" ]; then
  echo "Expected build output not found: $BUILT_DIR" >&2
  exit 1
fi

mkdir -p "$(dirname "$LIBS_DIR")"
rm -rf "$LIBS_DIR"
cp -a "$BUILT_DIR" "$LIBS_DIR"

echo "[✓] Built Logos storage libs: $LIBS_DIR"
cat <<EOF

Use these env vars when building or running forum-storage:

  export STORAGE_BINDINGS_LOCAL_LIBS=$LIBS_DIR
  cd packages/forum-storage && cargo build

The encrypted-forum dev bootstrap picks this up automatically when present.
EOF
