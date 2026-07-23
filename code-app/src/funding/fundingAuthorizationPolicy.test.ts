import { describe, it, expect } from 'vitest';
import {
  DEFAULT_DUAL_CONTROL_THRESHOLD_USD,
  evaluateFundingApproval,
  evaluateFundingRejection,
  evaluateFundingRevocation,
  evaluateRequestedAmount,
} from './fundingAuthorizationPolicy';
import type { FundingAuthorizationRecord } from './fundingAuthorizationTypes';

function record(over: Partial<FundingAuthorizationRecord> = {}): FundingAuthorizationRecord {
  return {
    recordId: 'rec-1',
    dealId: 'deal-1',
    authorizationStatus: 'PENDING',
    requestedAmount: 100_000,
    destinationVerificationStatus: 'unverified',
    conditionsSatisfied: false,
    exceptions: [],
    requestedBy: 'requester@bank.test',
    requestedAt: '2026-07-01T00:00:00.000Z',
    correlationId: 'corr-1',
    supportingDocumentIds: [],
    auditEventIds: [],
    ...over,
  };
}

describe('evaluateRequestedAmount', () => {
  it('accepts a positive finite number', () => {
    expect(evaluateRequestedAmount(1)).toEqual({ valid: true });
    expect(evaluateRequestedAmount(500_000)).toEqual({ valid: true });
  });

  it('rejects zero, negative, non-finite, and NaN', () => {
    expect(evaluateRequestedAmount(0).valid).toBe(false);
    expect(evaluateRequestedAmount(-1).valid).toBe(false);
    expect(evaluateRequestedAmount(Number.POSITIVE_INFINITY).valid).toBe(false);
    expect(evaluateRequestedAmount(Number.NaN).valid).toBe(false);
  });
});

describe('evaluateFundingApproval', () => {
  it('denies self-approval by the original requester', () => {
    const result = evaluateFundingApproval({
      record: record(),
      approverEmail: 'requester@bank.test',
      approvedAmount: 50_000,
      authorizedFacilityAmount: 1_000_000,
    });
    expect(result).toEqual({ kind: 'denied', reason: 'self_approval_not_permitted' });
  });

  it('denies self-approval case-insensitively / whitespace-insensitively', () => {
    const result = evaluateFundingApproval({
      record: record({ requestedBy: 'Requester@Bank.test' }),
      approverEmail: '  requester@bank.test  ',
      approvedAmount: 50_000,
      authorizedFacilityAmount: 1_000_000,
    });
    expect(result).toEqual({ kind: 'denied', reason: 'self_approval_not_permitted' });
  });

  it('denies an approved amount that exceeds the authorized facility amount', () => {
    const result = evaluateFundingApproval({
      record: record(),
      approverEmail: 'approver@bank.test',
      approvedAmount: 2_000_000,
      authorizedFacilityAmount: 1_000_000,
    });
    expect(result).toEqual({ kind: 'denied', reason: 'amount_exceeds_authorized_facility' });
  });

  it('denies approval on a terminal record', () => {
    for (const status of ['REJECTED', 'REVOKED', 'FUNDED', 'CANCELLED'] as const) {
      const result = evaluateFundingApproval({
        record: record({ authorizationStatus: status }),
        approverEmail: 'approver@bank.test',
        approvedAmount: 50_000,
        authorizedFacilityAmount: 1_000_000,
      });
      expect(result).toEqual({ kind: 'denied', reason: 'record_terminal' });
    }
  });

  it('denies approval on a NOT_REQUESTED or APPROVED record (not the right state to approve)', () => {
    expect(
      evaluateFundingApproval({
        record: record({ authorizationStatus: 'APPROVED' }),
        approverEmail: 'approver@bank.test',
        approvedAmount: 50_000,
        authorizedFacilityAmount: 1_000_000,
      }),
    ).toEqual({ kind: 'denied', reason: 'record_not_pending' });
  });

  it('below the dual-control threshold, a single approver fully approves', () => {
    const result = evaluateFundingApproval({
      record: record(),
      approverEmail: 'approver@bank.test',
      approvedAmount: DEFAULT_DUAL_CONTROL_THRESHOLD_USD - 1,
      authorizedFacilityAmount: 1_000_000,
    });
    expect(result).toEqual({ kind: 'fully_approved' });
  });

  it('at/above the dual-control threshold, the FIRST approval only records progress, not full approval', () => {
    const result = evaluateFundingApproval({
      record: record(),
      approverEmail: 'first-approver@bank.test',
      approvedAmount: DEFAULT_DUAL_CONTROL_THRESHOLD_USD,
      authorizedFacilityAmount: 5_000_000,
    });
    expect(result).toEqual({ kind: 'first_approval_recorded' });
  });

  it('a genuinely distinct SECOND approver completes dual-control approval', () => {
    const result = evaluateFundingApproval({
      record: record({ authorizedBy: 'first-approver@bank.test' }),
      approverEmail: 'second-approver@bank.test',
      approvedAmount: DEFAULT_DUAL_CONTROL_THRESHOLD_USD,
      authorizedFacilityAmount: 5_000_000,
    });
    expect(result).toEqual({ kind: 'fully_approved' });
  });

  it('the SAME person cannot be both the first and second approver under dual control', () => {
    const result = evaluateFundingApproval({
      record: record({ authorizedBy: 'first-approver@bank.test' }),
      approverEmail: 'first-approver@bank.test',
      approvedAmount: DEFAULT_DUAL_CONTROL_THRESHOLD_USD,
      authorizedFacilityAmount: 5_000_000,
    });
    expect(result).toEqual({ kind: 'denied', reason: 'self_approval_not_permitted' });
  });

  it('respects a custom dual-control threshold', () => {
    const result = evaluateFundingApproval({
      record: record(),
      approverEmail: 'approver@bank.test',
      approvedAmount: 10_000,
      authorizedFacilityAmount: 1_000_000,
      config: { dualControlThreshold: 5_000 },
    });
    expect(result).toEqual({ kind: 'first_approval_recorded' });
  });
});

