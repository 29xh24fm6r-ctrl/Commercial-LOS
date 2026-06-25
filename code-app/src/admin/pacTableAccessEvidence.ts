import {
  hydrateVerifiedCrmSchemaState,
  hydrateVerifiedBoardingSchemaState,
  CURRENT_CRM_VERIFICATION_EVIDENCE,
  CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE,
} from './runtimeVerifiedSchemaBridge';

/**
 * Phase 248 — PAC-backed live table-access evidence (READ-ONLY).
 *
 * `pac org fetch` (FetchXML, count=1) proves LIVE TABLE REACHABILITY for the CRM spine +
 * portfolio boarding tables: a successful fetch — including the zero-row
 * "No results returned" case — means the table exists and is queryable. This is a
 * genuine, operator-proven dimension that the Web API EntityDefinitions channel could
 * not confirm (it 401s).
 *
 * It is a DISTINCT dimension from Web API column/relationship metadata. Reachability does
 * NOT measure columns/relationships, so by the unchanged runtimeVerifiedSchemaBridge
 * policy it does NOT hydrate runtime verified state. This module records reachability and
 * reports the honest combined readiness; it never claims metadata was measured and it
 * does not modify the bridge.
 */

export type PacFetchOutcome = 'reachable' | 'missing_entity' | 'auth_error' | 'parse_error' | 'failed';

/**
 * Classify a `pac org fetch` result. Fail-closed: only a clean exit-0 with no error line
 * is reachable. "No results returned" (zero rows) is reachable.
 */
export function classifyPacFetchResult(input: { exitCode: number; output: string }): PacFetchOutcome {
  const text = input.output ?? '';
  if (/was not found in the MetadataCache/i.test(text)) return 'missing_entity';
  if (/\b401\b|unauthorized|not connected|authentication failed/i.test(text)) return 'auth_error';
  if (/^\s*Error:\s*.*(parse|malformed|invalid xml|fetchxml)/im.test(text)) return 'parse_error';
  if (input.exitCode !== 0) return 'failed';
  if (/^\s*Error:/im.test(text)) return 'failed';
  return 'reachable';
}

export const isReachable = (o: PacFetchOutcome): boolean => o === 'reachable';

export interface PacTableAccessRecord {
  readonly domain: 'crm' | 'portfolio';
  readonly method: string;
  readonly status: 'PASS' | 'FAIL';
  readonly reachable: number;
  readonly checked: number;
  readonly expected: number;
  /** PAC reachability does NOT measure Web API metadata. Always false here. */
  readonly webApiMetadataMeasured: boolean;
}

/** Recorded from a real run of scripts/dataverse/verify-pac-table-access.ps1. */
export const PAC_TABLE_ACCESS_VERIFIED_AT = '2026-06-25T10:50:00-04:00';

export const CRM_PAC_TABLE_ACCESS: PacTableAccessRecord = Object.freeze({
  domain: 'crm',
  method: 'pac org fetch (FetchXML count=1)',
  status: 'PASS',
  reachable: 5,
  checked: 5,
  expected: 5,
  webApiMetadataMeasured: false,
});

export const PORTFOLIO_PAC_TABLE_ACCESS: PacTableAccessRecord = Object.freeze({
  domain: 'portfolio',
  method: 'pac org fetch (FetchXML count=1)',
  status: 'PASS',
  reachable: 13,
  checked: 13,
  expected: 13,
  webApiMetadataMeasured: false,
});

export interface PacTableAccessReadiness {
  readonly domains: readonly PacTableAccessRecord[];
  readonly totalReachable: number;
  readonly totalChecked: number;
  /** True only when every expected table is reachable (18/18) and every domain PASS. */
  readonly allTablesReachable: boolean;
  /** Web API column/relationship metadata measurement. Still false (401). */
  readonly webApiMetadataMeasured: boolean;
  /** From the UNCHANGED bridge on the current evidence — false (metadata not measured). */
  readonly runtimeHydrated: boolean;
  readonly hydrationBlockedReason: string;
  readonly summary: string;
}

export function derivePacTableAccessReadiness(): PacTableAccessReadiness {
  const domains = [CRM_PAC_TABLE_ACCESS, PORTFOLIO_PAC_TABLE_ACCESS];
  const totalReachable = domains.reduce((a, d) => a + d.reachable, 0);
  const totalChecked = domains.reduce((a, d) => a + d.checked, 0);
  const allTablesReachable = totalReachable === totalChecked && domains.every((d) => d.status === 'PASS');

  // The bridge is the single source of truth for hydration and is NOT modified here.
  const crmHydrated = hydrateVerifiedCrmSchemaState(CURRENT_CRM_VERIFICATION_EVIDENCE).hydrated;
  const portfolioHydrated = hydrateVerifiedBoardingSchemaState(CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE).hydrated;
  const runtimeHydrated = crmHydrated && portfolioHydrated;

  return {
    domains,
    totalReachable,
    totalChecked,
    allTablesReachable,
    webApiMetadataMeasured: false,
    runtimeHydrated,
    hydrationBlockedReason:
      'Web API column/relationship metadata is not measured (token 401). PAC reachability + generated-schema presence do not satisfy the bridge measured-schema requirement, so runtime verified state does not hydrate.',
    summary: `PAC live table reachability ${totalReachable}/${totalChecked} (CRM 5/5, portfolio 13/13). Web API metadata: UNKNOWN. Runtime hydration: ${runtimeHydrated ? 'yes' : 'no'} (bridge policy unchanged).`,
  };
}
