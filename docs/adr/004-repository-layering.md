# ADR 004: Repository layering

## Status
Accepted

## Context
Aggregator and routing “repositories” were facade re-exports of multi-thousand-line `impl.ts` modules.

## Decision
Split data access into cohesive modules under `lib/*/data/`:
- `shared`, `types`, `providers`/`queries`, `writes`, `sync`, `mapping`
- `repository.ts` remains a thin public barrel
- `impl.ts` is a deprecated compatibility re-export only

## Consequences
Persistence concerns are reviewable units. No new god `impl` files; new code lands in the matching module.
