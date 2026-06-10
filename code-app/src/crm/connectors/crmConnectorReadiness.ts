/**
 * Phase 143B — Salesforce / nCino connector readiness audit (NO LIVE WRITES).
 *
 * PURE. Audits whether a connector's documentation/configuration prerequisites
 * appear in place, WITHOUT calling any provider, testing credentials, or storing
 * secrets. `configured: true` can only reach `ready_for_dry_run` — never live.
 * Every outcome keeps `liveConnectionAttempted`, `liveWritePerformed`,
 * `credentialsStored`, and `externalSystemChanged` false.
 */

import { crmDeterministicProofId } from '../activation/crmActivationSafety';

export type CrmProvider = 'salesforce' | 'ncino';
export const CRM_CONNECTOR_MODE = 'disabled_by_default' as const;

export interface CrmConnectorReadinessInput {
  provider: CrmProvider;
  configured?: boolean;
  authConfigured?: boolean;
  endpointConfigured?: boolean;
  objectMapDocumented?: boolean;
  fieldMapDocumented?: boolean;
  writePolicyDocumented?: boolean;
  rollbackDocumented?: boolean;
  mode: typeof CRM_CONNECTOR_MODE;
}

export type CrmConnectorReadinessStatus = 'not_configured' | 'blocked' | 'ready_for_dry_run' | 'rejected';

export interface CrmConnectorReadinessResult {
  status: CrmConnectorReadinessStatus;
  provider: CrmProvider;
  mode: typeof CRM_CONNECTOR_MODE;
  liveConnectionAttempted: false;
  liveWritePerformed: false;
  credentialsStored: false;
  externalSystemChanged: false;
  blockers: readonly { code: string; message: string }[];
  warnings: readonly { code: string; message: string }[];
  readinessProofId?: string;
  rejectedReason?: string;
}

const PROVIDERS: readonly CrmProvider[] = ['salesforce', 'ncino'];

function base(
  status: CrmConnectorReadinessStatus,
  provider: CrmProvider,
  blockers: { code: string; message: string }[],
  warnings: { code: string; message: string }[],
  withProof: boolean,
  rejectedReason?: string,
): CrmConnectorReadinessResult {
  return {
    status,
    provider,
    mode: CRM_CONNECTOR_MODE,
    liveConnectionAttempted: false,
    liveWritePerformed: false,
    credentialsStored: false,
    externalSystemChanged: false,
    blockers,
    warnings,
    readinessProofId: withProof ? crmDeterministicProofId('crm_connector_readiness', `${provider}|${CRM_CONNECTOR_MODE}`) : undefined,
    rejectedReason,
  };
}

export function auditCrmConnectorReadiness(
  input: CrmConnectorReadinessInput | null | undefined,
): CrmConnectorReadinessResult {
  if (!input || !PROVIDERS.includes(input.provider)) {
    return base('rejected', (input?.provider ?? 'salesforce'), [{ code: 'invalid_provider', message: 'Only salesforce or ncino is supported.' }], [], false, 'invalid_provider');
  }
  if (input.mode !== CRM_CONNECTOR_MODE) {
    return base('rejected', input.provider, [{ code: 'invalid_mode', message: 'Only the disabled-by-default mode is accepted.' }], [], false, 'invalid_mode');
  }

  const blockers: { code: string; message: string }[] = [];
  const warnings: { code: string; message: string }[] = [];

  if (input.configured !== true) {
    blockers.push({ code: 'not_configured', message: `${input.provider} connector is not configured.` });
  }
  if (input.objectMapDocumented !== true) blockers.push({ code: 'object_map_undocumented', message: 'Object map is not documented.' });
  if (input.fieldMapDocumented !== true) blockers.push({ code: 'field_map_undocumented', message: 'Field map is not documented.' });
  if (input.writePolicyDocumented !== true) blockers.push({ code: 'write_policy_undocumented', message: 'Writeback policy is not documented.' });
  if (input.rollbackDocumented !== true) blockers.push({ code: 'rollback_undocumented', message: 'Rollback plan is not documented.' });
  if (input.authConfigured !== true) warnings.push({ code: 'auth_unconfigured', message: 'Auth configuration is not in place (no credentials are tested here).' });
  if (input.endpointConfigured !== true) warnings.push({ code: 'endpoint_unconfigured', message: 'Endpoint configuration is not in place (no endpoint is stored here).' });

  if (input.configured !== true) {
    return base('not_configured', input.provider, blockers, warnings, true);
  }
  // configured=true can only reach ready_for_dry_run — never live.
  const status: CrmConnectorReadinessStatus = blockers.length === 0 ? 'ready_for_dry_run' : 'blocked';
  return base(status, input.provider, blockers, warnings, true);
}
