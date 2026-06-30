// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  requiredAuthority,
  approvalSatisfies,
  APPROVAL_AUTHORITY_MATRIX_IS_TEMPLATE,
  type ApprovalAuthorityLevel,
} from './approvalAuthorityMatrix';
import { evaluateExitGate } from './stageGateContract';

describe('requiredAuthority — band mapping (template)', () => {
  it('maps each amount band to the required authority', () => {
    expect(requiredAuthority(100_000)).toBe('BANKER_PLUS_CREDIT_OFFICER');
    expect(requiredAuthority(250_000)).toBe('BANKER_PLUS_CREDIT_OFFICER');
    expect(requiredAuthority(250_001)).toBe('CREDIT_MANAGER');
    expect(requiredAuthority(1_000_000)).toBe('CREDIT_MANAGER');
    expect(requiredAuthority(1_000_001)).toBe('SENIOR_CREDIT_OFFICER_CCO');
    expect(requiredAuthority(5_000_000)).toBe('SENIOR_CREDIT_OFFICER_CCO');
    expect(requiredAuthority(5_000_001)).toBe('CREDIT_COMMITTEE');
    expect(requiredAuthority(50_000_000)).toBe('CREDIT_COMMITTEE');
  });

  it('is fail-closed (undefined) for an invalid/absent amount', () => {
    expect(requiredAuthority(undefined)).toBeUndefined();
    expect(requiredAuthority(null)).toBeUndefined();
    expect(requiredAuthority(0)).toBeUndefined();
    expect(requiredAuthority(-1)).toBeUndefined();
    expect(requiredAuthority(Number.NaN)).toBeUndefined();
  });

  it('is flagged as a template (not ratified policy)', () => {
    expect(APPROVAL_AUTHORITY_MATRIX_IS_TEMPLATE).toBe(true);
  });
});

describe('approvalSatisfies — authority sufficiency (fail-closed)', () => {
  const rec = (approverAuthority: ApprovalAuthorityLevel) => ({ approverAuthority });

  it('passes when approver authority meets or exceeds the required level', () => {
    expect(approvalSatisfies(rec('CREDIT_MANAGER'), 500_000)).toBe(true);
    expect(approvalSatisfies(rec('SENIOR_CREDIT_OFFICER_CCO'), 500_000)).toBe(true); // higher covers lower
    expect(approvalSatisfies(rec('CREDIT_COMMITTEE'), 50_000_000)).toBe(true);
  });

  it('fails when approver authority is below the required level', () => {
    expect(approvalSatisfies(rec('BANKER_PLUS_CREDIT_OFFICER'), 500_000)).toBe(false);
    expect(approvalSatisfies(rec('SENIOR_CREDIT_OFFICER_CCO'), 50_000_000)).toBe(false);
  });

  it('fails closed when the record or amount is missing/invalid', () => {
    expect(approvalSatisfies(undefined, 500_000)).toBe(false);
    expect(approvalSatisfies(rec('CREDIT_COMMITTEE'), undefined)).toBe(false);
    expect(approvalSatisfies(rec('CREDIT_COMMITTEE'), 0)).toBe(false);
  });
});

describe('CREDIT_APPROVAL gate consumes the matrix via approvalAuthoritySufficient', () => {
  const baseFacts = {
    creditMemoFinalized: true,
    approvalDecisionRecorded: true,
    approvalConditionsDocumented: true,
  };

  it('gate passes when the recorded approver covers the amount', () => {
    const sufficient = approvalSatisfies({ approverAuthority: 'CREDIT_MANAGER' }, 500_000);
    const r = evaluateExitGate('CREDIT_APPROVAL', { ...baseFacts, approvalAuthoritySufficient: sufficient });
    expect(r.satisfied).toBe(true);
  });

  it('gate fails when the approver authority is insufficient for the amount', () => {
    const sufficient = approvalSatisfies({ approverAuthority: 'BANKER_PLUS_CREDIT_OFFICER' }, 5_000_000);
    const r = evaluateExitGate('CREDIT_APPROVAL', { ...baseFacts, approvalAuthoritySufficient: sufficient });
    expect(r.satisfied).toBe(false);
    expect(r.requirements.find((req) => req.id === 'ca.authority')!.met).toBe(false);
  });
});
