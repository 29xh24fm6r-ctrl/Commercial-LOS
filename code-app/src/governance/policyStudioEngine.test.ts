import { describe, expect, it } from 'vitest';
import {
  addAuthorityAssignment,
  clonePolicyVersion,
  comparePolicyVersions,
  createPolicyProfile,
  editDraftVersion,
  emptyPolicyStudioState,
  simulatePolicyVersion,
  transitionPolicyVersion,
  validateStudioVersion,
} from './policyStudioEngine';
import type { PolicyProfileKind, PolicyStudioState, PolicyStudioVersion } from './policyStudioTypes';

const CREATED_AT = '2026-07-30T12:00:00.000Z';

function create(kind: PolicyProfileKind = 'SINGLE_OFFICER') {
  return createPolicyProfile(emptyPolicyStudioState(), {
    bankKey: 'test-bank',
    name: 'Test profile',
    templateKind: kind,
    actorId: 'maker-1',
    now: CREATED_AT,
  });
}

function version(state: PolicyStudioState): PolicyStudioVersion {
  return state.profiles[0]!.versions.at(-1)!;
}

function withAuthority(state: PolicyStudioState, overrides: {
  maximumAmount?: number;
  effectiveThrough?: string;
} = {}) {
  return addAuthorityAssignment(state, version(state), {
    userId: 'officer-1',
    userDisplayName: 'Authenticated Officer',
    roles: ['authorized-officer'],
    actions: ['ORIGINATE', 'UNDERWRITE', 'APPROVE', 'CLOSE', 'FUND', 'BOARD'],
    products: [],
    maximumAmount: overrides.maximumAmount ?? 1_000_000,
    maximumRelationshipExposure: 2_000_000,
    riskRatings: [],
    geographies: [],
    industries: [],
    exceptionTypes: [],
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    effectiveThrough: overrides.effectiveThrough,
    temporary: false,
  }, 'maker-1', CREATED_AT);
}

