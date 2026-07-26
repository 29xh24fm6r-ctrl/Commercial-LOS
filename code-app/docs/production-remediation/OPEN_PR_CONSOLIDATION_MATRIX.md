# Post-Audit Remediation Consolidation Matrix (through PR 141)

## Important note on scope vs. reality

This document was commissioned as an inventory of **open** remediation PRs to be consolidated
into a single integration PR. By the time this work started, **all ten remediation PRs (#132
through #141) had already been individually merged into `master`**, each rebased onto the
then-current `master` and re-validated in full before merging. `state=open` against this
repository returns zero remediation PRs.

This document therefore serves the same purpose the requested consolidation matrix would have —
a single, authoritative table of every remediation PR's scope, files, schema impact, and tests —
but records what **is already in `master`**, not what would be cherry-picked into a new branch.
No code integration work happens in this PR; it is documentation only. See
`REMEDIATION_PHASE_STATUS.md` for the finding-by-finding status (which is independent of whether
work happened via one PR or ten).

## Inventory

| PR | Branch | Base commit | Findings addressed | Files changed | Schema / operator impact | Unique tests added | Merge commit |
|----|--------|-------------|---------------------|---------------|--------------------------|---------------------|--------------|
| [#132](https://github.com/29xh24fm6r-ctrl/Commercial-LOS/pull/132) | `claude/ogb-lending-e2e-cert-9oi9us` | `95aa146` | N-01, N-10 (investigated, confirmed already correct — no code change), N-16, N-21 | 21 | +1 lookup relationship on `cr664_documentchecklist` (`cr664_receivedby` → `cr664_user`), extends the pre-existing 8-column PR105-era migration package. **Not applied to the live org.** | 115 (8 focused files, new + updated) | (pre-session; part of the baseline this arc built on) |
| [#133](https://github.com/29xh24fm6r-ctrl/Commercial-LOS/pull/133) | `phase2-canonical-active-deal-population` | `95aa146` | N-02 (partial — disclosure only; full reconciliation deferred to N-17), N-03, N-18, N-19, N-20, N-33 | 23 | None | ~30 across 6 files | (pre-session) |
| [#134](https://github.com/29xh24fm6r-ctrl/Commercial-LOS/pull/134) | `phase3-document-taxonomy-unification` | `95aa146` | N-11 (documented, explicitly **not** resolved — pure dedup of a copy-pasted normalization helper, zero behavior change) | 8 | None | 1 new test file | (pre-session) |
| [#135](https://github.com/29xh24fm6r-ctrl/Commercial-LOS/pull/135) | `phase5-decision-grade-credit-memo` | `bfa8d65` | N-07, N-08, N-09 | 10 | None (all facts already persisted from PR105/106) | 21 | `218a424` |
| [#136](https://github.com/29xh24fm6r-ctrl/Commercial-LOS/pull/136) | `phase6-risk-rating-workflow-enforcement` | `bfa8d65` | N-14, N-15 | 11 | None — new required fields (`dealId`, `assignedBy`/`assignedAtIso`, `underwriterActor`/`recordedAtIso`) live inside the pre-existing `cr664_riskratinginputs`/`cr664_underwritingrecommendationinputs` Memo/JSON columns | ~15 | `893f7fb` |
| [#137](https://github.com/29xh24fm6r-ctrl/Commercial-LOS/pull/137) | `phase7-crm-industry-naics-projection` | `bfa8d65`, rebased onto `893f7fb` during consolidation | N-22, N-23 | 24 | +1 additive Memo/JSON column, `cr664_crmindustryprojection`, on `cr664_loandeal`. **Not applied to the live org.** | ~35 | `6d43c9a` |
| [#138](https://github.com/29xh24fm6r-ctrl/Commercial-LOS/pull/138) | `phase8-purpose-term-ownership-lifecycle` | `bfa8d65`, rebased onto `6d43c9a` | N-25 | 15 | None (fields already existed since Phase 3 of the prior Factory Arc) | 10 | `c4ee217` |
| [#139](https://github.com/29xh24fm6r-ctrl/Commercial-LOS/pull/139) | `phase9-date-only-integrity` | `bfa8d65`, rebased onto `c4ee217` | N-24, D-04 | 15 | None (display/derivation logic only) | 13 | `5af66a5` |
| [#140](https://github.com/29xh24fm6r-ctrl/Commercial-LOS/pull/140) | `phase10-new-deal-ux-creation-feedback` | `bfa8d65`, rebased onto `5af66a5` | N-26, N-34, N-35 (investigated, confirmed already correct — no code change), N-36 | 4 | None | 2 | `ea729b9` |
| [#141](https://github.com/29xh24fm6r-ctrl/Commercial-LOS/pull/141) | `phase11-test-deal-classification-field` | `893f7fb`, rebased onto `ea729b9` | N-17 | 9 | +1 additive Boolean column, `cr664_istestrecord`, on `cr664_loandeal`. **Not applied to the live org.** | 8 | `2160fc7` |

Merge commits `218a424` through `2160fc7` are all present in `master`'s history in that order;
`git log --merges origin/master` reproduces the exact sequence.

## Overlap / conflict map

Only three files were ever touched by more than one of PR135–141 (PR132–134 predate this arc's
branch structure and were independently merged before any of PR135–141 branched):

| File | PRs touching it | Nature of overlap | Resolution |
|------|------------------|--------------------|------------|
| `src/deals/creditMemoDraft.ts` | #135 (5 new sections), #137 (NAICS classification line) | Adjacent import blocks; non-overlapping insertion points inside the file | Combined both import blocks during PR137's merge into `master`; both features coexist (verified: both the 5 new section labels and the `NAICS classification:` line are present in the merged file) |
| `src/deals/creditMemoDraft.test.ts` | #135, #137, #138 | #135/#137: adjacent import blocks + two separate new `describe` blocks inserted at the same point. #138: the shared `fullyPopulatedDeal` fixture gained fields from both #135 (GCF/risk-rating/recommendation JSON) and #138 (loanPurpose/loanTermMonths/ownershipStructure) | Combined both describe blocks (kept both, closed each properly) during PR137's merge; combined both field sets on the fixture during PR138's merge |
| `src/deals/CreditMemoDraftModal.test.tsx` | #135, #138 | Same shared-fixture pattern as above | Auto-merged cleanly by git (no manual resolution needed); verified via full test run afterward |

Every other file each PR touched was unique to that PR — no other conflicts occurred.

One additional, pre-existing defect was found and fixed during PR137's merge (not attributable to
any single PR, but to the PR135+PR136 combination): two test fixtures
(`creditMemoDraft.test.ts`, `CreditMemoDraftModal.test.tsx`) did not supply the three new required
fields PR136 added to `RiskRatingFormState`/`UnderwritingRecommendationFormState`, which broke
`tsc -b` on `master` between the PR136 merge and the PR137 merge. Confirmed via an isolated
`git worktree` check against `origin/master` directly (not an artifact of the merge tooling).
Fixed by adding the three fields to both fixtures with plausible values.

## Governance / test-pinned contracts touched

- `outcomeUnionDiscipline.test.ts` — PR132 added a documented, scoped exception for
  `MarkDocumentReviewedOutcome` intentionally surfacing `correlationId`.
- `NEW_DEAL_CREATE_ALLOWED_FIELDS` (create-payload allow-list) — never modified by any PR in this
  set; PR138 correctly routed new optional fields through the existing governed post-create
  follow-up write instead.

## What this PR does NOT do

- It does not cherry-pick or re-apply any code — all code is already in `master`.
- It does not close or comment on PR132–141 — they are already closed (merged), not open.
- It does not rewrite `master`'s git history into a single squashed commit. That would require a
  destructive force-push over shared history and was explicitly not authorized.
