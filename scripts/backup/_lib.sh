#!/usr/bin/env bash
# Shared helpers for ITU backup / restore scripts.
# shellcheck disable=SC2034
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# Load .env if present (does not override existing env).
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$ROOT/.env" | sed 's/\r$//')
  set +a
fi

BACKUP_ROOT="${BACKUP_ROOT:-$ROOT/.backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-itu-prod}"
STAMP="${BACKUP_STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
RUN_DIR="${BACKUP_RUN_DIR:-$BACKUP_ROOT/$STAMP}"

mkdir -p "$RUN_DIR"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
die() { log "ERROR: $*"; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

# Encrypt file in place → ${path}.enc (removes plaintext when BACKUP_ENCRYPTION_KEY set).
encrypt_file() {
  local path="$1"
  [[ -f "$path" ]] || die "encrypt_file: missing $path"
  if [[ -z "$BACKUP_ENCRYPTION_KEY" ]]; then
    log "WARN: BACKUP_ENCRYPTION_KEY unset — leaving plaintext: $path"
    return 0
  fi
  require_cmd openssl
  openssl enc -aes-256-cbc -pbkdf2 -salt \
    -pass "env:BACKUP_ENCRYPTION_KEY" \
    -in "$path" -out "${path}.enc"
  rm -f "$path"
  log "Encrypted → ${path}.enc"
}

decrypt_to_stdout() {
  local path="$1"
  if [[ "$path" == *.enc ]]; then
    [[ -n "$BACKUP_ENCRYPTION_KEY" ]] || die "BACKUP_ENCRYPTION_KEY required to decrypt $path"
    require_cmd openssl
    openssl enc -d -aes-256-cbc -pbkdf2 \
      -pass "env:BACKUP_ENCRYPTION_KEY" \
      -in "$path"
  else
    cat "$path"
  fi
}

sha256_file() {
  local path="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$path" | awk '{print $1}'
  else
    openssl dgst -sha256 "$path" | awk '{print $NF}'
  fi
}

write_manifest_line() {
  local kind="$1" file="$2"
  local sum size
  sum="$(sha256_file "$file")"
  size="$(wc -c <"$file" | tr -d ' ')"
  mkdir -p "$RUN_DIR"
  printf '%s\t%s\t%s\t%s\n' "$kind" "$(basename "$file")" "$sum" "$size" >>"$RUN_DIR/MANIFEST.tsv"
}

compose() {
  docker compose -f "$COMPOSE_FILE" --project-name "$COMPOSE_PROJECT" "$@"
}

prune_old_backups() {
  local days="${1:-$BACKUP_RETENTION_DAYS}"
  [[ -d "$BACKUP_ROOT" ]] || return 0
  log "Pruning backups older than ${days} days under $BACKUP_ROOT"
  find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime "+${days}" -print -exec rm -rf {} +
}
