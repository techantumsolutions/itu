#!/bin/sh
# Fail the Docker image build when required NEXT_PUBLIC_* build args are missing.
# Only variables that are statically embedded / read at next build are checked here.
set -eu

fail() {
  echo "ERROR: $1" >&2
  exit 1
}

[ -n "${NEXT_PUBLIC_APP_URL:-}" ] || fail "NEXT_PUBLIC_APP_URL is required at Docker build (static embed + CSP-related URLs)"
[ -n "${NEXT_PUBLIC_SUPABASE_URL:-}" ] || fail "NEXT_PUBLIC_SUPABASE_URL is required at Docker build (next.config CSP)"

enabled="$(printf '%s' "${NEXT_PUBLIC_RECAPTCHA_ENABLED:-false}" | tr '[:upper:]' '[:lower:]')"
case "$enabled" in
  true|1)
    [ -n "${NEXT_PUBLIC_RECAPTCHA_SITE_KEY:-}" ] || \
      fail "NEXT_PUBLIC_RECAPTCHA_SITE_KEY is required when NEXT_PUBLIC_RECAPTCHA_ENABLED=true"
    ;;
esac

echo "Docker build-env check OK (NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_SUPABASE_URL, reCAPTCHA rules)"
