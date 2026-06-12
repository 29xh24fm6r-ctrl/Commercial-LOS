/**
 * Phase 151 — External platform record mapper.
 * Maps sanitized external records to normalized shapes. No sensitive data accepted.
 */

import type { ExternalRecord, ExternalEntityKind } from './externalPlatformReadOnlyAdapter';
import type { ExternalPlatformDomain } from './externalPlatformConnectorReadiness';

export interface ExternalRecordInput {
  label: string;
  entityKind: ExternalEntityKind;
  platformDomain: ExternalPlatformDomain;
  displayName?: string;
  ownerLabel?: string;
  statusLabel?: string;
  lastUpdatedLabel?: string;
}

const SENSITIVE_KEYS = ['ssn', 'tin', 'dob', 'account_number', 'routing_number', 'tax_id', 'password', 'secret', 'token'];

export function mapExternalRecord(input: ExternalRecordInput): ExternalRecord {
  return {
    externalRecordLabel: input.label,
    entityKind: input.entityKind,
    sourcePlatformDomain: input.platformDomain,
    displayName: input.displayName,
    normalizedName: input.displayName?.trim().toLowerCase(),
    ownerLabel: input.ownerLabel,
    statusLabel: input.statusLabel,
    lastUpdatedLabel: input.lastUpdatedLabel,
    sourceConfidence: 'unknown',
    rawRecordUnavailable: true,
    sensitiveDataIncluded: false,
  };
}

export function rejectSensitiveKeys(keys: readonly string[]): string[] {
  return keys.filter((k) => SENSITIVE_KEYS.some((s) => k.toLowerCase().includes(s)));
}
