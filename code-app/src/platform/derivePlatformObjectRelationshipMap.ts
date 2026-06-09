/**
 * Phase 142B — Platform object relationship map deriver.
 *
 * PURE, READ-ONLY. Projects object-level architecture relationships (from the
 * registry + a declared architecture-edge map) scoped to the viewer. Edges are
 * METADATA only — no record IDs, no borrower/customer names, no PII, no data
 * fetch. A target the viewer cannot see is redacted, never exposed.
 */

import { PLATFORM_OBJECT_REGISTRY, getPlatformObject } from './platformObjectRegistry';
import { isObjectVisibleToViewer } from './derivePlatformObjectCatalog';
import type { PlatformObjectDefinition } from './platformObjectModelTypes';
import type {
  PlatformObjectRelationshipEdge,
  PlatformViewerContext,
} from './platformSurfaceTypes';

interface ArchEdge { from: string; to: string; type: string; label: string; required: boolean }

/** Declared architecture edges (metadata only) beyond the registry relationships. */
const ARCHITECTURE_EDGES: readonly ArchEdge[] = [
  { from: 'annual_review', to: 'financial_spread_snapshot', type: 'reference', label: 'spreads financials for', required: false },
  { from: 'annual_review', to: 'covenant_test_result', type: 'reference', label: 'tests covenants for', required: false },
  { from: 'annual_review', to: 'borrower_request', type: 'reference', label: 'requests documents via', required: false },
  { from: 'annual_review', to: 'memo_package', type: 'reference', label: 'produces memo', required: false },
  { from: 'annual_review', to: 'evidence', type: 'reference', label: 'is evidenced by', required: false },
  { from: 'memo_package', to: 'board_package', type: 'reference', label: 'feeds', required: false },
  { from: 'memo_package', to: 'fdic_package', type: 'reference', label: 'feeds', required: false },
  { from: 'board_package', to: 'fdic_package', type: 'reference', label: 'aligns with', required: false },
  { from: 'document', to: 'evidence', type: 'reference', label: 'yields', required: false },
  { from: 'deal', to: 'crm_organization', type: 'lookup', label: 'relates to borrower', required: false },
  { from: 'portfolio_boarded_loan', to: 'covenant_test_result', type: 'reference', label: 'monitored via', required: false },
];

function registryEdges(objects: readonly PlatformObjectDefinition[]): ArchEdge[] {
  const edges: ArchEdge[] = [];
  for (const o of objects) {
    for (const r of o.relationships) {
      edges.push({ from: o.objectKey, to: r.toObjectKey, type: r.kind, label: `${o.displayName} ${r.kind}`, required: false });
    }
  }
  return edges;
}

export interface DerivePlatformObjectRelationshipMapInput {
  context: PlatformViewerContext;
  objects?: readonly PlatformObjectDefinition[];
}

export function derivePlatformObjectRelationshipMap(
  input: DerivePlatformObjectRelationshipMapInput,
): readonly PlatformObjectRelationshipEdge[] {
  const objects = input.objects ?? PLATFORM_OBJECT_REGISTRY;
  const all: ArchEdge[] = [...registryEdges(objects), ...ARCHITECTURE_EDGES];

  const visible = (key: string): boolean => {
    const obj = getPlatformObject(key);
    return obj ? isObjectVisibleToViewer(obj, input.context) : false;
  };

  const edges: PlatformObjectRelationshipEdge[] = [];
  for (const e of all) {
    // Only emit an edge when the SOURCE object is visible to the viewer.
    if (!visible(e.from)) continue;
    const targetVisible = visible(e.to);
    edges.push({
      fromObjectKey: e.from,
      toObjectKey: targetVisible ? e.to : 'redacted',
      relationshipType: e.type,
      label: e.label,
      direction: 'outbound',
      source: 'object_registry',
      required: e.required,
      visible: targetVisible,
      caveats: targetVisible ? [] : ['Target object is not visible in this context (redacted).'],
    });
  }
  return edges;
}
