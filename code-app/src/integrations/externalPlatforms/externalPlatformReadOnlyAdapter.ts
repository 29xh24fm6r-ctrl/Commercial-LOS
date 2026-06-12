/**
 * Phase 151 — Read-only live pull pilot adapter.
 * Disabled by default. Fails closed without secure transport. Never writes.
 */

import type { ExternalPlatformDomain } from './externalPlatformConnectorReadiness';

export type ReadOnlyAdapterMode = 'disabled_by_default' | 'read_only_pilot';

export type ReadOnlyAdapterStatus =
  | 'disabled'
  | 'unavailable'
  | 'read_only_result_available'
  | 'rejected';

export type ExternalEntityKind =
  | 'relationship'
  | 'contact'
  | 'opportunity'
  | 'loan_workflow'
  | 'activity'
  | 'document_checklist';

export interface ExternalRecord {
  externalRecordLabel: string;
  entityKind: ExternalEntityKind;
  sourcePlatformDomain: ExternalPlatformDomain;
  displayName: string | undefined;
  normalizedName: string | undefined;
  ownerLabel: string | undefined;
  statusLabel: string | undefined;
  lastUpdatedLabel: string | undefined;
  sourceConfidence: 'high' | 'medium' | 'low' | 'unknown';
  rawRecordUnavailable: boolean;
  sensitiveDataIncluded: false;
}

export interface ReadOnlyAdapterInput {
  platformDomain: ExternalPlatformDomain;
  mode: ReadOnlyAdapterMode;
  requestedEntityKinds: readonly ExternalEntityKind[];
  lookupKeyLabel: string | undefined;
  requestedByDisplayName: string | undefined;
  requestedAt: string;
}

export interface ReadOnlyAdapterResult {
  status: ReadOnlyAdapterStatus;
  liveReadAttempted: boolean;
  liveReadPerformed: boolean;
  liveWritePerformed: false;
  externalSystemChanged: false;
  credentialsExposed: false;
  records: readonly ExternalRecord[];
  warnings: readonly string[];
  blockers: readonly string[];
  auditSummary: string;
}

export type SecureTransportFn = (input: ReadOnlyAdapterInput) => ReadOnlyAdapterResult;

export function executeExternalReadOnlyPull(
  input: ReadOnlyAdapterInput,
  secureTransport?: SecureTransportFn,
): ReadOnlyAdapterResult {
  if (input.mode === 'disabled_by_default') {
    return {
      status: 'disabled',
      liveReadAttempted: false,
      liveReadPerformed: false,
      liveWritePerformed: false,
      externalSystemChanged: false,
      credentialsExposed: false,
      records: [],
      warnings: [],
      blockers: ['Read-only adapter is disabled by default.'],
      auditSummary: 'No read attempted. Adapter disabled.',
    };
  }

  if (!secureTransport) {
    return {
      status: 'unavailable',
      liveReadAttempted: false,
      liveReadPerformed: false,
      liveWritePerformed: false,
      externalSystemChanged: false,
      credentialsExposed: false,
      records: [],
      warnings: [],
      blockers: ['Secure transport not configured. Read-only connector not available.'],
      auditSummary: 'No read attempted. Secure transport not available.',
    };
  }

  return secureTransport(input);
}
