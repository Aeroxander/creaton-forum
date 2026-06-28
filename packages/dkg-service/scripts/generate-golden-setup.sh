#!/usr/bin/env bash
set -euo pipefail

# Generate the reusable non-secret Commonware Golden setup artifact.
# Usage: ./scripts/generate-golden-setup.sh [output-path]
# Defaults to ./golden-64.setup in the crate root.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRATE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUTPUT="${1:-${CRATE_DIR}/golden-8.setup}"

if [[ -f "${OUTPUT}" ]]; then
  echo "Setup already exists: ${OUTPUT}"
  exit 0
fi

cd "${CRATE_DIR}"
cargo build --release
./target/release/dkg-service --generate-golden-setup "${OUTPUT}"
echo "Wrote Golden setup: ${OUTPUT}"
