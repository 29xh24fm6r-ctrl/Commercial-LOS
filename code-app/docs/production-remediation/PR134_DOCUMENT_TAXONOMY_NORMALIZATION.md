# PR 134 — Document Name Normalization Consolidation (N-11 investigation + safe fix)

**Factory Arc:** Non-Stop Production Remediation Factory Arc — Phase 3
**Findings addressed:** N-10 (already verified resolved in PR 132 — no change here), N-11
**Branch:** `phase3-document-taxonomy-unification`

## Problem statement

N-11 reports three incompatible document taxonomies. A dedicated investigation (this session)
confirmed the situation is worse than reported: there are actually **four** independently-authored
document-name vocabularies, with zero shared stable document-type key anywhere, and the same
document-name matching rule (`normalizeName`/`normalize`: trim/lowercase/collapse separators) was
independently copy-pasted **four times** across the codebase.

## Root cause

See `docs/production-remediation/N11_DOCUMENT_TAXONOMY_MAP.md` for the full investigation: the four
taxonomies (`documentRequirementDerivation.ts`, `loanWorkflowStages.ts`,
`closingDocumentTemplateRegistry.ts`, and the retired `documentChecklistPilotConfig.ts`) were
authored in different Factory Arc phases with no cross-check against each other's vocabulary. Two
of them (`documentRequirementDerivation.ts` / `loanWorkflowStages.ts`) both attempt to identify
"required underwriting documents" and are matched against the SAME live `cr664_documentchecklist`
rows, but by two different algorithms (`documentRequirementReconciliation.ts`'s exact-normalized map
key vs. `loanWorkflowRequirementEngine.ts`/`loanWorkflowRules.ts`'s substring `.includes()`) — so the
exact same pair of real-world document names ("Business Tax Returns" vs. "Tax returns") is treated
as the same document by one algorithm and a different document by the other, on `master` today.

## Fix in this PR

A single shared function, `normalizeDocumentName` (`src/shared/deals/documentNameNormalization.ts`),
replaces the four byte-identical copy-pasted implementations
(`documentRequirementReconciliation.ts::normalizeName`,
`loanWorkflowRequirementEngine.ts::normalizeName`, `documentRequirementBlockerMerge.ts::normalize`,
`loanWorkflowRules.ts::normalize`). This is a **pure deduplication** — every call site keeps its own
existing algorithm (exact map key vs. substring match) exactly as before; nothing about matching
*behavior* changes. It removes the risk of the four copies silently drifting apart from each other
going forward.

Full unification of the two live vocabularies (a stable document-type key/enum, or aligning the two
matching algorithms) is deliberately NOT attempted here — see the taxonomy map doc's "Why not unify
now" section for the concrete regression risk that would require live-data validation this session
cannot perform.

## Files changed

- New: `src/shared/deals/documentNameNormalization.ts` (+ test)
- New: `docs/production-remediation/N11_DOCUMENT_TAXONOMY_MAP.md`
- Modified: `src/deals/documentRequirementReconciliation.ts`, `src/workflow/loanWorkflowRequirementEngine.ts`,
  `src/deals/documentRequirementBlockerMerge.ts`, `src/workflow/loanWorkflowRules.ts` (import the shared
  function instead of redefining it; no other change)

## Schema impact

None.

## Runtime behavior before / after

Identical. This PR changes zero runtime behavior — confirmed by every existing test for all four
affected modules passing unchanged.

## Tests added

- `documentNameNormalization.test.ts` (new) — pins the shared function's behavior, including the
  exact N-11 mismatch ("Business Tax Returns" vs. "Tax returns" normalize to different strings)

## Validation results

- `npx tsc -b` — 0 errors
- Focused suite (5 files, 47 tests) — 0 failed, identical to pre-change baseline
- Full suite / build / reachability audit — see commit for exact counts

## Operator steps

None.

## Rollback considerations

Pure refactor; a plain code revert has no behavior or data implications.

## Remaining limitations

- N-11 is **documented, not resolved**. The two live, actively-matched taxonomies
  (`documentRequirementDerivation.ts` and `loanWorkflowStages.ts`) remain genuinely different
  vocabularies. `docs/production-remediation/N11_DOCUMENT_TAXONOMY_MAP.md` is the map a future,
  deliberately-scoped phase needs to execute a real unification (introducing a stable document-type
  key, or reconciling the two matching algorithms) without guessing at the mismatches from scratch.
- The retired Taxonomy 0 (`DOCUMENT_CHECKLIST_PILOT_APPROVED_NAMES`) is left in place — it is not
  actively wired into any live matching path today, only into a disabled-preview readiness string,
  so removing it is a separate, lower-priority cleanup rather than a defect fix.
- Taxonomy 3 (closing-document templates) is confirmed to be a legitimately separate document
  universe (internal closing artifacts, not borrower underwriting documents) and is not a candidate
  for unification with Taxonomies 1/2.
