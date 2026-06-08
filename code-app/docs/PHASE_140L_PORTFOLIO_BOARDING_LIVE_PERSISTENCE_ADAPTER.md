# Phase 140L — Portfolio Boarding Live Persistence Adapter

> **What this is.** The first real app-runtime write adapter for portfolio
> boarding — **disabled by default**, gated behind an explicit feature flag,
> reaching Dataverse only through an **injected transport seam**, and scoped to
> **only** the boarded-loan schema. No UI route, no command-center change, no
> delete path, no fake data. This is deliberately a small, isolated phase that
> precedes the Phase 140M-P operator UI.

## Purpose

Phases 140I/J/K inspected, seeded, and verified the live Portfolio Boarded
Loan Dataverse schema. Phase 140L adds the governed adapter that the future
operator UI will use to create / read / update / search boarded loans — but
keeps it off by default so nothing writes until the flag is explicitly enabled
and a transport is injected.

## What this phase adds

- `portfolioLoanBoardingFeatureFlags.ts` — `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED`
  (default **false**), resolved from an injected config only (no env secret in
  client code), fail-closed (`=== true` to enable).
- `portfolioLoanBoardingLivePersistence.ts` — the live adapter:
  - an async **transport seam** (`PortfolioBoardingTransport`) with
    `create` / `update` / `retrieve` / `retrieveMultiple` and **no delete**;
  - `createDisabled…` (fails closed on every call) and `create…` (live)
    factories;
  - create / read / update / search against **only** `cr664_portfolioboardedloan*`
    entities (`ALLOWED_BOARDING_ENTITIES`), binding child rows to the created
    root via `cr664_PortfolioBoardedLoan@odata.bind`;
  - reuse of the Phase 140B-H mapper (preserves nulls + the source marker).
- `resolvePortfolioLoanBoardingAdapter.ts` — the single resolver that returns
  the live adapter **only** when the flag is enabled AND a transport is
  injected; otherwise the disabled adapter.

## What it intentionally does not add

- **No UI route** and no React component.
- **No command-center change** (no boarded loans are loaded or displayed).
- **No delete / destructive path** — the transport seam exposes no delete.
- **No direct `fetch` / Dataverse SDK** in the adapter — all IO is via the
  injected transport, which the real SDK implements and which is never wired by
  default.
- **No fake borrower / loan / dollar data.**
- **No permission widening.**

## Safety model

- **Disabled by default.** With no config, the flag off, or no transport, the
  resolver returns the disabled adapter, and every operation fails closed with
  `adapter_not_configured`.
- **Schema-scoped.** Every entity the adapter touches is validated against
  `ALLOWED_BOARDING_ENTITIES` (only `cr664_portfolioboardedloan*`); any other
  entity name fails closed.
- **Non-destructive.** There is no delete operation anywhere in the seam or the
  adapter. 140L's `updateBoardedLoan` is root-only and never erases child
  records.
- **Honest failures.** Transport failures surface as `ok: false` with a
  structured `errorCode`; nothing pretends success.

## Runtime limitations (documented)

- `updateBoardedLoan` updates the root record only; child create/update is a
  later phase.
- Document / evidence / exception / review / audit write operations are **not**
  part of 140L — they arrive with the Phase 140M-P operator workflow.
- The real Dataverse transport is **not** wired in this phase; the adapter is
  inert until a future phase injects one behind the enabled flag.

## Next phase

**Phase 140M-P** — the operator-only boarding UI, document/evidence
persistence, command-center wiring, and FDIC/board package, built on top of
this adapter behind the same feature flag.
