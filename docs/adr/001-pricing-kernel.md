# ADR 001: Pricing kernel

## Status
Accepted

## Context
Provider wholesale / face-value extraction was imported from admin presentation modules into catalog and LCR paths, inverting dependency direction.

## Decision
Own pricing extraction in `lib/pricing` as a neutral domain kernel. Admin may re-export for compatibility but must not own the implementation.

## Consequences
Catalog, LCR, and checkout pricing depend on `@/lib/pricing`, not `@/lib/admin`.
