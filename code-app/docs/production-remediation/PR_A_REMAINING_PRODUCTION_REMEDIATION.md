# PR A — Remaining Production Remediation

Scope authority: `PRODUCTION_AUDIT_FINDINGS_N01_N36_2026-07-25.md`, `REMEDIATION_PHASE_STATUS.md`,
`REMAINING_FACTORY_ARC_AFTER_PR141.md`, `OPEN_PR_CONSOLIDATION_MATRIX.md`. This PR investigated
every named PR A work area against current code (not against prior PRs' own self-description),
classified each item A–F, and implemented every code-safe fix the investigation confirmed. Items
requiring a genuine product/schema-design decision beyond a mechanical fix are documented as
explicitly deferred, not attempted.

## Classification legend

- **A** — Already merged/present, requires only an operator migration.
- **B** — Real code defect, unresolved until this PR.
- **C** — External connector/plugin/security dependency.
- **D** — Requires live two-user verification (code is correct; only a live environment can prove it).
- **E** — Audit item not represented in current repo history — not invented, only reported.
- **F** — Already correct / investigated claim did not reproduce.

## What this PR fixed (category B → merged)

| Area | Finding | Fix | Commit |
|------|---------|-----|--------|
| Origination-to-boarding persistence | Risk rating computed at origination, matching target field already existed on the boarded-loan side, never wired (undocumented gap, found during this PR's scoping — not a prior N-code) | `mapDealToExistingLoanInput.ts` now reads `deriveRiskRatingRecordFromDeal(deal)?.ratingValue` | 1/9 |
| Portfolio/servicing readback wiring | Loan term/purpose already persisted at boarding time, never read back or displayed in Portfolio | `boardedLoansList.ts` reads `cr664_termmonths`; `BoardedDetailDrawer` shows Term/Purpose rows | 2/9 |
| Business-label replacement | New Deal outcome banners showed a bare Dataverse GUID with no human label | `DealOriginationResult` now carries the banker-entered `dealName` through to all three banners | 3/9 |
| Unresolved count reconciliation | Three independent "is this overdue" predicates (work-queue primitives, `teamQueries.ts`, `creditMemoFreshness.ts`) each carried the pre-Workstream-H raw-UTC-instant bug | All three now delegate to the shared `isPastCalendarDate`/`daysUntilCalendarDate` | 4/9 |
| Admin operational truth (partial) | Fresh D19-class mojibake regression on the one page meant to be an operator's source of truth | Fixed the literal string | 5/9 |
| Stage-control visual states | Diagnostic Kanban lanes indistinguishable from canonical ones; DECLINED/WITHDRAWN rendered as plain text; Decline/Withdraw shared Advance's blue tone | Diagnostic-lane disclosure badge + accent color; severity-Badge for terminal status; destructive button tone for Decline/Withdraw | 6/9 |
| Remaining safe error mapping | N-21/PR132's own header called its fix "not a global sweep" — 6 other write families still leaked raw transport errors | Shared `mapBusinessSafeError` extracted and applied to deal creation, funding (5 actions), stage transitions (2 genuinely-raw branches only — see note below), CRM writeback (2 modules), closing document generation | 7/9 (a+b) |
| Durable closing-document persistence | Generation UI was already mounted (a stale "Inert; not mounted" comment said otherwise — corrected); real gap was in-memory-only storage, no download affordance | New `createDataverseClosingDocumentStore()` (mirrors the PR112 funding-authorization precedent exactly, same disclosed caveats), Download button, stale doc corrected | 8/9 |

**A precision note on the error-mapping fix**: `StageWorkflowControl`'s `update_failed`/
`readback_failed` outcome details are a *mix* of raw transport errors and this codebase's own
authored, already-safe descriptive messages (e.g. "No active cr664_dealstagereferences row for
stage code..."). Mapping the whole outcome at the UI layer would have destroyed the useful,
specific messages in the common case. Fixed instead at the two genuinely-raw branches inside
`buildLiveCanonicalTransitionDeps.ts` only — more surgical than the other 5 write families, which
had no such mix.

## Category A — merged, blocked only on an already-tracked operator migration

No new items beyond the three already tracked in `REMEDIATION_PHASE_STATUS.md` (N-01/16, N-22/23,
N-17). The new closing-document persistence adapter adds a fourth: `cr664_closingdocumentmanifest`
(see `scripts/schema-migrations/pr123-closing-document-persistence/`) — reviewed, not applied.

## Category C — external dependency

None surfaced by this PR's investigation beyond what PR B already scopes (SharePoint, Dataverse
plugin registration, security roles).

## Category D — requires live two-user verification

The credit-approval exit gate, funding dual-control, and document-review segregation-of-duties are
all coded, tested (with simulated actors), and already merged — nothing here needed a code change.
Final proof that two genuinely different live users interacting concurrently behave as designed is
inherently a live-environment exercise. This is PR B's scope (`docs/production-remediation/` runbook,
"two-user approval/funding test requirements").

## Category E — audit items not represented in repo history

Unchanged from `PRODUCTION_AUDIT_FINDINGS_N01_N36_2026-07-25.md`'s "Unaccounted-for codes" section
(N-04/05/06/12/13, N-27–32, D-02/03). One new E item surfaced this PR: same-workspace tab
back/forward history in `BankerShell.tsx` (uses local `useState`, not a URL segment) — investigated,
no documented complaint or finding ever named this; not invented as new scope.

## Category F — already correct, investigated claim did not reproduce

- Credit-memo composer (`creditMemoDraft.ts`): every fact type this arc has touched (GCF/DSCR, risk
  rating, underwriting recommendation, NAICS, purpose/term/ownership, document status) is already
  correctly wired with honest fallbacks. 42/42 tests passing. No new code needed.
- Global activity field-set unification (D4): already correct, confirmed present and bidirectional.
- Core navigation defects (D5/D6/D16, duplicate-history bug, SPA-routing bug): all already merged
  and verified against current code, not merely claimed.
- Entitlement read models: a single canonical entitlement-decision module is already reused
  everywhere; no hardcoded/duplicate role checks found.

## Explicitly deferred — real gaps, but NOT attempted in this PR

These are documented, not silently dropped, and not built here because each needs either a genuine
product/schema decision this PR is not positioned to make, or is a large enough undertaking to
deserve its own narrowly-scoped follow-up rather than inflating this PR further:

1. **Activity cross-write extension** (category B, real gap, found this PR): funding approvals,
   closing-document generation, portfolio boarding, and risk-rating assignments each maintain their
   own isolated audit trail and never cross-write into the canonical `cr664_dealtimelineevents`
   activity feed a banker actually looks at. The fix pattern already exists elsewhere in the
   codebase (`buildLiveStageAdvanceDeps.ts`'s `timelineSink`) — this is a scoped extension, not new
   architecture, but touches 4 separate write paths and needs new event-type option-set values
   (schema-additive). Left for a dedicated follow-up.
2. **The 12-item CREDIT_APPROVAL/COMMITMENT/DOCUMENTATION/CLOSING_FUNDING/BOARDED untracked-
   requirement backlog** (`loanWorkflowRequirementRegistry.ts`'s `untracked()` entries: memo
   finalization status, approval decision/authority/conditions, commitment issuance/acceptance,
   conditions-precedent/collateral/insurance verification, executed-docs, booking QC, boarded-loan
   handoff, servicing-owner assignment, return-authorization tiers, adverse-action workflow). Each
   needs a brand-new Dataverse entity design — a product decision on record shape, not a mechanical
   fix. Explicitly out of scope for this PR; needs its own product-scoped phase.

   **Correction to an earlier investigation claim**: risk rating and underwriting recommendation
   are NOT part of this backlog — `loanWorkflowRequirementRegistry.ts` lines 233-234 confirm both
   are already `tracked: true` and gating the UNDERWRITING stage exit (N-14/N-15, PR136). An
   investigation agent's paraphrase conflated this with the genuinely-untracked `CREDIT_APPROVAL:
   memo_finalized` requirement; verified directly against the registry before any code was written.
3. **Portfolio ownership-structure display**: unlike term/purpose (fixed in this PR), ownership
   structure has no persisted path into Boarding/Portfolio at all yet — needs a new column on
   `cr664_portfolioboardedloan`, a genuinely separate, small schema decision from the read-model/UI
   gap this PR closed for term/purpose.
4. **Admin operational truth — full panel reconciliation**: ~10 separate "is this feature ready"
   panels coexist with different vocabularies; PR108's own code comment says reconciling them is "a
   real product/compliance decision this PR does not make." Only the fresh mojibake regression on
   that page was fixed here (a trivial, unrelated defect); the reconciliation itself remains
   deliberately undone.
5. **Drill-through deep-linking breadth** (Phase 144D pattern exists and works, only wired to the
   Portfolio Command Center KPI ribbon; Manager/Team/Executive cockpits not yet extended) and **dual
   Log Activity UI consolidation** (deal-scoped vs. CRM-scoped components, explicitly documented as
   a deliberate non-merge pending a larger UX redesign) — both are non-defect, already-acknowledged
   scope boundaries, not attempted here.
6. **N-11 full document-taxonomy unification** — unchanged from its existing "documented, not
   resolved" status; still needs a product decision on which vocabulary is authoritative.
