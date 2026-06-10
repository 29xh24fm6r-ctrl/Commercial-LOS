/**
 * Phase 143H — CRM relationship intelligence cockpit VIEW MODEL (read-only).
 *
 * PURE. Composes the source-of-truth posture, Salesforce/nCino readiness, entity
 * match, sync preview, writeback policy, dry-run proof, and activity timeline into
 * one read-only cockpit view with a single "next safe CRM activation step". It
 * performs NO live call, NO write, and emits NO "sync now" / "push now" action.
 * Every outcome keeps `readOnly` true and `liveCrmLookupPerformed` /
 * `externalSystemChanged` false.
 */

import type { CrmConnectorReadinessResult } from '../connectors/crmConnectorReadiness';
import type { CrmEntityMatchResult } from '../matching/crmEntityMatchingModel';
import type { CrmSyncPreviewResult } from '../syncPreview/crmSyncPreviewPlan';
import type { CrmWritebackPolicyGateResult } from '../writeback/crmWritebackPolicyGate';
import type { CrmControlledWritebackResult } from '../writeback/crmControlledWritebackAdapter';
import type { CrmActivityTimelineResult } from '../activityTimeline/crmActivityTimelineModel';

export interface CrmRelationshipIntelligenceInput {
  activationPostureLabel?: string;
  salesforceReadiness?: CrmConnectorReadinessResult;
  ncinoReadiness?: CrmConnectorReadinessResult;
  entityMatch?: CrmEntityMatchResult;
  syncPreview?: CrmSyncPreviewResult;
  writebackPolicy?: CrmWritebackPolicyGateResult;
  dryRunProof?: CrmControlledWritebackResult;
  timeline?: CrmActivityTimelineResult;
}

export interface CrmCockpitSection {
  key: string;
  title: string;
  status: string;
  detail: string;
}

export interface CrmRelationshipIntelligenceViewModel {
  sections: readonly CrmCockpitSection[];
  nextSafeStep: string;
  readOnly: true;
  liveCrmLookupPerformed: false;
  externalSystemChanged: false;
}

function section(key: string, title: string, status: string, detail: string): CrmCockpitSection {
  return { key, title, status, detail };
}

export function deriveCrmRelationshipIntelligenceViewModel(
  input: CrmRelationshipIntelligenceInput | null | undefined,
): CrmRelationshipIntelligenceViewModel {
  const i = input ?? {};
  const sf = i.salesforceReadiness;
  const nc = i.ncinoReadiness;

  const sections: CrmCockpitSection[] = [
    section('activation_posture', 'CRM activation posture', i.activationPostureLabel ?? 'disabled by default', 'All CRM activation is disabled/read-only/dry-run; no uncontrolled live write is possible.'),
    section('salesforce_readiness', 'Salesforce readiness', sf?.status ?? 'unavailable', sf ? `Connector status: ${sf.status.replace(/_/g, ' ')}.` : 'No Salesforce readiness provided.'),
    section('ncino_readiness', 'nCino readiness', nc?.status ?? 'unavailable', nc ? `Connector status: ${nc.status.replace(/_/g, ' ')}.` : 'No nCino readiness provided.'),
    section('entity_match', 'Entity match status', i.entityMatch?.matchStatus ?? 'unavailable', i.entityMatch ? `Match ${i.entityMatch.matchStatus.replace(/_/g, ' ')} (${i.entityMatch.confidenceBand}); human review required.` : 'No entity match provided.'),
    section('sync_preview', 'Sync preview summary', i.syncPreview ? `${i.syncPreview.blockedCount} blocked` : 'unavailable', i.syncPreview ? `Preview only — ${i.syncPreview.wouldCreateCount} would-create, ${i.syncPreview.wouldUpdateCount} would-update, ${i.syncPreview.wouldLinkCount} would-link, ${i.syncPreview.blockedCount} blocked.` : 'No sync preview provided.'),
    section('writeback_policy', 'Writeback policy status', i.writebackPolicy?.status ?? 'unavailable', i.writebackPolicy ? `Policy ${i.writebackPolicy.status.replace(/_/g, ' ')}; live write not allowed now.` : 'No writeback policy provided.'),
    section('dry_run_proof', 'Dry-run writeback proof', i.dryRunProof?.status ?? 'unavailable', i.dryRunProof ? `Dry-run ${i.dryRunProof.status.replace(/_/g, ' ')}; no live write.` : 'No dry-run proof provided.'),
    section('timeline', 'Activity / relationship timeline', i.timeline ? `${i.timeline.timelineRows.length} events` : 'unavailable', i.timeline ? 'Read-only relationship timeline from local input only.' : 'No timeline provided.'),
  ];

  // Next safe step — deterministic, never "sync now" / "push now".
  let nextSafeStep: string;
  if (!sf || !nc) {
    nextSafeStep = 'Document Salesforce and nCino connector readiness (no live connection).';
  } else if (!i.entityMatch || i.entityMatch.matchStatus === 'conflict' || i.entityMatch.matchStatus === 'unknown') {
    nextSafeStep = 'Confirm the entity match with human review (no auto-link).';
  } else if (i.syncPreview && i.syncPreview.blockedCount > 0) {
    nextSafeStep = 'Resolve sync-preview conflicts before any future writeback (no write).';
  } else if (!i.writebackPolicy || i.writebackPolicy.status !== 'ready_for_dry_run') {
    nextSafeStep = 'Complete the writeback policy prerequisites (live write remains disabled).';
  } else {
    nextSafeStep = 'Record a dry-run writeback proof (no live Salesforce or nCino write occurs).';
  }

  return { sections, nextSafeStep, readOnly: true, liveCrmLookupPerformed: false, externalSystemChanged: false };
}
