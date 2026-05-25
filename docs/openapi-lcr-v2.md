# LCR v2 (Enhancement Layer) — API Reference

All endpoints below are **additive** and do not change existing routes.
Auth: uses existing admin-header checks (`x-user-role=admin` or `x-user-email=admin@itu.com`).

## Feature flag and database

- **`LCR_V2_ENABLED`**: set to `1` or `true` to route **`POST /api/recharge`** and **`GET /api/recharge?orderId=`** through the LCR v2 pipeline (idempotency, routing, provider execution). When unset or false, the legacy Ding + mock LCR behavior is unchanged.
- **SQL**: apply **`supabase/uti_lcr_schema.sql`** first (includes `set_updated_at`), then **`supabase/uti_lcr_v2_transactions.sql`** for `lcr_v2_recharge_attempts` and related indexes.

## Public recharge (when v2 is on)

### `POST /api/recharge`

Requires **`phoneNumber`**, **`sendAmount`**, and either **`internalPlanId`** or **`skuCode`**. Optional **`Idempotency-Key`** header or **`idempotencyKey`** in the body.

### `GET /api/recharge?orderId=...`

Resolves status from **`lcr_v2_recharge_attempts`** by distributor ref or id. If Supabase or tables are unavailable, the handler falls back to the legacy mock response.

## Background sync

- **`POST /api/admin/lcr/enqueue-sync`**: enqueue a BullMQ **`provider-sync`** job (requires **`REDIS_URL`**). Body: `providerId` (uuid).
- **`GET /api/cron/lcr-v2-sync`**: same **`Authorization: Bearer <CRON_SECRET>`** pattern as other cron routes; iterates active **`lcr_providers`** and runs ingestion inline.
- **Worker**: `npm run lcr:worker` runs **`scripts/lcr-sync-worker.ts`** (consumes **`provider-sync`**).

## Providers (registry)

### GET `/api/admin/lcr/providers`
Returns registered providers.

### POST `/api/admin/lcr/providers`
Create provider.

Body:
- `code` (string, required): e.g. `DTONE`
- `name` (string, required)
- `adapterKey` (string, required): `dtone|ding|reloadly|custom`
- `priority` (number, optional)
- `isActive` (boolean, optional)
- `baseUrl` (string, optional)
- `refreshIntervalMinutes` (number, optional)
- `supportedCountries` (string[], optional)
- `credentialsEncrypted` (string, optional)

### PATCH `/api/admin/lcr/providers/:id`
Update provider fields.

### DELETE `/api/admin/lcr/providers/:id`
Delete provider.

## Sync / ingestion

### POST `/api/admin/lcr/sync`
Manually sync + normalize plans for a provider.

Body:
- `providerId` (uuid, required)

Response:
- `result`: { fetchedRaw, normalized, createdInternalPlans, mappedPlans, reviewQueued, durationMs }

## Internal plans (UTI)

### GET `/api/admin/lcr/internal-plans?limit=50&offset=0&countryIso3=IND&operatorRef=dtone:1707`
List internal plans (UTI plans). Optional filters.

## Review queue

### GET `/api/admin/lcr/review-queue?status=pending&limit=50&offset=0`
List low-confidence/unmatched items for admin review workflows.

## LCR simulation

### POST `/api/admin/lcr/route-simulate`
Body:
- `internalPlanId` (uuid, required)

Returns:
- `decision.selected` + `decision.fallbacks` + evaluation.

