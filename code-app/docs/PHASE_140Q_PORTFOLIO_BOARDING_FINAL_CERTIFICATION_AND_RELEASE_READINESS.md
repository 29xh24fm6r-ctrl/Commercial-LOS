# Phase 140Q — Portfolio Boarding Final Certification & Release Readiness

> **What this is.** The release gate for Portfolio Loan Boarding. It adds the
> final runtime schema gate, an entity-constrained live Dataverse transport
> (behind an injected client seam), a fail-closed runtime resolver, and an
> end-to-end smoke — and certifies the write path as scoped, auditable,
> non-destructive, and permission-bound. **Runtime writes remain disabled by
> default**; nothing turns on without every flag, the schema gate, an authorized
> operator, and an injected client.

## 1. Purpose

Final certification and release-readiness for Portfolio Loan Boarding: prove the
write path is scoped, explicit, auditable, reversible by process, and
permission-bound before a real closed loan is ever boarded.

## 2. Current shipped stack (140A → 140M-P)

- **140A** — FDIC remediation operating model.
- **140B-H** — portfolio loan boarding system of record (types, catalogs,
  completeness/snapshot derivers, FDIC/board/portfolio review derivers,
  read-only views).
- **140I** — Dataverse schema inspection (read-only).
- **140J** — guarded schema seed mode (dry-run-first).
- **140K** — schema verification + optional evidence→document repair.
- **140L** — governed live persistence adapter, disabled by default.
- **140M-P** — operator UI, document/evidence surfaces, command-center seams,
  FDIC/board package surfaces.

## 3. Live schema state

13 Portfolio Boarded Loan tables, 188 columns, 12 required child→root lookups,
6 optional relationships, `safeForRuntimePersistenceCandidate = true`. The
runtime schema gate's expectations are **plan-derived** (now including all 6
optional relationships) so they match the live environment exactly.

## 4. Runtime gating

The runtime schema gate (`portfolioBoardingRuntimeSchemaGate`) is fail-closed:

- `schemaReady` requires verified required tables/columns/required-relationships
  to meet the plan with **zero conflicts**; missing **optional** relationships
  are a warning only.
- `canCreate` / `canUpdate` require `schemaReady` **AND**
  `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED` **AND**
  `PORTFOLIO_BOARDING_ROUTE_ENABLED` **AND** a live adapter **AND** an authorized
  operator.
- `canRead` / `canSearch` may be allowed read-only (authorized + adapter) and
  never imply write authority.

## 5. Transport wiring decision

This phase wires the live transport as an **entity-constrained boundary over an
injected Dataverse write client** (`portfolioLoanBoardingLiveDataverseTransport`).
It imports **no** generated Dataverse service and performs **no** `fetch`
itself — the real client is injected at enable time. Because the boarded-loan
tables do not yet have generated client services in this repo, **140Q certifies
readiness but does NOT enable runtime writes**: the runtime resolver
(`resolvePortfolioLoanBoardingRuntimeAdapter`) returns the disabled adapter
unless a client is injected and every gate passes. Wiring a concrete client is
a deliberate operator step behind the flags.

The transport can only ever touch `cr664_portfolioboardedloan*` entities; it
rejects `cr664_loandeal`, client, team, banker, and systemuser; it derives the
entity-set name itself (no arbitrary entity-set input from the UI); and it
exposes no delete.

## 6. Operator workflow

Enable flags → open the boarding route (registered behind the route flag +
existing WorkspaceGate) → create a loan (empty package, no auto-fill) → save
draft (adapter create) → add document metadata + evidence → review readiness →
generate the FDIC/board/portfolio package → approve boarding (blocked without an
actor) → view command-center inclusion when the command-center flag is on and
authorized rows are supplied.

## 7. Safety posture

- **No fake data**, no sample dollar values, no mock records.
- **No deletes**, no destructive writes.
- **No cross-table writes** — only the boarded-loan schema.
- **No permission widening** — the route is not registered in `App.tsx`;
  unauthorized users fail closed; read-only never grants write.
- **No command-center writes**, no fake command-center rows.
- **Audit trail** with actor accountability; **sensitive fields (tax id)
  redacted**; approval blocked without an actor.
- **Fail-closed readiness** — missing means missing, stale means stale.

## 8. Known limitations

- **Live transport status:** certified-ready but **not enabled** (no concrete
  client wired); the resolver stays disabled by default.
- **Binary upload:** not implemented; document **metadata** only; no fake file
  links.
- **OCR:** not implemented.
- **PDF export:** not implemented; export is a deterministic **JSON view-model**
  only.
- **Command-center loader:** flag-gated seam only; no command center mounts
  boarded loans by default.
- **Unsupported adapter operations** (document/exception/review/audit beyond
  create/read/update/search) return structured `not_supported`.

## 9. Release checklist

1. Verify schema: `node scripts/phase122-lookup-repair.mjs --inspect-portfolio-boarding-schema`
   (expect `safeForRuntimePersistenceCandidate: true`).
2. Dry-run seed: `node scripts/phase122-lookup-repair.mjs --seed-portfolio-boarding-schema`
   (expect 0 tables/columns/relationships to create, 0 skipped, no blockers).
3. `npm test` and `npm run build` green.
4. Set `PORTFOLIO_BOARDING_ROUTE_ENABLED` + `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED`.
5. Confirm the operator is authorized via the existing workspace/identity chain.
6. Inject a concrete Dataverse client and board ONE real loan as a smoke.
7. Review the created records; keep a rollback note.

## 10. Rollback plan

Turn off `PORTFOLIO_BOARDING_ROUTE_ENABLED` and
`PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED` → the app returns to a
read-only/disabled posture. No destructive cleanup is required (no deletes were
ever issued); manually review any records created during the smoke and retire
them through normal Dataverse administration if needed.

## 11. Next recommended work after 140Q

- Real document binary upload (if desired) behind a safe, adapter-backed path.
- OCR / classification pipeline (if desired).
- PDF / export package generation (if desired).
- Production operator SOP.
- First legacy portfolio batch boarding.
