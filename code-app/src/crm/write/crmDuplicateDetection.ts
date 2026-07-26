/**
 * PR 104 -- CRM organization duplicate detection, mirroring the deal-creation
 * detector (src/deals/newDealDuplicateDetection.ts, Phase 179A). Warn-only:
 * detection never blocks Add Company; it surfaces a possible/exact match so
 * the banker can choose to link the existing record instead of creating a
 * near-duplicate. Pure: no IO, no service import.
 *
 * DUPLICATE_DETECTION_ENABLED=true already covers deal-creation dedup; this
 * reuses the exact same gate rather than inventing a second CRM-scoped flag,
 * since it is the same policy applied to a second entity kind.
 */

import { DUPLICATE_DETECTION_ENABLED } from '../../deals/dealOriginationFeatureFlags';
import { normalizeBusinessName } from '../../shared/text/normalizeBusinessName';

export interface ExistingOrganizationSignal {
  readonly organizationId: string;
  readonly name?: string;
  readonly legalName?: string;
  readonly website?: string;
}

export interface CrmDuplicateDetectionInput {
  readonly candidateName: string;
  readonly candidateLegalName?: string;
  readonly candidateWebsite?: string;
  readonly existing: readonly ExistingOrganizationSignal[];
  /** Test-only detection-gate override. Production never sets it (uses the live flag). */
  readonly detectionEnabledOverride?: boolean;
}

export type CrmDuplicateOutcome =
  | { readonly kind: 'not_checked'; readonly detail: string }
  | { readonly kind: 'no_duplicate_found' }
  | { readonly kind: 'possible_duplicate_found'; readonly detail: string; readonly candidates: readonly string[] }
  | { readonly kind: 'exact_duplicate_found'; readonly detail: string; readonly candidates: readonly string[] };

function normalizedWebsite(w: string | undefined): string {
  return (w ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
}

/**
 * Detect duplicates by: normalized company name, normalized legal name, or
 * matching website domain. Never writes, never blocks -- the caller decides
 * whether to surface the warning and let the banker proceed or link instead.
 */
export function detectCrmOrganizationDuplicates(input: CrmDuplicateDetectionInput): CrmDuplicateOutcome {
  const detectionEnabled = input.detectionEnabledOverride ?? DUPLICATE_DETECTION_ENABLED;
  if (!detectionEnabled) {
    return { kind: 'not_checked', detail: 'Duplicate detection gate is off.' };
  }
  const name = normalizeBusinessName(input.candidateName);
  const legalName = normalizeBusinessName(input.candidateLegalName);
  const website = normalizedWebsite(input.candidateWebsite);

  const exact: string[] = [];
  const possible: string[] = [];
  for (const e of input.existing) {
    const eName = normalizeBusinessName(e.name);
    const eLegalName = normalizeBusinessName(e.legalName);
    if ((name.length > 0 && eName === name) || (legalName.length > 0 && eLegalName === legalName)) {
      exact.push(e.organizationId);
      continue;
    }
    if (website.length > 0 && normalizedWebsite(e.website) === website) {
      possible.push(e.organizationId);
    }
  }

  if (exact.length > 0) {
    return {
      kind: 'exact_duplicate_found',
      detail: 'A company with this name is already in the CRM.',
      candidates: exact,
    };
  }
  if (possible.length > 0) {
    return {
      kind: 'possible_duplicate_found',
      detail: 'A company with this website is already in the CRM.',
      candidates: possible,
    };
  }
  return { kind: 'no_duplicate_found' };
}

/**
 * N-33 (Production Remediation Factory Arc Phase 2) — retroactive duplicate-company detection
 * across an ALREADY-EXISTING organization list, not just at Add-Company create time. Before this,
 * `detectCrmOrganizationDuplicates` only ever checked one new candidate against the existing list;
 * nothing re-scanned organizations already in the CRM, so companies that slipped past (or predate)
 * the create-time warning — e.g. "OmniCare 365" created twice plus "Omnicare 365" with different
 * capitalization — were never flagged and silently inflated any listing/total that counted distinct
 * companies or their linked deals.
 *
 * Pure grouping, same normalization rules as the create-time check (name / legal name / website).
 * Read-only: this never deletes, merges, or otherwise mutates a record — it only reports clusters of
 * likely-duplicate organization ids for a human (banker/admin) to review and decide, matching this
 * codebase's "no deletion/merge without operator authorization" rule. Groups smaller than 2 members
 * are not duplicates and are omitted.
 */
export interface DuplicateOrganizationCluster {
  readonly matchType: 'name' | 'legalName' | 'website';
  /** The normalized key the cluster matched on (never a raw record id). */
  readonly matchKey: string;
  readonly organizationIds: readonly string[];
}

export function findDuplicateOrganizationClusters(
  organizations: readonly ExistingOrganizationSignal[],
  options: { readonly detectionEnabledOverride?: boolean } = {},
): readonly DuplicateOrganizationCluster[] {
  const detectionEnabled = options.detectionEnabledOverride ?? DUPLICATE_DETECTION_ENABLED;
  if (!detectionEnabled) return [];

  const clusters: DuplicateOrganizationCluster[] = [];
  const claimed = new Set<string>();

  function groupBy(
    matchType: DuplicateOrganizationCluster['matchType'],
    keyFor: (o: ExistingOrganizationSignal) => string,
  ): void {
    const byKey = new Map<string, string[]>();
    for (const o of organizations) {
      const key = keyFor(o);
      if (key.length === 0) continue;
      const bucket = byKey.get(key) ?? [];
      bucket.push(o.organizationId);
      byKey.set(key, bucket);
    }
    for (const [key, ids] of byKey) {
      // An organization already claimed by a stronger match (name/legal-name) is not re-reported
      // under a weaker one (website) — each record surfaces in exactly one cluster.
      const unclaimed = ids.filter((id) => !claimed.has(id));
      if (unclaimed.length < 2) continue;
      for (const id of unclaimed) claimed.add(id);
      clusters.push({ matchType, matchKey: key, organizationIds: unclaimed });
    }
  }

  groupBy('name', (o) => normalizeBusinessName(o.name));
  groupBy('legalName', (o) => normalizeBusinessName(o.legalName));
  groupBy('website', (o) => normalizedWebsite(o.website));

  return clusters;
}
