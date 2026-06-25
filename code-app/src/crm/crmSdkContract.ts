/**
 * Phase 253B — Full CRM local SDK / data-source contract.
 *
 * Once the full CRM schema is live (10 tables), the local typed SDK must register all 10
 * CRM tables: 10 generated `Cr664_crm*Service.ts` services AND 10 data-source registrations
 * in the (gitignored, operator-local) .power manifest. The regeneration path
 * (regenerate-powerapps-sdk.ps1) must enumerate the FULL crm-full.schema.json (10 tables),
 * not the old 5-table spine.
 *
 * Fail-closed: services=5/10 or datasources=5/10 stays BLOCKED. The runtime hydrates only
 * when services=10/10, datasources=10/10, live=10/10, and the measured schema satisfies the
 * full contract (10 tables / 147 columns / 28 relationships).
 */

/** The 10 CRM entity-set names (data sources), matching scripts/dataverse/schema/crm-full.schema.json. */
export const EXPECTED_CRM_DATA_SOURCES = [
  'cr664_crmorganizations',
  'cr664_crmpersons',
  'cr664_crmcontactpoints',
  'cr664_crmrelationships',
  'cr664_crmroleassignments',
  'cr664_crmcommunicationpreferences',
  'cr664_crmcontactauthorizations',
  'cr664_crmvendorprofiles',
  'cr664_crmtimelineevents',
  'cr664_crmauditentries',
] as const;

/** Generated service file name for an entity set: Cr664_<set without cr664_>Service.ts. */
export function crmServiceFileName(entitySet: string): string {
  return `Cr664_${entitySet.replace(/^cr664_/, '')}Service.ts`;
}

/** The 10 expected generated CRM service files. */
export const EXPECTED_CRM_SDK_SERVICES = EXPECTED_CRM_DATA_SOURCES.map(crmServiceFileName);

export const CRM_SDK_CONTRACT = Object.freeze({
  services: EXPECTED_CRM_DATA_SOURCES.length,
  dataSources: EXPECTED_CRM_DATA_SOURCES.length,
});

export interface CrmSdkRegistrationState {
  /** Generated CRM service files present (of the expected 10). */
  readonly servicesPresent: number;
  /** CRM data sources registered in the manifest (of the expected 10). */
  readonly dataSourcesPresent: number;
}

export interface CrmSdkRegistrationStatus {
  readonly status: 'PASS' | 'BLOCKED';
  readonly complete: boolean;
  readonly missingServices: number;
  readonly missingDataSources: number;
}

/**
 * Fail-closed: PASS only when BOTH services and data sources reach the full contract
 * (10/10). Anything less (e.g. the old 5/10) is BLOCKED.
 */
export function deriveCrmSdkRegistrationStatus(state: CrmSdkRegistrationState): CrmSdkRegistrationStatus {
  const missingServices = Math.max(0, CRM_SDK_CONTRACT.services - state.servicesPresent);
  const missingDataSources = Math.max(0, CRM_SDK_CONTRACT.dataSources - state.dataSourcesPresent);
  const complete =
    state.servicesPresent >= CRM_SDK_CONTRACT.services && state.dataSourcesPresent >= CRM_SDK_CONTRACT.dataSources;
  return { status: complete ? 'PASS' : 'BLOCKED', complete, missingServices, missingDataSources };
}
