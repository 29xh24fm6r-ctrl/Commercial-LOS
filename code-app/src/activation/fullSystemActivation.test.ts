import { describe, it, expect } from 'vitest';
import { deriveFullSystemActivation, type CapabilityActivationSummary, type FullSystemActivationInput } from './fullSystemActivation';
import { SMOKE_CAPABILITIES, type OperatorSmokeEvidence, type SmokeCapability, type SmokeEvidenceRegistryInput } from '../access/operatorSmokeEvidenceRegistry';
import type { CapabilityReadiness } from './launchReadiness';

function ready(capability: SmokeCapability): CapabilityActivationSummary {
  const readiness: CapabilityReadiness = { capability, level: 'launch-ready', blockers: [], satisfied: ['all'] };
  return { capability, readiness, critical: true };
}
function blocked(capability: SmokeCapability): CapabilityActivationSummary {
  const readiness: CapabilityReadiness = { capability, level: 'blocked', blockers: ['flag off'], satisfied: [] };
  return { capability, readiness, critical: true };
}
function passed(capability: SmokeCapability): OperatorSmokeEvidence {
  return { capability, outcome: 'passed', actorUpn: 'a@ogb.com', actorPlatformUserId: 'pu', timestamp: '2026-06-23T00:00:00Z', correlationId: 'c', environmentName: 'DEV', evidenceNote: 'smoke', rollbackVerified: true };
}
function allEvidence(): SmokeEvidenceRegistryInput {
  return { source: 'out-of-band', records: SMOKE_CAPABILITIES.map(passed) };
}
function input(over: Partial<FullSystemActivationInput> = {}): FullSystemActivationInput {
  return {
    capabilities: SMOKE_CAPABILITIES.map(ready),
    evidence: allEvidence(),
    buildVerified: true, fullSuiteGreen: true, deployedFromMaster: true, operatorSignoffCaptured: true,
    documentedDeferrals: [],
    ...over,
  };
}

describe('Phase 224 — full-system GO decision', () => {
  it('GO only when every capability is ready, every smoke passed, and all infra gates pass', () => {
    const r = deriveFullSystemActivation(input());
    expect(r.decision).toBe('GO');
    expect(r.reasons).toEqual([]);
  });

  it('NO_GO when any capability is blocked', () => {
    const caps = SMOKE_CAPABILITIES.map(ready);
    caps[0] = blocked(SMOKE_CAPABILITIES[0]);
    const r = deriveFullSystemActivation(input({ capabilities: caps }));
    expect(r.decision).toBe('NO_GO');
    expect(r.reasons.join(' ')).toMatch(/blocked/);
  });

  it('NO_GO when a required smoke is missing', () => {
    const r = deriveFullSystemActivation(input({ evidence: { source: 'out-of-band', records: [] } }));
    expect(r.decision).toBe('NO_GO');
    expect(r.reasons.join(' ')).toMatch(/smoke/);
  });

  it('NO_GO when an infrastructure gate fails (build/suite/deploy/signoff)', () => {
    expect(deriveFullSystemActivation(input({ buildVerified: false })).decision).toBe('NO_GO');
    expect(deriveFullSystemActivation(input({ fullSuiteGreen: false })).decision).toBe('NO_GO');
    expect(deriveFullSystemActivation(input({ deployedFromMaster: false })).decision).toBe('NO_GO');
    expect(deriveFullSystemActivation(input({ operatorSignoffCaptured: false })).decision).toBe('NO_GO');
  });

  it('CONDITIONAL_GO when a NON-critical capability is an explicit documented deferral', () => {
    const caps = SMOKE_CAPABILITIES.map(ready);
    // make document-upload a non-critical, blocked, deferred capability
    const idx = SMOKE_CAPABILITIES.indexOf('document-upload');
    caps[idx] = { capability: 'document-upload', readiness: { capability: 'document-upload', level: 'blocked', blockers: ['File column missing'], satisfied: [] }, critical: false };
    const r = deriveFullSystemActivation(input({
      capabilities: caps,
      documentedDeferrals: [{ capability: 'document-upload', reason: 'File column not yet added; deferred and documented.' }],
    }));
    expect(r.decision).toBe('CONDITIONAL_GO');
    expect(r.deferredMatrix[0]!.capability).toBe('document-upload');
  });

  it('NO_GO when a CRITICAL capability is deferred', () => {
    const caps = SMOKE_CAPABILITIES.map(ready);
    const r = deriveFullSystemActivation(input({
      capabilities: caps,
      documentedDeferrals: [{ capability: 'new-deal-create', reason: 'attempted defer' }],
    }));
    expect(r.decision).toBe('NO_GO');
    expect(r.reasons.join(' ')).toMatch(/cannot be deferred/);
  });
});
