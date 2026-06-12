/**
 * Phase 154 — Dry-run writeback schema validator.
 * No writes. No transport. No credentials. No broad fields.
 */

import type { ExternalPlatformDomain } from './externalPlatformConnectorReadiness';

export type SchemaValidationStatus = 'dry_run_valid' | 'dry_run_blocked' | 'rejected';

export interface SchemaValidationInput {
  platformDomain: ExternalPlatformDomain;
  entityKind: string;
  requestedOperation: string;
  requestedFields: readonly string[];
  documentedFieldMap: readonly string[];
  allowlist: readonly string[];
  policyGateReady: boolean;
}

export interface SchemaValidationResult {
  status: SchemaValidationStatus;
  dryRunOnly: true;
  liveWritePerformed: false;
  externalSystemChanged: false;
  allowedFields: readonly string[];
  blockedFields: readonly string[];
  schemaFindings: readonly string[];
  policyFindings: readonly string[];
  dryRunProofId: string;
}

const ALWAYS_BLOCKED = [
  'stage', 'status', 'lifecycle', 'amount', 'pricing',
  'credit_decision', 'committee_vote', 'approval_status',
  'borrower_legal_name', 'tax_id', 'ssn', 'dob',
  'account_number', 'routing_number', 'loan_boarding_status', 'payment_status',
];

export function validateExternalWritebackSchema(input: SchemaValidationInput): SchemaValidationResult {
  const allowed: string[] = [];
  const blocked: string[] = [];
  const schemaFindings: string[] = [];
  const policyFindings: string[] = [];

  if (!input.policyGateReady) {
    policyFindings.push('Policy gate not ready');
  }

  for (const field of input.requestedFields) {
    if (ALWAYS_BLOCKED.includes(field)) {
      blocked.push(field);
      schemaFindings.push(`${field}: blocked by policy (authoritative/sensitive field)`);
    } else if (!input.documentedFieldMap.includes(field)) {
      blocked.push(field);
      schemaFindings.push(`${field}: not in documented field map`);
    } else if (!input.allowlist.includes(field)) {
      blocked.push(field);
      schemaFindings.push(`${field}: not in allowlist`);
    } else {
      allowed.push(field);
    }
  }

  const status: SchemaValidationStatus =
    !input.policyGateReady ? 'rejected' :
    blocked.length > 0 && allowed.length === 0 ? 'dry_run_blocked' :
    'dry_run_valid';

  return {
    status,
    dryRunOnly: true,
    liveWritePerformed: false,
    externalSystemChanged: false,
    allowedFields: allowed,
    blockedFields: blocked,
    schemaFindings,
    policyFindings,
    dryRunProofId: `dry-run:${input.platformDomain}:${input.entityKind}:${status}:${Date.now()}`,
  };
}
