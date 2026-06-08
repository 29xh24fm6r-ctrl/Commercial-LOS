# Phase 140M-P — Portfolio Boarding Operator UI, Document/Evidence Persistence, Command-Center Wiring, and FDIC/Board Package

> **What this is.** The user-facing, persistence-backed portfolio loan boarding
> workflow built on the Phase 140L adapter. It is **feature-flagged**,
> **adapter-gated**, **permission-before-render**, **fail-closed**, and
> contains **no fake data** and **no permission widening**. Every flag defaults
> off; nothing is exposed or writable until explicitly enabled.

## 1. Purpose

Manual closed-loan boarding becomes a real operator surface: an authorized
operator can view, search, create, and review boarded loans as governed
portfolio system-of-record records that support FDIC examiner review, board
loan review, portfolio-manager monitoring, servicing continuity, and a
long-term audit/evidence trail.

## 2. Prerequisites

- **Phase 140L** — the live persistence adapter (disabled by default).
- **Phase 140J/K** — the verified live Dataverse boarded-loan schema.

## 3. What this phase adds

- **Access logic** (`portfolioBoardingAccess.ts`) — fail-closed resolution of
  `unauthorized / not_configured / read_only / live`.
- **Feature flags** — `PORTFOLIO_BOARDING_ROUTE_ENABLED`,
  `PORTFOLIO_BOARDING_DOCUMENT_METADATA_ENABLED`,
  `PORTFOLIO_BOARDING_COMMAND_CENTER_ENABLED`,
  `PORTFOLIO_BOARDING_FDIC_PACKAGE_ENABLED` (all default off).
- **Persistence hooks** — `usePortfolioLoanBoardingPersistence`,
  `usePortfolioLoanDocumentPersistence` (call only the injected adapter).
- **Operator UI** — `PortfolioLoanBoardingWorkspace` + status banner, search,
  list, detail, create-flow, save-bar, validation summary.
- **Document / evidence / examiner / audit** — managers + audit panel
  (metadata persistence only; no binary upload).
- **Command-center wiring** — `loadPortfolioBoardedLoansForWorkspace` +
  flag-gated merge helpers; empty/flag-off → no rows.
- **FDIC / board / portfolio review packages** — UI over the existing pure
  derivers + a deterministic export view-model (`PortfolioBoardingPackageExportModel`).
- **Governance tests** — runtime + permission.

## 4. What it intentionally does not add

- **No fake data**, no sample borrower/loan/dollar values, no mock records.
- **No binary upload** (no safe upload path exists) — metadata only; no fake
  file links.
- **No OCR, no Copilot live actions, no deletes, no PDF generation** (export is
  a JSON view-model only), **no external API**.
- **No permission widening** — the route is NOT registered in `App.tsx` by
  default; registration is an explicit, flag-gated operator step.

## 5. Operator workflow

Open the boarding surface → create a boarded loan (empty package, no
auto-fill) → fill sections → save draft (adapter create) → add document
metadata + evidence → review readiness → generate the FDIC/board/portfolio
package → approve boarding (blocked if no actor) → (optionally) include in
command centers.

## 6. Safety model

- **Adapter-gated** — all writes go through the injected Phase 140L adapter; no
  component calls `fetch` or a Dataverse service directly.
- **Feature-flagged** — every capability defaults off; disabled flags render
  "not configured" / read-only and disable saves.
- **Permission-before-render** — `resolveBoardingAccess` is fail-closed:
  unauthorized → no surface, no create; read-only never grants create.
- **Fail-closed readiness** — missing means missing, stale means stale; FDIC /
  board / portfolio readiness comes from the existing fail-closed derivers.
- **Audit trail** — actors are never fabricated; sensitive values (tax id) are
  redacted in summaries; approval is blocked when a required actor is missing.
- **Evidence disclosure** — FDIC/board packages disclose missing, stale, and
  exception items; they are never hidden.

## 7. Runtime limitations

- The live Dataverse **transport is not wired in this phase** — the resolver
  returns the disabled adapter by default, so the surface is read-only until a
  future phase injects a transport behind the enabled flags.
- **Document/evidence/exception/review/audit adapter operations** beyond the
  Phase 140L create/read/update/search are reported `not_supported` honestly
  (the document adapter defaults to disabled).
- **Command-center inclusion** is provided as a flag-gated seam; no command
  center mounts boarded loans by default (existing behavior is unchanged when
  `boardedLoans` is omitted).
- **The route is not registered** in `App.tsx`; an operator enables it behind
  the route flag and the existing WorkspaceGate/admin access chain.

## 8. Next phase

**Phase 140Q** — final certification, end-to-end smoke, permission hardening,
transport wiring, and release readiness.
