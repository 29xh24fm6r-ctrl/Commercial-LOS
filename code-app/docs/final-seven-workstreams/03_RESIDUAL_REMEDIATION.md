# Workstream 3 — Residual Remediation (3A–3F)

**Status: COMPLETE (3A/3C/3D fixed; 3B/3E confirmed already correct; 3F already handled by a prior
session, plus one new staleness this pass introduced and then corrected).**

## 3A — NAICS-to-industry coverage

`src/crm/naics/naicsSectorMap.ts` already derives all 20 NAICS sectors correctly (sector-code
derivation was never the gap). The actual coverage gap is in the LIVE `cr664_naicsindustrymap`
DATA: `scripts/seed-naics-industry-map.mjs` seeds only 5 of 20 sectors (Manufacturing, Retail,
Healthcare, Real Estate, Information→Technology), deliberately leaving the other 15 unmapped
because the deal-industry choice set only has 6 coarse buckets (Manufacturing/Retail/Healthcare/
RealEstate/Technology/Other) — most sectors genuinely have no defensible 1:1 mapping onto that set.

**Proposed business-approval matrix** (not seeded; requires business signoff before
`seed-naics-industry-map.mjs` is extended and re-run with `-Apply`):

| Sector | Title | Recommendation | Rationale |
|---|---|---|---|
| 11 | Agriculture, Forestry, Fishing and Hunting | Leave unmapped | No defensible bucket; forcing "Other" adds no signal over honest no-mapping |
| 21 | Mining, Quarrying, Oil and Gas | Leave unmapped | Same |
| 22 | Utilities | Leave unmapped | Same |
| 23 | Construction | Leave unmapped | Construction ≠ Manufacturing; no clean bucket |
| 31-33 | Manufacturing | **Already mapped** → Manufacturing | — |
| 42 | Wholesale Trade | **Recommend mapping** → Retail | Wholesale trade of goods is retail-adjacent; the single sector in this list with a genuinely defensible mapping |
| 44-45 | Retail Trade | **Already mapped** → Retail | — |
| 48-49 | Transportation and Warehousing | Leave unmapped | No clean bucket |
| 51 | Information | **Already mapped** → Technology | — |
| 52 | Finance and Insurance | Leave unmapped | Not one of the 6 buckets; "Technology" would over-claim for non-fintech finance |
| 53 | Real Estate and Rental and Leasing | **Already mapped** → RealEstate | — |
| 54 | Professional, Scientific, and Technical Services | Leave unmapped | Ambiguous — many professional-services firms aren't technology companies |
| 55 | Management of Companies and Enterprises | Leave unmapped | No clean bucket |
| 56 | Admin/Support/Waste Management | Leave unmapped | No clean bucket |
| 61 | Educational Services | Leave unmapped | No clean bucket |
| 62 | Health Care and Social Assistance | **Already mapped** → Healthcare | — |
| 71 | Arts, Entertainment, and Recreation | Leave unmapped | No clean bucket |
| 72 | Accommodation and Food Services | Leave unmapped | Includes 722511 (Full-Service Restaurants), the D1 example code — no clean bucket |
| 81 | Other Services | Leave unmapped | No clean bucket |
| 92 | Public Administration | Leave unmapped | No clean bucket |

Only **sector 42 → Retail** is recommended as an immediately-defensible addition; the rest are
recommended to stay `no-mapping` rather than force a guess onto a coarse 6-bucket taxonomy — this is
a business/product decision, not a code defect. Regression tests added for the two D1 example codes
(722511 sector 72, 561422 sector 56) confirming they honestly resolve `no-mapping` today
(`src/crm/naics/naicsIndustryMap.test.ts`).

## 3B — Activity labeling / IA

Confirmed already correct by research, not fixed (no code change needed): `BankerActivityFeed.tsx`
already carries an explicit disclaimer ("Derived from modifiedon timestamps... Not the per-deal
Activity Timeline"), `PersonalPipeline.tsx`/`bankerPersonalActivity.ts` already label their
`lastActivityOn`/`modifiedon`-derived fields honestly ("Last touched", "stale", never claiming it's
an interaction log). A deeper IA redesign of `ActivityTimeline.tsx` (filters/type badges
differentiating banker interactions vs. system events more visibly) remains a deliberate, documented
deferral — the same UX-not-safety-defect classification the original D15 finding gave it.

## 3C — Modal accessibility

Added `src/shared/ui/useDialogDismissal.ts` — a tested (9 tests) shared foundation for Escape-to-
close + click-outside-to-dismiss + focus trap + focus return. Migrated two modals to it
(`LogActivityModal.tsx`, `DealProfileEditModal.tsx`), both with `closeOnOutsideClick: false`
(real unsaved-input risk — a note/outcome/follow-up draft or profile-field edits). This is a
**deliberate incremental migration**, not a sweep across all 18 hand-rolled `role="dialog"` modals
in the app — the spec explicitly warned against an untested sweep. The remaining 16 modals
(`AddDealTaskModal.tsx`, `ReviewDocumentModal.tsx`, `RequestDocumentModal.tsx`, `ReceiveDocumentModal.tsx`,
`CreditMemoDraftModal.tsx`, `CompleteTaskModal.tsx`, `CreateDocumentReviewTaskModal.tsx`,
`AddRequiredDocumentModal.tsx`, `BorrowerSafeStatusPacketModal.tsx`, `ResolveFlagModal.tsx`,
`ResolveAlertModal.tsx`, `LinkDealCrmEntityModal.tsx`, `RelationshipNoteDraftModal.tsx`, plus 3 more)
already have their own Escape handling from earlier phases; they do not yet have click-outside
protection or a focus trap. Migrating each is a mechanical, low-risk follow-up now that the shared
hook exists and is proven — tracked here, not silently dropped.

## 3D — Test-record/reference-value convention

Found and closed a real gap: this initiative's own mandated `SYSTEM TEST -` naming convention was
**not recognized** by `src/shared/deals/testDealClassification.ts`, the one canonical test-deal
classifier every operational banker/manager/team/executive count and queue routes through. A
controlled test record named per this initiative's own rule would NOT have been excluded from
operational views. Fixed: added an anchored-prefix pattern (`^\s*system\s*test\s*-`, plus a
bracketed `[SYSTEM TEST]` variant) — never a bare substring match, so a real borrower name
mentioning "system test" mid-sentence is never misclassified (regression-tested). The separate,
broader reference-value seed-script convention (D11's original finding) remains un-unified — low
practical risk today (closed admin-curated label sets), explicitly deferred, not silently dropped.

## 3E — Portfolio mapping honesty

Confirmed already correct (Workstream K, prior session): no fabricated risk-rating/portfolio-
manager/tie-out-result source exists; `portfolioBoardedLoanRecordCompleteness.ts` and related
modules already report honest gaps rather than invented values. No code change needed this pass.

## 3F — Documentation correction

`docs/LOS_WORKFLOW_TRUTH_MATRIX.md`'s T7-T9 correction was already added in a prior session (the
"Update 2026-07-22" block). This pass instead found and fixed a NEW staleness it introduced itself:
the D1-D20 disposition table's D3 row said "reverse direction remains a gap," which Workstream 2 of
this same pass closed — corrected with an appended "Update 2026-07-23" note, per this repo's
established append-don't-rewrite documentation convention.

## Classification

**COMPLETE** (3A/3C/3D real fixes; 3B/3E verified no-op; 3F documentation correction applied).
