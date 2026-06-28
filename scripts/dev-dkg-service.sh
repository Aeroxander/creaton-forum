#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DKG_DIR="$ROOT_DIR/packages/dkg-service"
DEV_DIR="$ROOT_DIR/.dev/dkg-service"
PORT="${DKG_PORT:-3021}"
ADMIN_TOKEN="${CREATON_KMS_ADMIN_TOKEN:-dev-kms-admin}"
STATE_KEY="${CREATON_KMS_STATE_KEY:-000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f}"
SETUP="$DKG_DIR/golden-8.setup"
DATA_DIR="$DEV_DIR/data"
BINARY="$DKG_DIR/target/debug/dkg-service"

mkdir -p "$DEV_DIR" "$DATA_DIR"
cd "$DKG_DIR"

if [[ ! -f "$SETUP" ]]; then
  echo "[dkg] Generating Golden setup (first run only)…"
  cargo build --release
  ./target/release/dkg-service --generate-golden-setup "$SETUP" --max-players 8
fi

if [[ ! -x "$BINARY" ]]; then
  echo "[dkg] Building dkg-service…"
  cargo build
fi

echo "[dkg] Listening on http://127.0.0.1:${PORT}"
exec "$BINARY" \
  --golden-setup "$SETUP" \
  --port "$PORT" \
  --data-dir "$DATA_DIR" \
  --state-key "$STATE_KEY" \
  --admin-token "$ADMIN_TOKEN" \
  --max-players 8
