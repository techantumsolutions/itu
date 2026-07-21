# ADR 005: Financial least-privilege grants and RLS

## Status
Accepted

## Context
Production readiness audit found `GRANT ALL ... TO anon` (and `authenticated`) on
financial/operational tables without client RLS policies. The application accesses
PostgREST exclusively with the Supabase **service_role** key.

## Decision
1. **REVOKE ALL** on financial tables from `PUBLIC`, `anon`, and `authenticated`.
2. **GRANT** `SELECT, INSERT, UPDATE, DELETE` only to `service_role` (plus `postgres`).
3. **ENABLE ROW LEVEL SECURITY** on those tables with **no client policies**
   (deny-by-default for JWT roles; service_role bypasses RLS).
4. **REVOKE** blanket sequence grants from `anon` / `authenticated`.
5. Set **ALTER DEFAULT PRIVILEGES** so future tables/sequences are not granted to anon.

Migration: `supabase/migrations/20260721120000_least_privilege_financial_grants_rls.sql`

## Consequences
- Anon-key PostgREST calls cannot read/write ledgers even if someone obtains the publishable key.
- Backend APIs need no code changes.
- Any future direct browser→PostgREST access to money tables will fail until an explicit, reviewed policy is added (prefer keeping all money access server-side).
