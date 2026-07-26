# Remaining Factory Arc Work After PR 141

## The phase roadmap is exhausted — there is no Phase 12+ defined anywhere

A dedicated repo-wide search (this session) found no master roadmap file and no single audit
document enumerating findings beyond what each phase's own PR doc names after the fact. "Phase 4"
in this arc's numbering was **never executed** — no PR, branch, or commit exists for it; the
sequence jumps from Phase 3 (PR134) to Phase 5 (PR135/136). The one and only concretely-flagged
forward pointer to unaddressed scope found anywhere in the repo was N-17 (flagged in PR133's own
"Remaining limitations"), which is now closed by PR141.

**Continuing this arc past PR141 requires recovering the original finding list from outside this
repository** (a prior session's transcript, an external tracker, or a fresh audit) — inventing new
"phases" from code inspection alone would mean redefining findings rather than re-deriving their
root causes, which this arc's own standing rules forbid.

## Operator actions required before 4 findings are actually fixed live

See `REMEDIATION_PHASE_STATUS.md`'s checklist. In summary: three additive schema-migration
packages are merged into `master` but not yet applied to any live Dataverse environment:
- PR132's extended 9-field package (blocks N-01, N-16)
- `pr138-crm-industry-projection` (blocks N-22, N-23)
- `pr142-test-record-field` (blocks N-17)

None of the code in `master` claiming to fix these four findings is actually effective in
production until an operator runs the corresponding `create-columns.mjs` (or Maker Portal
equivalent), publishes customizations, and runs `verify-columns.mjs`.

## Documented partial fixes — real, specific gaps left open by design

Pulled verbatim (paraphrased for brevity) from each PR's own "Remaining limitations" section —
these are not oversights, they are scope boundaries each PR explicitly drew and documented:

- **N-11 (document taxonomy)**: only normalization-helper duplication was removed; the two live
  taxonomies (exact-map lookup vs. substring match) still disagree on which documents satisfy
  underwriting requirements. See `N11_DOCUMENT_TAXONOMY_MAP.md` for what a real unification needs
  (a shared stable document-type key, or reconciling the two matching algorithms — both require a
  product-level decision on which vocabulary is authoritative).
- **N-17 (governed test-record field)**: only the banker pipeline surface reads the new column.
  Manager, Team, Executive dashboard, and Admin test-data surfaces still classify purely by name.
  No admin UI exists yet to actually *set* the field on a deal (this PR wired the read path only).
- **N-21 (business-safe error mapping)**: scoped to the document-requirement write family only —
  explicitly "not a global sweep." Other write paths may still surface raw transport errors.
- **N-23 (NAICS/industry)**: the coarse six-value Industry choice list is unchanged; only 5 of 20
  NAICS sectors are seeded in the admin-managed mapping table. Both are separate maker/admin policy
  decisions this arc deliberately did not make.
- **N-33 (CRM duplicate detection)**: read-only, recomputed client-side from already-loaded data;
  not wired into the existing Dataverse-backed Data Quality Flags admin panel (would need a
  governed write path).
- **N-25 (purpose/term/ownership)**: ownership structure has no path into Boarding or Portfolio
  (the boarded-loan schema has no equivalent field, unlike term/purpose, which do map). Portfolio
  has no per-loan structural-fact display surface at all today, for any field — a larger, separate
  UI addition, not specific to this finding.
- **N-24 / date-only integrity**: `src/shared/workQueue/primitives.ts`'s `isPastDue`/`daysFromNow`
  use a related but distinct UTC-day floor-division bug shape (not the identical raw-instant
  render-drift this arc fixed everywhere else). Deferred to its own dedicated review given how
  widely that primitive is reused (`workQueue.ts`, and per that phase's own hedge, likely
  `teamWorkQueueRules.ts`/`managerDrillThrough.ts`, not independently confirmed).
- **N-2 / D-01 (test-vs-production visibility)**: the underlying design split (KPI tiles exclude
  test deals by default, findable lists include them) is preserved by design, not removed — this
  was a previously-reviewed decision, not a defect. A fuller reconciliation is N-17's completed
  scope, itself only partially wired (see above).

## Unaccounted-for finding codes

`N-04, N-05, N-06, N-12, N-13, N-27` through `N-32`, `D-02`, `D-03` — referenced nowhere in this
repository's history. See `PRODUCTION_AUDIT_FINDINGS_N01_N36_2026-07-25.md` for the full
provenance note. These cannot be worked on honestly without first recovering what they claimed.

## Recommended next steps, in priority order

1. **Operator action** (no further code needed): apply the three pending schema migrations to
   unblock N-01, N-16, N-17, N-22, N-23 in production.
2. **Recover the original audit finding list** for the unaccounted-for codes, if further
   remediation is wanted, from outside this repository.
3. Address the documented partial-fix gaps above as their own narrowly-scoped follow-up work,
   in the order the business considers highest-impact — none of them block each other.
