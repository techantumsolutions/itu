# ADR 003: Wallet bounded context

## Status
Accepted

## Context
Wallet balance, claim, debit, refund, and wallet-only checkout were scattered across payments, admin, and fat API routes.

## Decision
Introduce `lib/wallet` as the wallet bounded context:
- `application/` — settle Razorpay hybrid, wallet-only checkout, resolve, refund
- `ledger/` — authoritative debit
- `repository/` — fulfillment claim
- `balance/` — read models

Payments and admin keep thin compatibility shims. HTTP routes are adapters only.

## Consequences
All wallet business rules enter through `@/lib/wallet`. Money routes do not orchestrate ledger logic inline.
