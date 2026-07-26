# Remediation Status by Finding (as of 2026-07-26, master @ `2160fc7` + this consolidation PR)

## Status legend

The required distinctions, used strictly — **code existing is never treated as equivalent to a
finding being fixed**:

| Status | Meaning |
|--------|---------|
| **MERGED** | The fix's code is present in `master`. If no schema/operator action is listed, the fix is effective as soon as the app is running this `master`. |
| **OPERATOR ACTION REQUIRED** | Code is merged, but an operator must run a migration script (or an equivalent Maker Portal change) against the **live Dataverse environment** before the fix takes effect. Until that happens, the underlying defect is still live in production even though the code is merged. |
| **DEPLOYED** | The merged code has been deployed to a running instance of the application (a real release/publish event). |
| **LIVE VERIFIED** | An operator or tester has confirmed, against live production data, that the fix behaves as intended. |
| **PARTIALLY FIXED** | Only part of the reported defect is addressed; a real, specific remaining gap is called out. |
| **NOT FIXED** | No code change addresses this finding. |
| **ALREADY CORRECT** *(not one of the 7 required categories — added because it doesn't fit any of them without distortion)* | The finding was investigated and the reported defect does not reproduce against current code; no fix was needed or made. Distinct from "MERGED," which implies a code change happened. |

**DEPLOYED and LIVE VERIFIED are used zero times in this table.** No evidence exists anywhere in
this repository, this session, or any prior session transcript referenced this session of an
actual deployment to a running application instance, or of any operator confirming behavior
against live production data. Claiming either without that evidence would be exactly the
fabrication this document exists to prevent.

## Finding-by-finding status

| Finding | Status | Detail |
|---------|--------|--------|
| N-01 | **MERGED — OPERATOR ACTION REQUIRED** | Code (PR132) merged. The document-requirement lifecycle column package (`cr664_requirementstatus` + siblings, extended with `cr664_receivedby` in PR132) has never been applied to the live org. **Until an operator runs it, this finding's underlying live defect is unfixed regardless of merged code.** |
| N-02 | **MERGED — PARTIALLY FIXED** | PR133 added disclosure (N-19) of the pre-existing, deliberate test/production visibility split (D-01). The count-disagreement symptom this finding reported is explained, not eliminated — a full reconciliation (single governed classification field) is N-17's scope. |
| N-03 | **MERGED** | PR133. No schema/operator dependency. |
| N-07 | **MERGED** | PR135. No schema/operator dependency (facts already persisted by prior PR105/106 work). |
| N-08 | **MERGED** | PR135. No schema/operator dependency. |
| N-09 | **MERGED** | PR135. The as-reported claim ("sections duplicate the full memo body") was investigated and found not reproducible; the real underlying issue (boilerplate repetition, non-canonical ordering) is fixed. |
| N-10 | **ALREADY CORRECT** | Investigated during PR132; the deal-advancement blocker model's per-document `reviewLevel` already guarded this correctly. No code change made or needed. |
| N-11 | **MERGED — PARTIALLY FIXED** | PR134 explicitly documents this as **not resolved** — only the copy-pasted normalization helper was deduplicated (zero behavior change). The underlying dual-taxonomy disagreement (two algorithms reconciling the same document differently) remains; see `N11_DOCUMENT_TAXONOMY_MAP.md` for what a real fix requires. |
| N-14 | **MERGED** | PR136. No schema/operator dependency (new fields live inside existing JSON columns). |
| N-15 | **MERGED** | PR136. Same as N-14. |
| N-16 | **MERGED — OPERATOR ACTION REQUIRED** | PR132. Same unapplied migration package as N-01. |
| N-17 | **MERGED — OPERATOR ACTION REQUIRED — PARTIALLY FIXED** | PR141. New `cr664_istestrecord` column not yet applied to the live org. Even once applied, only the banker pipeline surface (`loadBankerPipeline`) is wired to read it — Manager, Team, Executive, and Admin surfaces still classify purely by name (documented as a deliberate, narrow-PR-scope deferral, not a defect in the fix itself). |
| N-18 | **MERGED** | PR133. No schema/operator dependency. |
| N-19 | **MERGED** | PR133. No schema/operator dependency. |
| N-20 | **MERGED** | PR133. No schema/operator dependency. |
| N-21 | **MERGED — PARTIALLY FIXED** | PR132. Error mapping is scoped to the document-requirement write family only — explicitly documented as "not a global sweep," so other write paths may still surface raw transport errors. |
| N-22 | **MERGED — OPERATOR ACTION REQUIRED** | PR137. New `cr664_crmindustryprojection` column not yet applied to the live org — until then, the durable-record half of this fix cannot actually persist anything (the code path degrades honestly, but the finding's core "never durably reached the deal" complaint is not yet resolved live). |
| N-23 | **MERGED — OPERATOR ACTION REQUIRED — PARTIALLY FIXED** | PR137. Same unapplied column as N-22. The six-value coarse Industry choice list remains unchanged and only 5/20 NAICS sectors are seeded in the mapping table — both explicitly left as separate maker/admin policy decisions, not defects this fix claims to close. |
| N-24 | **MERGED** | PR139. No schema/operator dependency (display/derivation logic only). |
| N-25 | **MERGED** | PR138. No schema/operator dependency (fields already existed). |
| N-26 | **ALREADY CORRECT** | Investigated during PR140; the wizard viewport/Active Deals-stays-Kanban behavior was already correctly implemented. No code change made or needed. |
| N-33 | **MERGED — PARTIALLY FIXED** | PR133. Duplicate-organization detection is read-only, recomputed client-side from already-loaded data; it is not wired into the existing Dataverse-backed Data Quality Flags admin panel (would need a governed write path — left to a future phase). |
| N-34 | **ALREADY CORRECT** | Investigated during PR140. No code change made or needed. |
| N-35 | **ALREADY CORRECT** | Investigated during PR140. No code change made or needed. |
| N-36 | **MERGED** | PR140. No schema/operator dependency. |
| D-01 | *(not a defect — a reviewed, deliberate design decision, preserved as-is)* | Documented, not changed, by PR133. |
| D-04 | **MERGED** | The umbrella objective ("eliminate one-day date drift") this code names is satisfied by N-24's fix (PR139). |
| N-04, N-05, N-06, N-12, N-13, N-27–N-32, D-02, D-03 | **NOT FIXED — UNACCOUNTED FOR** | No record of these codes' original claims survives anywhere in this repository. See `PRODUCTION_AUDIT_FINDINGS_N01_N36_2026-07-25.md`'s "Unaccounted-for codes" section. Cannot honestly be marked fixed, partially fixed, or even accurately "not fixed" against a known defect — there is no known defect text to check against. |

## Operator action checklist (the only thing standing between "merged" and "actually fixed in production" for 4 findings)

Three additive schema migrations are merged but **not applied to any live Dataverse
environment**, per every one of their own PR's "Operator steps" section:

1. `scripts/schema-migrations/` (PR132's extended 9-field package, includes `cr664_receivedby`) — blocks N-01, N-16.
2. `scripts/schema-migrations/pr138-crm-industry-projection/` (`cr664_crmindustryprojection`) — blocks N-22, N-23.
3. `scripts/schema-migrations/pr142-test-record-field/` (`cr664_istestrecord`) — blocks N-17.

Each package is additive-only, includes a `verify-*.mjs` and `rollback-*.mjs`, and (per each PR's
own rollback-considerations section) is safe to apply or roll back independently — none of them
depend on each other.
