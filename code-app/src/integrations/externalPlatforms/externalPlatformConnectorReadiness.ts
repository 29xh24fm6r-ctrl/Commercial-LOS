/**
 * Phase 150 — External platform connector readiness.
 * No provider calls. No credentials. No endpoint values. No user-facing vendor names.
 */

export type ExternalPlatformDomain = 'external_crm' | 'external_lending_workflow';

export type ConnectorMode =
  | 'disabled_by_default'
  | 'read_only_candidate'
  | 'dry_run_candidate'
  | 'allowlisted_write_candidate';

export type ConnectorReadinessStatus =
  | 'not_configured'
  | 'blocked'
  | 'ready_for_read_only_pilot'
  | 'ready_for_dry_run_schema_validation'
  | 'rejected';

export interface ConnectorReadinessInput {
  platformDomain: ExternalPlatformDomain;
  connectorConfigured: boolean;
  authConfigured: boolean;
  secureTransportConfigured: boolean;
  readScopeDocumented: boolean;
  writeScopeDocumented: boolean;
  fieldMapDocumented: boolean;
  objectMapDocumented: boolean;
  rollbackDocumented: boolean;
  auditModelDocumented: boolean;
  mode: ConnectorMode;
}

export interface ConnectorReadinessResult {
  status: ConnectorReadinessStatus;
  liveConnectionAttempted: false;
  liveReadPerformed: false;
  liveWritePerformed: false;
  credentialsStoredInCode: false;
  externalSystemChanged: false;
  blockers: readonly string[];
  warnings: readonly string[];
  nextOperatorStep: string;
  readinessProofId: string;
}

function proofId(domain: string, status: string): string {
  return `connector-readiness:${domain}:${status}:${Date.now()}`;
}

export function evaluateExternalPlatformConnectorReadiness(
  input: ConnectorReadinessInput,
): ConnectorReadinessResult {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!input.connectorConfigured) blockers.push('Connector not configured');
  if (!input.authConfigured) blockers.push('Auth not configured');
  if (!input.secureTransportConfigured) blockers.push('Secure transport not configured');
  if (!input.readScopeDocumented) blockers.push('Read scope not documented');
  if (!input.fieldMapDocumented) warnings.push('Field map not documented');
  if (!input.objectMapDocumented) warnings.push('Object map not documented');
  if (!input.rollbackDocumented) warnings.push('Rollback plan not documented');
  if (!input.auditModelDocumented) warnings.push('Audit model not documented');

  if (input.mode === 'disabled_by_default') {
    return {
      status: 'not_configured',
      liveConnectionAttempted: false,
      liveReadPerformed: false,
      liveWritePerformed: false,
      credentialsStoredInCode: false,
      externalSystemChanged: false,
      blockers,
      warnings,
      nextOperatorStep: 'Configure connector and enable read-only candidate mode.',
      readinessProofId: proofId(input.platformDomain, 'not_configured'),
    };
  }

  if (blockers.length > 0) {
    return {
      status: 'blocked',
      liveConnectionAttempted: false,
      liveReadPerformed: false,
      liveWritePerformed: false,
      credentialsStoredInCode: false,
      externalSystemChanged: false,
      blockers,
      warnings,
      nextOperatorStep: 'Resolve blockers before proceeding.',
      readinessProofId: proofId(input.platformDomain, 'blocked'),
    };
  }

  const status: ConnectorReadinessStatus =
    input.mode === 'read_only_candidate' ? 'ready_for_read_only_pilot' :
    input.mode === 'dry_run_candidate' ? 'ready_for_dry_run_schema_validation' :
    'blocked';

  return {
    status,
    liveConnectionAttempted: false,
    liveReadPerformed: false,
    liveWritePerformed: false,
    credentialsStoredInCode: false,
    externalSystemChanged: false,
    blockers: [],
    warnings,
    nextOperatorStep: status === 'ready_for_read_only_pilot'
      ? 'Proceed to read-only live pull pilot with operator approval.'
      : 'Proceed to dry-run schema validation.',
    readinessProofId: proofId(input.platformDomain, status),
  };
}
