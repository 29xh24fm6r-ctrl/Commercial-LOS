# PR126 — Factory Arc Phase 14: Portfolio/Servicing Completion

## Scoping this phase

No dedicated planning doc defines "portfolio/servicing completion" as a deliverable. Audited every
portfolio/servicing surface in the app to find genuine gaps vs. already-complete work.

**Confirmed already complete (no action needed):**

- **Servicing Lifecycle** (task #70's claim) — verified TRUE, not stale. `ServicingLifecyclePanel.tsx`
  is genuinely mounted: `BankerDealWorkspace.tsx` → `DealServicingLifecyclePanel.tsx` →
  `loadServicingLifecycleSnapshotForLoan.ts` → `deriveServicingLifecycleSnapshot.ts`. Correctly dropped
  from `intentionallyUnrouted.ts` with an accurate comment documenting the transition.
- **Portfolio Command Center** — fully live, not a gap. Mounted in `ManagerWorkspace.tsx`, fed by
  `loadBoardedLoans` (a real Dataverse paginated loader), with covenants/watchlist/early-warning/
  exceptions all real children — read-only-by-design pure engines, consistent with this app's
  convention, not half-finished.
- **`ServicingLifecycleMapperPanel.tsx`** — remains genuinely, deliberately unrouted (a separate
  pre-boarding readiness projection, documented accurately in `intentionallyUnrouted.ts`), not stale.

**Genuine gaps found:**

### 1. Annual Portfolio Review — display-only demo scaffolding, zero live persistence, untracked

`src/portfolioAnnualReview/annualReviewPersistenceAdapter.ts`'s
`createDisabledAnnualReviewPersistenceAdapter()` fails closed on every operation
(`readAnnualReviewCycle`, `searchAnnualReviewPackages`, `saveAnnualReviewPackage`,
`updateRequirementStatus`, `addReviewNote`, `addEscalation`, `completeReview`) — its own header
discloses "141A ships NO live annual-review writes; a live adapter arrives in a later phase once an
annual-review schema/persistence plan is approved." No caller anywhere in the repo invokes this
adapter (grepped clean); `AnnualPortfolioReviewCommandCenter.tsx` has zero mutation handlers. The
displayed cycle is a hardcoded `PREVIEW_ANNUAL_REVIEW_CYCLE` fixture, and the whole route is gated off
by default (`PORTFOLIO_ANNUAL_REVIEW_ROUTE_ENABLED: false`).

Unlike `closing-document-persistence` or `funding-authorization-persistence`, **this domain had no
`platformInventory.ts` entry at all** — not stale, genuinely untracked. Registered it as
`annual-review-persistence` (`blockerKind: 'schema'`).

**Deliberately not attempted this phase**: designing the actual schema. The
`AnnualReviewPersistenceAdapter` contract needs at minimum a review-cycle/package record, a
per-requirement status record, and an escalation record — a materially larger, multi-table design
effort than the single-table proposals `pr107-funding-authorization` or
`pr123-closing-document-persistence` describe (Phases 10/11's precedent). Producing a rushed 4-table
schema proposal in the time remaining this phase risked exactly the kind of under-designed migration
this arc's discipline exists to prevent. Flagged as its own future phase's scope.

### 2. Portfolio boarding governance gap (historical; closed by PR D)

> PR D closure: auto-boarding now emits its portfolio boarding audit and a deal-scoped
> `DealTimelineEvent`, and is registered exactly once as
> `GOVERNED_WRITES.deal-auto-portfolio-board`. A failed timeline write is surfaced as partial
> evidence while the successful boarded-loan record is preserved. The former
> `NOT_WIRED.portfolio-boarding-audit-governance` row has been removed. The text below records the
> original Phase 14 finding and is not the current capability state.

`src/portfolioBoarding/existingLoanEntryAdapter.ts` — the one boarding write path with machine-proven
smoke evidence (`docs/operator-evidence/final-launch/portfolioBoarding.json`) — DOES emit a genuine
audit trail via `Cr664_portfolioboardedloanauditentriesService`. This is not a "no proof at all" gap
like Phase 13 found for funding pre-fix. The gap is narrower: no `DealTimelineEvent` is emitted, and
neither this write nor any other portfolio-boarding write appears in `GOVERNED_WRITES` at all — the
registry that's supposed to be the single source of truth for what emits audit/timeline evidence is
silently blind to the entire boarding domain.

Lower urgency than the funding fix: the live persistence path this write depends on is itself gated off
by default (`PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED: false`), so no real write happens in
production today. Registered as `portfolio-boarding-audit-governance` (`blockerKind: 'governance'`) so
the gap is visible rather than silent. Follow-up (once that flag is armed): extend the same
`emitLiveFundingAudit`-style live-audit-sink pattern Phase 13 used for funding to add a
`DealTimelineEvent` here, and register the write in `GOVERNED_WRITES`.

## What changed

- `src/shared/governance/platformInventory.ts` — added `annual-review-persistence` and
  `portfolio-boarding-audit-governance` to `NOT_WIRED`. `NOT_WIRED.length`: 13 → 15.
- Updated the 4 files that cite the `NOT_WIRED` count, per this arc's established convention:
  `platformInventory.test.ts` (new regression test pinning both entries' reasons/blockerKind),
  `phase129AMicrosoftVibeScopeAudit.test.ts`, `releaseCandidateSnapshot.test.ts`,
  `docs/PHASE_129A_MICROSOFT_VIBE_SCOPE_AUDIT.md` (2 citations), `docs/PHASE_111_RELEASE_CANDIDATE_SNAPSHOT.md`.

## What did NOT change

- No `src/portfolioAnnualReview/*` or `src/portfolioBoarding/*` runtime code — both domains' actual
  behavior (fail-closed disabled adapter; real-but-ungoverned audit write) is unchanged. This phase only
  made both gaps visible in the governance registry, which was silently blind to them before.
- No schema, no generated SDK file touched.

## Test plan

- `npx tsc -b` — 0 errors.
- `npx vitest run src/shared/governance/platformInventory.test.ts src/shared/governance/releaseCandidateSnapshot.test.ts src/shared/governance/phase129AMicrosoftVibeScopeAudit.test.ts src/admin/ReleaseReadinessGate.test.tsx`
  — 947 passed, 0 failed.
- Full `vitest run` / `npm run build` / `npm run audit:reachability` deferred to a later batched
  checkpoint per the current speed-up directive; no runtime `src/portfolio*`/`src/servicing/` file was
  touched, so no regression is expected there.
