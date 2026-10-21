#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if ! command -v python3 >/dev/null 2>&1; then
  printf '%s\n' 'Python 3 não encontrado. Instale com: sudo apt-get install -y python3 ca-certificates' >&2
  exit 1
fi
exec python3 "$SCRIPT_DIR/scripts/instalar.py" "$@"
