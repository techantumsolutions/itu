# ADR 002: Checkout kernel

## Status
Accepted

## Context
`lib/payments` and `lib/topup` previously cross-imported shared checkout concerns (currency, attach-user, server pricing), creating a cycle.

## Decision
Place shared checkout primitives in `lib/checkout`. Payments and topup both depend inward on checkout; they must not depend on each other.

## Consequences
Acyclic money graph: routes → payments|topup|wallet → checkout → infrastructure.
