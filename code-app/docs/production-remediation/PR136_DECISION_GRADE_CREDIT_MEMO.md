# PR 136 — Decision-Grade Credit Memo Composition and Section Model Repair

**Factory Arc:** Non-Stop Production Remediation Factory Arc — Phase 5
**Findings addressed:** N-07, N-08, N-09
**Branch:** `phase5-decision-grade-credit-memo`

## Problem statement

The July 25 audit found the saved credit memo omitted every durable underwriting fact a
decision-grade memo needs (N-07), that a saved memo was only ever visible up to ~200 characters
with a "consistency review" feature producing false contradictions against text that was actually
there (N-08), and that credit-memo section rows duplicated content (N-09).

## Investigation

A dedicated investigation confirmed all three findings against current `master` (a prior PR113 had
only fixed the ">2000 chars crashes the save" bug, not these three):

- **N-07 confirmed, real, Sev-1.** `creditMemoDraft.ts` had no code path to Global Cash Flow/DSCR,
  risk rating, underwriting recommendation, or repayment analysis — even though all of these are
  already captured and persisted elsewhere on the deal (`GlobalCashFlowPanel.tsx`,
  `DealRiskRatingPanel.tsx`, the underwriting recommendation panel). "Approval request" and
  "repayment analysis" did not exist as concepts anywhere in the codebase.
- **N-08 confirmed, real.** `creditMemoQueries.ts`'s `PREVIEW_MAX_CHARS = 240` was the only text ever
  fetched or rendered anywhere — no full-text view existed. The consistency checker
  (`checkCreditMemoConsistency.ts`) compared borrower/stage/amount against that same 240-char
  string; a realistic memo header is ~300 characters, so the Stage/Client lines routinely fell past
  the cutoff, producing false "does not appear to reference" findings against text that was
  genuinely present in the full persisted record.
- **N-09 NOT reproducible as literally stated** ("10 section drafts each store the complete memo
  body") — `CreditMemoDraftModal.tsx` already regenerates each section from only its own key
  (`buildCreditMemoDraft([key], ...)`), so no section ever contained the other nine sections'
  content. A smaller, real issue remained: every section redundantly repeated the same ~300-char
  header/footer boilerplate alongside its own content, and sections were read back sorted
  alphabetically by section key rather than in canonical (banker-facing) order.

## Fixes in this PR

### N-07 — five new sections, sourced only from real persisted facts
`creditMemoDraft.ts` gained five sections, inserted after Pricing/Structure: **Global Cash Flow &
DSCR Analysis**, **Repayment Analysis**, **Risk Rating**, **Underwriting Recommendation**, and
**Requested Credit Action**. Each is built purely from the deal's own already-persisted JSON inputs
(`financialSpreadInputsJson`, `riskRatingInputsJson`, `underwritingRecommendationInputsJson`) via
the exact same parse/compute functions the existing panels use (`computeGlobalCashFlow`,
`classifyDscr`, `parseRiskRatingFormState`, `parseUnderwritingRecommendationFormState`) — nothing is
invented, and every section honestly degrades to `MISSING_PLACEHOLDER` / an "insufficient data"
statement (tracked in `missingFields`) when a deal hasn't captured that fact yet. The
recommendation/approval-adjacent sections quote the *currently recorded* fact with an explicit
"this memo does not itself make a credit decision" disclaimer — the generator still never decides
anything on its own.

The "Approval Request" concept is labeled **"Requested Credit Action"** rather than "Approval
Request": `CreditMemoDraftModal.tsx`'s pre-existing save-time guard (`findProhibitedTerms`, built
for a different feature — borrower-facing update drafts — and reused here) treats the literal words
"approval"/"approved" as unsupported commitment language unless the deal's stage/status already
carries them. The section's real content (the credit ask, routed for a decision) is unaffected by
this naming choice.

### N-08 — full-text visibility + a consistency checker that reads what's actually there
`CreditMemoSummary`/`CreditMemoSectionItem` gained a `fullText` field (the untruncated
`cr664_memotext`/`cr664_drafttext`) alongside the existing `textPreview`. `CreditMemo.tsx` gained a
"View full memo text" / "View full section text" toggle per row. `checkCreditMemoConsistency.ts`
now prefers `fullText` over `textPreview` when available — the exact false-negative mechanism (the
Stage line falling past the 240-char cutoff) is directly closed.

