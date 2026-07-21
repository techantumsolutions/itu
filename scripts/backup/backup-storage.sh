#!/usr/bin/env bash
# Supabase Storage backup.
#
# Mode A (preferred for self-hosted): Docker volume containing Storage files.
#   Set SUPABASE_STORAGE_VOLUME to the volume name (e.g. supabase_storage-data).
#
# Mode B: REST download of configured buckets via service role.
set -euo pipefail
# shellcheck source=scripts/backup/_lib.sh
source "$(cd "$(dirname "$0")" && pwd)/_lib.sh"

require_cmd docker

if [[ -n "${SUPABASE_STORAGE_VOLUME:-}" ]]; then
  OUT="$RUN_DIR/supabase-storage-volume.tar.gz"
  log "Backing up Supabase Storage volume: $SUPABASE_STORAGE_VOLUME"
  docker volume inspect "$SUPABASE_STORAGE_VOLUME" >/dev/null 2>&1 \
    || die "Volume not found: $SUPABASE_STORAGE_VOLUME"
  docker run --rm \
    -v "${SUPABASE_STORAGE_VOLUME}:/volume:ro" \
    -v "$RUN_DIR:/backup" \
    alpine:3.20 \
    tar -czf "/backup/$(basename "$OUT")" -C /volume .
  write_manifest_line "storage-volume" "$OUT"
  encrypt_file "$OUT"
  [[ -f "${OUT}.enc" ]] && write_manifest_line "storage-volume" "${OUT}.enc"
  log "Storage volume backup complete"
  exit 0
fi

require_cmd curl
require_cmd python3
: "${SUPABASE_URL:?SUPABASE_URL is required (or set SUPABASE_STORAGE_VOLUME)}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"

BUCKETS_CSV="${STORAGE_BACKUP_BUCKETS:-user_avatars,ticket_attachments}"
BASE="${SUPABASE_URL%/}"
OUT_DIR="$RUN_DIR/storage"
mkdir -p "$OUT_DIR"

export BASE SUPABASE_SERVICE_ROLE_KEY OUT_DIR
IFS=',' read -r -a BUCKETS <<<"$BUCKETS_CSV"

for bucket in "${BUCKETS[@]}"; do
  bucket="$(echo "$bucket" | xargs)"
  [[ -n "$bucket" ]] || continue
  log "API backup of storage bucket: $bucket"
  dest="$OUT_DIR/$bucket"
  mkdir -p "$dest"
  export bucket dest
  python3 <<'PY'
import json, os, urllib.request

base = os.environ["BASE"].rstrip("/")
key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
bucket = os.environ["bucket"]
dest = os.environ["dest"]
headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}

def list_prefix(prefix: str, offset: int = 0, limit: int = 100):
    body = json.dumps({"prefix": prefix, "limit": limit, "offset": offset}).encode()
    req = urllib.request.Request(
        f"{base}/storage/v1/object/list/{bucket}",
        data=body,
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())

def walk(prefix: str = ""):
    offset = 0
    while True:
        try:
            rows = list_prefix(prefix, offset=offset)
        except Exception as e:
            print(f"list failed prefix={prefix!r}: {e}", flush=True)
            return
        if not rows:
            break
        for row in rows:
            name = row.get("name") or ""
            # Folder marker: id is null and metadata null in Storage API
            is_folder = row.get("id") is None and row.get("metadata") is None
            rel = f"{prefix}{name}" if not prefix or prefix.endswith("/") else f"{prefix}/{name}"
            if prefix and not prefix.endswith("/") and name:
                rel = f"{prefix}/{name}"
            elif prefix.endswith("/"):
                rel = f"{prefix}{name}"
            else:
                rel = name if not prefix else f"{prefix}/{name}"
            if is_folder:
                walk(rel if rel.endswith("/") else rel + "/")
                continue
            url = f"{base}/storage/v1/object/{bucket}/{rel}"
            out = os.path.join(dest, *rel.split("/"))
            os.makedirs(os.path.dirname(out), exist_ok=True)
            req = urllib.request.Request(url, headers={"apikey": key, "Authorization": f"Bearer {key}"})
            try:
                with urllib.request.urlopen(req, timeout=120) as resp, open(out, "wb") as f:
                    f.write(resp.read())
                print(f"ok {rel}", flush=True)
            except Exception as e:
                print(f"fail {rel}: {e}", flush=True)
        if len(rows) < 100:
            break
        offset += 100

walk("")
PY
done

ARCHIVE="$RUN_DIR/storage-objects.tar.gz"
tar -czf "$ARCHIVE" -C "$OUT_DIR" .
write_manifest_line "storage-api" "$ARCHIVE"
encrypt_file "$ARCHIVE"
[[ -f "${ARCHIVE}.enc" ]] && write_manifest_line "storage-api" "${ARCHIVE}.enc"
log "Supabase Storage API backup complete"
