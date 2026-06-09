/**
 * Phase 142J — Disabled admin configuration persistence adapter.
 *
 * The default adapter. Mode `disabled`. getStatus → disabled_not_configured;
 * getReadiness → blocked/disabled; list methods return ok with empty lists (no
 * read occurs); save methods return ok=false with `admin_config_persistence_disabled`.
 * NO fetch, NO Dataverse call, NO write, NO apply.
 */

import type {
  AdminConfigurationPersistenceAdapter,
  AdminConfigurationProposalRecord,
} from './adminConfigurationPersistenceTypes';
import {
  blockedResult,
  disabledReadiness,
  emptyListResult,
} from './adminConfigurationPersistenceAdapter';

const DISABLED_MESSAGE = 'Admin configuration persistence is disabled — no transport is configured and no write occurs.';

export function createDisabledAdminConfigurationPersistenceAdapter(): AdminConfigurationPersistenceAdapter {
  return {
    mode: 'disabled',
    getStatus: () => 'disabled_not_configured',
    getReadiness: () => disabledReadiness('disabled', 'disabled_not_configured', DISABLED_MESSAGE),
    listProposals: () => emptyListResult('listProposals'),
    readProposal: (proposalId) => ({
      ...blockedResult<AdminConfigurationProposalRecord>('readProposal', 'admin_config_persistence_disabled', DISABLED_MESSAGE),
      recordId: proposalId,
    }),
    saveProposal: () => blockedResult('saveProposal', 'admin_config_persistence_disabled', DISABLED_MESSAGE),
    listReviewDecisions: () => emptyListResult('listReviewDecisions'),
    saveReviewDecision: () => blockedResult('saveReviewDecision', 'admin_config_persistence_disabled', DISABLED_MESSAGE),
    listAuditEntries: () => emptyListResult('listAuditEntries'),
    saveAuditEntry: () => blockedResult('saveAuditEntry', 'admin_config_persistence_disabled', DISABLED_MESSAGE),
  };
}
