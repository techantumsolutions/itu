#!/usr/bin/env bash
# Audit production DB schema vs expected migrations/objects.
# Usage on server: bash scripts/db-audit-schema-drift.sh

set -euo pipefail
cd "$(dirname "$0")/.."

DB=$(docker ps --format '{{.Names}}' | grep -E 'supabase_db|supabase.*db' | head -1 || true)
if [ -z "$DB" ]; then
  DB=$(docker ps --format '{{.Names}}' | grep -i postgres | head -1 || true)
fi
if [ -z "$DB" ]; then
  echo "ERROR: No postgres docker container found"
  docker ps --format '{{.Names}}'
  exit 1
fi

echo "=== ITU schema drift audit ==="
echo "DB container: $DB"
echo "Repo: $(pwd)"
echo

MIGRATION_COUNT=$(ls -1 supabase/migrations/*.sql 2>/dev/null | wc -l | tr -d ' ')
APPLIED_COUNT=$(docker exec "$DB" psql -U postgres -d postgres -tAc "SELECT count(*) FROM supabase_migrations.schema_migrations;" 2>/dev/null | tr -d ' ')
echo "--- Migrations ---"
echo "SQL files on disk: $MIGRATION_COUNT"
echo "Recorded in schema_migrations: $APPLIED_COUNT"
echo

echo "Migrations on disk NOT in schema_migrations:"
for f in supabase/migrations/*.sql; do
  v=$(basename "$f" .sql | cut -d_ -f1)
  exists=$(docker exec "$DB" psql -U postgres -d postgres -tAc "SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '$v' LIMIT 1;" 2>/dev/null | tr -d ' ')
  if [ "$exists" != "1" ]; then
    echo "  MISSING RECORD: $(basename "$f")"
  fi
done
echo

CHECK_TABLES=(
  domain_operator_registry
  operator_merge_history
  plan_merge_history
  ads_campaigns
  ads_creatives
  ads_analytics
  support_tickets
  ticket_messages
  ticket_notes
  reward_accounts
  reward_rules
  reward_ledger
  lcr_v2_recharge_attempts
  app_settings
  admin_activity_logs
  catalog_enrichment
  operator_trust_registry
  catalog_review_queue
  operator_domain_registry
  operator_domain_audit_logs
)

echo "--- Missing tables (expected from migrations) ---"
MISSING_TABLES=0
for t in "${CHECK_TABLES[@]}"; do
  ok=$(docker exec "$DB" psql -U postgres -d postgres -tAc "SELECT to_regclass('public.$t') IS NOT NULL;" 2>/dev/null | tr -d ' ')
  if [ "$ok" != "t" ]; then
    echo "  MISSING TABLE: $t"
    MISSING_TABLES=$((MISSING_TABLES + 1))
  fi
done
if [ "$MISSING_TABLES" -eq 0 ]; then
  echo "  (none from checklist)"
fi
echo "Total missing tables checked: $MISSING_TABLES"
echo

CHECK_VIEWS=(
  admin_dashboard_summary
  admin_daily_sales
  admin_top_products
)

echo "--- Missing views ---"
MISSING_VIEWS=0
for v in "${CHECK_VIEWS[@]}"; do
  ok=$(docker exec "$DB" psql -U postgres -d postgres -tAc "SELECT to_regclass('public.$v') IS NOT NULL;" 2>/dev/null | tr -d ' ')
  if [ "$ok" != "t" ]; then
    echo "  MISSING VIEW: $v"
    MISSING_VIEWS=$((MISSING_VIEWS + 1))
  fi
done
if [ "$MISSING_VIEWS" -eq 0 ]; then
  echo "  (none from checklist)"
fi
echo "Total missing views checked: $MISSING_VIEWS"
echo

# table:col pairs from recent migrations / live API errors
CHECK_COLS=(
  system_plans:country_code
  provider_plans_raw:country_code
  provider_plans_raw:destination_amount
  provider_plans_raw:destination_currency
  agg_plans:country_code
  plan_mappings:country_code
  system_plans:service_domain
  agg_operators:service_domain
  agg_plans:service_domain
  payment_orders:checkout_session_id
  payment_orders:lcr_attempt_id
  payment_orders:selected_provider_id
  profiles:bio
  support_tickets:attachment_url
)

echo "--- Missing columns ---"
MISSING_COLS=0
for pair in "${CHECK_COLS[@]}"; do
  t="${pair%%:*}"
  c="${pair##*:}"
  ok=$(docker exec "$DB" psql -U postgres -d postgres -tAc \
    "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='$t' AND column_name='$c');" 2>/dev/null | tr -d ' ')
  if [ "$ok" != "t" ]; then
    echo "  MISSING COLUMN: $t.$c"
    MISSING_COLS=$((MISSING_COLS + 1))
  fi
done
echo "Total missing columns checked: $MISSING_COLS"
echo

echo "--- Public table count ---"
docker exec "$DB" psql -U postgres -d postgres -c "SELECT count(*) AS public_tables FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';"
echo
echo "=== Audit complete ==="
