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