describe('evaluateFundingRejection', () => {
  it('allows rejection from PENDING or BLOCKED', () => {
    expect(evaluateFundingRejection(record({ authorizationStatus: 'PENDING' }))).toEqual({ kind: 'rejected' });
    expect(evaluateFundingRejection(record({ authorizationStatus: 'BLOCKED' }))).toEqual({ kind: 'rejected' });
    expect(evaluateFundingRejection(record({ authorizationStatus: 'APPROVED' }))).toEqual({ kind: 'rejected' });
  });

  it('denies rejection of an already-terminal record', () => {
    expect(evaluateFundingRejection(record({ authorizationStatus: 'FUNDED' }))).toEqual({
      kind: 'denied',
      reason: 'record_terminal',
    });
  });
});

describe('evaluateFundingRevocation', () => {
  it('allows revocation only from APPROVED', () => {
    expect(evaluateFundingRevocation(record({ authorizationStatus: 'APPROVED' }))).toEqual({ kind: 'revoked' });
  });

  it('denies revocation before approval (PENDING)', () => {
    expect(evaluateFundingRevocation(record({ authorizationStatus: 'PENDING' }))).toEqual({
      kind: 'denied',
      reason: 'not_yet_approved',
    });
  });

  it('denies revocation of an already-funded disbursement, with a specific reason distinguishing it from other terminal states', () => {
    expect(evaluateFundingRevocation(record({ authorizationStatus: 'FUNDED' }))).toEqual({
      kind: 'denied',
      reason: 'already_funded',
    });
  });

  it('denies revocation of a record already terminal for another reason', () => {
    expect(evaluateFundingRevocation(record({ authorizationStatus: 'REJECTED' }))).toEqual({
      kind: 'denied',
      reason: 'record_terminal',
    });
  });
});