describe('policy studio lifecycle', () => {
  it('creates each generic operating model as a versioned NO-GO draft', () => {
    const kinds: readonly PolicyProfileKind[] = [
      'SINGLE_OFFICER', 'DUAL_APPROVAL', 'SEGREGATED', 'COMMITTEE', 'HYBRID',
    ];
    for (const kind of kinds) {
      const state = create(kind);
      expect(state.activationState).toBe('NO_GO');
      expect(version(state)).toMatchObject({ profileKind: kind, status: 'DRAFT', versionNumber: 1 });
      expect(state.audit.map((entry) => entry.action)).toEqual(['CREATED']);
    }
  });

  it('enforces maker-checker approval and immutable version history', () => {
    let state = withAuthority(create());
    state = transitionPolicyVersion(state, version(state), 'SUBMIT', 'maker-1', CREATED_AT);
    expect(() => transitionPolicyVersion(
      state, version(state), 'APPROVE', 'maker-1', '2026-07-30T12:01:00.000Z',
    )).toThrow(/different users/);
    state = transitionPolicyVersion(
      state, version(state), 'APPROVE', 'approver-2', '2026-07-30T12:02:00.000Z',
    );
    state = transitionPolicyVersion(
      state, version(state), 'ACTIVATE', 'operator-3', '2026-07-30T12:03:00.000Z',
    );
    const active = version(state);
    expect(active).toMatchObject({
      status: 'ACTIVE',
      createdBy: 'maker-1',
      approvedBy: 'approver-2',
    });

    state = clonePolicyVersion(state, active, 'maker-4', '2026-07-31T12:00:00.000Z');
    expect(state.profiles[0]!.versions).toHaveLength(2);
    expect(state.profiles[0]!.versions[0]).toMatchObject({ status: 'ACTIVE', versionNumber: 1 });
    expect(version(state)).toMatchObject({ status: 'DRAFT', versionNumber: 2 });
  });

  it('detects missing identity chains, expired grants, conflicts, and invalid committee quorum', () => {
    let state = create('COMMITTEE');
    state = addAuthorityAssignment(state, version(state), {
      userId: '',
      userDisplayName: '',
      roles: [],
      actions: [],
      products: [],
      riskRatings: [],
      geographies: [],
      industries: [],
      exceptionTypes: [],
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      effectiveThrough: '2026-02-01T00:00:00.000Z',
      temporary: true,
    }, 'maker-1', CREATED_AT);
    const current = version(state);
    state = editDraftVersion(state, current, {
      committees: current.committees.map((committee) => ({
        ...committee,
        quorumRequired: 1,
        approvalsRequired: 2,
      })),
    }, 'maker-1', CREATED_AT);
    expect(validateStudioVersion(version(state), CREATED_AT).diagnostics.map((item) => item.code))
      .toEqual(expect.arrayContaining([
        'QUORUM_BELOW_APPROVALS', 'MISSING_IDENTITY_CHAIN', 'AUTHORITY_NO_ACTION', 'EXPIRED_AUTHORITY',
      ]));
  });

  it('simulates a permit and an insufficient-authority block without executing an action', () => {
    const state = withAuthority(create(), { maximumAmount: 1_000_000 });
    const draft = version(state);
    const simulation = {
      actorId: 'officer-1',
      action: 'APPROVE' as const,
      facts: {
        amount: 500_000,
        totalRelationshipExposure: 750_000,
        product: 'CRE',
        collateral: [],
        riskRating: '5',
        hasPolicyException: false,
        insiderStatus: false,
        concentration: [],
        industry: 'manufacturing',
        geography: 'Georgia',
        governmentGuaranteedProgram: undefined,
        criticizedClassifiedStatus: undefined,
      },
      actionHistory: [],
      approvals: [],
    };
    expect(simulatePolicyVersion(draft, simulation, CREATED_AT).evaluation.decision).toBe('PERMIT');
    expect(simulatePolicyVersion(draft, {
      ...simulation,
      facts: { ...simulation.facts, amount: 1_500_000 },
    }, CREATED_AT).evaluation).toMatchObject({
      decision: 'BLOCK',
      findings: expect.arrayContaining([expect.objectContaining({ code: 'DELEGATED_AUTHORITY_EXCEEDED' })]),
    });
    expect(draft.status).toBe('DRAFT');
  });

  it('classifies control weakening and strengthening between versions', () => {
    let state = withAuthority(create('SEGREGATED'), { maximumAmount: 500_000 });
    state = clonePolicyVersion(state, version(state), 'maker-2', CREATED_AT);
    const draft = version(state);
    state = editDraftVersion(state, draft, {
      roleCombinationControls: draft.roleCombinationControls.slice(1),
    }, 'maker-2', CREATED_AT);
    const comparison = comparePolicyVersions(
      state.profiles[0]!.versions[0]!,
      version(state),
    );
    expect(comparison.weakerControls).toContain('Fewer role-separation controls are required.');
  });
});

describe('policy studio invariants', () => {
  it('never permits an amount above a matched grant across representative boundaries', () => {
    for (let limit = 0; limit <= 2_000_000; limit += 100_000) {
      const state = withAuthority(create(), { maximumAmount: limit });
      const result = simulatePolicyVersion(version(state), {
        actorId: 'officer-1',
        action: 'APPROVE',
        facts: {
          amount: limit + 0.01,
          totalRelationshipExposure: 0,
          product: 'test',
          collateral: [],
          riskRating: 'test',
          hasPolicyException: false,
          insiderStatus: false,
          concentration: [],
          industry: 'test',
          geography: 'test',
          governmentGuaranteedProgram: undefined,
          criticizedClassifiedStatus: undefined,
        },
        actionHistory: [],
        approvals: [],
      }, CREATED_AT);
      expect(result.evaluation.decision).not.toBe('PERMIT');
    }
  });

  it('never treats an expired temporary delegation as effective', () => {
    const state = withAuthority(create(), { effectiveThrough: '2026-07-29T23:59:59.000Z' });
    const result = simulatePolicyVersion(version(state), {
      actorId: 'officer-1',
      action: 'APPROVE',
      facts: {
        amount: 1,
        totalRelationshipExposure: 1,
        product: 'test',
        collateral: [],
        riskRating: 'test',
        hasPolicyException: false,
        insiderStatus: false,
        concentration: [],
        industry: 'test',
        geography: 'test',
        governmentGuaranteedProgram: undefined,
        criticizedClassifiedStatus: undefined,
      },
      actionHistory: [],
      approvals: [],
    }, CREATED_AT);
    expect(result.selectedAssignment).toBeUndefined();
    expect(result.evaluation.decision).toBe('BLOCK');
  });
});
