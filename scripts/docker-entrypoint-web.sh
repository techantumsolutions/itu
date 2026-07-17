#!/bin/sh
# Ensure Phase 1 volume mount points are writable by USER nextjs (uid 1001).
set -eu
mkdir -p /app/public/uploads /app/storage/reconciliation /app/data
chown -R nextjs:nodejs /app/public/uploads /app/storage/reconciliation /app/data
exec su-exec nextjs:nodejs "$@"
