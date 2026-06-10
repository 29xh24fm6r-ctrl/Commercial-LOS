import { describe, it, expect } from 'vitest';
import {
  submitAdminConfigurationApplyProof,
  buildAdminConfigurationApplyProofRequest,
  ADMIN_CONFIG_TRANSPORT_MODE,
  ADMIN_CONFIG_TRANSPORT_SOURCE,
  type AdminConfigurationApplyProofRequest,
} from './adminConfigurationTransport';
import { buildAdminConfigurationApplyPlan } from './buildAdminConfigurationApplyPlan';
import { deriveAdminConfigurationApplyReadiness } from './deriveAdminConfigurationApplyReadiness';
import { buildAdminConfigurationProposal } from './buildAdminConfigurationProposal';
import { validateAdminConfigurationProposal } from './validateAdminConfigurationProposal';
import { resolveAdminConfigApplyFeatureFlags } from './adminConfigurationApplyFeatureFlags';
import type { AdminConfigurationProposal, AdminConfigurationProposalType } from './adminConfigurationTypes';

const CLOCK = '2026-06-10T00:00:00.000Z';
const FLAGS = resolveAdminConfigApplyFeatureFlags();

function proposal(type: AdminConfigurationProposalType): AdminConfigurationProposal {
  const base = buildAdminConfigurationProposal({ proposalId: 'P1', proposalType: type, title: 'Adjust view', summary: 'metadata', proposedChangeSummary: 'reorder', requestedBy: 'admin-1', clock: CLOCK });
  return { ...base, status: 'approved_not_applied' };
}

function planFor(type: AdminConfigurationProposalType) {
  const p = proposal(type);
  const readiness = deriveAdminConfigurationApplyReadiness({ proposal: p, validation: validateAdminConfigurationProposal({ proposal: p }), flags: FLAGS });
  return buildAdminConfigurationApplyPlan({ proposal: p, readiness, currentSnapshot: 'cols A,B', proposedSnapshot: 'cols B,A' });
}

function request(over: Partial<AdminConfigurationApplyProofRequest> = {}): AdminConfigurationApplyProofRequest {
  const base = buildAdminConfigurationApplyProofRequest(planFor('platform_object_change'), { requestedAt: CLOCK, actor: 'admin-1' });
  return { ...base, ...over };
}

describe('Phase 142L — fake admin configuration transport', () => {
  it('records a proof for a validated proof-only request and never writes live', () => {
    const r = submitAdminConfigurationApplyProof(request());
    expect(r.status).toBe('proof_recorded');
    expect(r.proofOnly).toBe(true);
    expect(r.liveWritePerformed).toBe(false);
    expect(r.transportProofId).toBeTruthy();
    expect(r.message.toLowerCase()).toMatch(/no live system was changed/);
  });

  it('derives a deterministic transport proof id from stable inputs', () => {
    const a = submitAdminConfigurationApplyProof(request());
    const b = submitAdminConfigurationApplyProof(request());
    expect(a.transportProofId).toBe(b.transportProofId);
    expect(a.auditSummary.changeCount).toBe(b.auditSummary.changeCount);
  });

  it('rejects a missing / empty plan', () => {
    expect(submitAdminConfigurationApplyProof(null).rejectedReason).toBe('empty_plan');
    expect(submitAdminConfigurationApplyProof(request({ planId: '' })).rejectedReason).toBe('empty_plan');
    expect(submitAdminConfigurationApplyProof(request({ changes: [] })).rejectedReason).toBe('empty_plan');
  });

  it('rejects a non-proof-only request', () => {
    const r = submitAdminConfigurationApplyProof({ ...request(), proofOnly: false as unknown as true });
    expect(r.status).toBe('rejected');
    expect(r.rejectedReason).toBe('not_proof_only');
    expect(r.liveWritePerformed).toBe(false);
  });

  it('rejects the wrong source / mode', () => {
    expect(submitAdminConfigurationApplyProof(request({ mode: 'live' as unknown as typeof ADMIN_CONFIG_TRANSPORT_MODE })).rejectedReason).toBe('not_fake_transport');
    expect(submitAdminConfigurationApplyProof(request({ source: 'other' as unknown as typeof ADMIN_CONFIG_TRANSPORT_SOURCE })).rejectedReason).toBe('not_fake_transport');
  });

  it('rejects a suspicious executable / unsafe payload', () => {
    const r = submitAdminConfigurationApplyProof(request({ changes: [{ stepType: 'metadata_review', field: 'x', afterSummary: 'function(){ run() } => go' }] }));
    expect(r.status).toBe('rejected');
    expect(r.rejectedReason).toBe('unsafe_payload');
  });

  it('keeps liveWritePerformed false and proofOnly true in every outcome', () => {
    for (const r of [submitAdminConfigurationApplyProof(request()), submitAdminConfigurationApplyProof(null), submitAdminConfigurationApplyProof(request({ proofOnly: false as unknown as true }))]) {
      expect(r.liveWritePerformed).toBe(false);
      expect(r.proofOnly).toBe(true);
      expect(r.auditSummary.liveWritePerformed).toBe(false);
    }
  });

  it('normalizes an apply plan into a proof-only request', () => {
    const req = buildAdminConfigurationApplyProofRequest(planFor('platform_object_change'), { requestedAt: CLOCK });
    expect(req.proofOnly).toBe(true);
    expect(req.source).toBe(ADMIN_CONFIG_TRANSPORT_SOURCE);
    expect(req.mode).toBe(ADMIN_CONFIG_TRANSPORT_MODE);
    expect(req.actor).toBe('unknown');
    expect(req.changes.length).toBeGreaterThan(0);
  });
});
