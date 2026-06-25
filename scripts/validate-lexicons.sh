#!/usr/bin/env bash
# Validates the Creaton forum lexicons. Used by `npm run validate:lexicons`.
set -euo pipefail
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm use 22 >/dev/null 2>&1 || nvm use 20 >/dev/null 2>&1 || nvm use default >/dev/null 2>&1 || true
fi
cd "$(dirname "$0")/.."
exec node scripts/validate-lexicons.mjs "$@"