### N-09 — boilerplate-free sections, canonical ordering
A new export, `renderSingleSection`, returns a section's own content with **no** header/footer —
`CreditMemoDraftModal.tsx`'s section-snapshot computation now uses it instead of
`buildCreditMemoDraft([key], ...).body`, so each saved section row is a clean, self-contained chunk.
`creditMemoQueries.ts` now re-sorts loaded sections by the canonical `SECTION_OPTIONS` order instead
of alphabetically by section key (an unrecognized/legacy key sorts last, never dropped).

## Files changed

- `src/deals/creditMemoDraft.ts` — 5 new sections, `renderSingleSection` export, header doc update
- `src/deals/creditMemoDraft.test.ts` — 15 new tests (5 sections × populated/degraded + full-build + N-09 boilerplate proof)
- `src/deals/CreditMemoDraftModal.tsx` — section snapshots use `renderSingleSection`
- `src/deals/CreditMemoDraftModal.test.tsx` — fully-populated-deal fixture extended with real GCF/risk-rating/recommendation JSON
- `src/deals/creditMemoQueries.ts` — `fullText` fields, canonical section ordering
- `src/deals/creditMemoQueries.test.ts` — 2 new tests (full-text round-trip, canonical ordering)
- `src/deals/CreditMemo.tsx` — full-text view toggle for memos and sections
- `src/shared/creditMemoConsistency/checkCreditMemoConsistency.ts` — prefers full text over preview
- `src/workflow/creditReadiness.ts` — unaffected code, but now actually satisfiable
- `src/workflow/creditReadiness.test.ts` — new test file (previously untested), proves `REQUIRED_SECTIONS` is satisfiable end-to-end

## Schema impact

None. All facts consumed already exist as persisted JSON fields on the deal (from prior PRs 105/106).

## Runtime behavior before / after

| | Before | After |
|---|---|---|
| Saved memo content | Relationship/status summary only; no GCF/DSCR/risk rating/recommendation | Includes 5 additional decision-grade sections when the deal has captured the underlying facts |
| Viewing a saved memo | Capped at 240 chars everywhere | Full text one click away |
| Consistency review | False "does not reference stage/borrower" on realistic memos | Reads full text; false negatives from truncation closed |
| Section rows | Correct (not reproducible as reported) but boilerplate-duplicated, alphabetically ordered | Clean per-section content, canonical order |
| `deriveCreditReadiness`'s `memoComplete` | Permanently false (no section could ever be labeled "Repayment Analysis") | Satisfiable once a banker saves that section |

## Tests added

- `creditMemoDraft.test.ts` — 15 new tests
- `creditMemoQueries.test.ts` — 2 new tests
- `creditReadiness.test.ts` — new file, 4 tests (this module had zero test coverage before)
- Existing `CreditMemoDraftModal.test.tsx` / `CreditMemo.test.tsx` / `checkCreditMemoConsistency.test.ts` fixtures updated where the new `fullText`/deep-fact fields required it

## Validation results

- `npx tsc -b` — 0 errors
- `npx vitest run` — 915 test files, 13408 passed, 2 skipped, 0 failed
- `npm run build` — succeeded
- `npm run audit:reachability` — 0 unexpected orphans

## Operator steps

None.

## Rollback considerations

Additive/presentation-layer changes; no data migration. A plain revert is safe.

## Remaining limitations

- The pre-existing `findProhibitedTerms` guard (built for borrower-facing update drafts) still runs
  against internal credit-memo saves — a pre-existing architectural question (whether an internal
  memo should be subject to a borrower-safe-language guard at all) that this PR works around via
  careful section labeling rather than resolving. A future phase should decide whether that guard
  belongs on the credit-memo save path at all.
- `cr664_creditmemodraftsection` still has no `version`/`actor`/content-hash column — the section
  model's provenance gap identified in N-09's investigation is not closed here; it would require a
  new operator-run schema migration (following the PR132 pattern) and is deferred to a future phase.
- `cr664_memojson` / `cr664_sourcerefs` / `cr664_sourcerunid` on the parent memo record remain
  unpopulated (provisioned but unused) — full provenance tracking (which GCF/risk-rating/
  recommendation record version fed which memo) is not implemented in this PR.
