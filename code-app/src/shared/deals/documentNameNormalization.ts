/**
 * N-11 (Production Remediation Factory Arc Phase 3) — the one shared document-name
 * normalization function.
 *
 * Before this fix, the identical implementation was independently copy-pasted four times:
 * `documentRequirementReconciliation.ts` (`normalizeName`), `loanWorkflowRequirementEngine.ts`
 * (`normalizeName`), `documentRequirementBlockerMerge.ts` (`normalize`), and
 * `loanWorkflowRules.ts` (`normalize`) — four names for the same rule, any one of which could be
 * edited without the others noticing, silently pulling two already-loosely-related document
 * taxonomies further apart.
 *
 * This module also owns the small, governed alias map needed to keep the
 * workflow-stage vocabulary and derived-requirement vocabulary from producing
 * duplicate checklist rows for the same commercial document.
 * `documentRequirementReconciliation.ts` / `documentRequirementBlockerMerge.ts` use it as an exact
 * map key (`normalizeDocumentName(a) === normalizeDocumentName(b)`); `loanWorkflowRequirementEngine.ts`
 * / `loanWorkflowRules.ts` use it for substring containment (`haystack.includes(needle)`) against a
 * different, independently-authored document-name vocabulary (`loanWorkflowStages.ts`'s
 * `requiredDocuments`, vs. `documentRequirementDerivation.ts`'s `RULES[].documentName`). Those two
 * vocabularies are NOT the same taxonomy and were never reconciled against each other — see
 * `docs/production-remediation/N11_DOCUMENT_TAXONOMY_MAP.md` for the concrete mismatches (e.g.
 * `documentRequirementDerivation.ts`'s "Business Tax Returns" vs. `loanWorkflowStages.ts`'s
 * "Tax returns" — reconciliation's exact-match treats these as different documents while the
 * workflow engine's substring-match coincidentally treats them as the same one). Consolidating the
 * normalization function only removes the drift risk of four copies of one rule; it does NOT
 * unify the two taxonomies themselves, which remains open (see the doc above).
 */
export function normalizeDocumentName(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ');
  return DOCUMENT_NAME_ALIASES[normalized] ?? normalized;
}

const DOCUMENT_NAME_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  'tax returns': 'business tax returns',
  'business tax return': 'business tax returns',
});
