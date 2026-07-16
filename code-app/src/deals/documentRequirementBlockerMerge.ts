/**
 * Additive union of the dynamically-derived document requirements
 * (documentRequirementDerivation.ts + documentRequirementReconciliation.ts)
 * into the authoritative DealBlockerModel (dealBlockerModel.ts).
 *
 * The core stage-exit requirement engine (loanWorkflowRequirementEngine.ts)
 * stays completely untouched — it is synchronous and consumed by many
 * surfaces (Stage Map, Metric Deck, Attention Console, Advance Guard) against
 * a STATIC per-stage document list. The new derivation engine's requirements
 * are loaded asynchronously (a live Dataverse read), so this module instead
 * takes the engine's already-computed model and unions in any unsatisfied
 * REQUIRED row the derivation engine additionally identifies — never removing
 * or overriding a hard blocker the core engine already reported. A document
 * already counted by the core engine (same normalized name) is not
 * double-counted.
 *
 * This is what makes "acknowledge" NOT satisfy the blocker, and "reviewed"
 * (or a `reviewLevel: 'received'` document's `receive`) clear it — the merge
 * reads the same `isRequirementSatisfied` the lifecycle module defines.
 */

import type { DealBlockerItem, DealBlockerModel } from './dealBlockerModel';
import { isRequirementSatisfied, type DocumentRequirementRow } from './documentRequirementLifecycle';
import type { RequiredDocumentDefinition } from './documentRequirementDerivation';

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ');
}

export function mergeDocumentRequirementBlockers(
  base: DealBlockerModel,
  rows: readonly DocumentRequirementRow[],
  definitions: readonly RequiredDocumentDefinition[],
): DealBlockerModel {
  const reviewLevelByName = new Map(definitions.map((d) => [normalize(d.documentName), d.reviewLevel]));
  const alreadyCounted = new Set(base.missingRequiredDocuments.map(normalize));

  const additionalItems: DealBlockerItem[] = [];
  const additionalNames: string[] = [];

  for (const row of rows) {
    if (!row.required) continue;
    const key = normalize(row.documentName);
    if (alreadyCounted.has(key)) continue;
    const reviewLevel = reviewLevelByName.get(key) ?? 'reviewed';
    if (isRequirementSatisfied(row, reviewLevel)) continue;
    alreadyCounted.add(key);
    additionalNames.push(row.documentName);
    additionalItems.push({
      id: `document-requirement:${key}`,
      severity: 'hard',
      category: 'document',
      label: row.documentName,
      detail: `Required document "${row.documentName}" is not yet ${reviewLevel === 'received' ? 'received' : 'reviewed'}.`,
      resolverSurface: 'Documents',
      remediation: { kind: 'add-document', documentName: row.documentName },
    });
  }

  if (additionalItems.length === 0) return base;

  const hardBlockers = [...base.hardBlockers, ...additionalItems];
  return {
    ...base,
    hardBlockers,
    missingRequiredDocuments: [...base.missingRequiredDocuments, ...additionalNames],
    hardBlockerCount: hardBlockers.length,
    canAdvance: false,
  };
}
