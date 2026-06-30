// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { approvalSatisfies, type ApprovalRecord } from './approvalAuthorityMatrix';
import { evaluateExitGate } from './stageGateContract';

describe('approvalSatisfies - OGB single authorized-approver policy', () => {
  const rec = (over: Partial<ApprovalRecord> = {}): ApprovalRecord => ({
    approvalRecorded: true,
    approverIsAuthorized: true,
    ...over,
  });

  it('passes when an approval is recorded by an authorized approver', () => {
    expect(approvalSatisfies(rec())).toBe(true);
  });

  it('does not take loan amount, so any authorized approver satisfies regardless of amount', () => {
    expect(approvalSatisfies.length).toBe(1);
    expect(approvalSatisfies(rec())).toBe(true);
  });

  it('fails closed when the record is missing, approval is missing, or the actor is unauthorized', () => {
    expect(approvalSatisfies(undefined)).toBe(false);
    expect(approvalSatisfies(null)).toBe(false);
    expect(approvalSatisfies(rec({ approvalRecorded: false }))).toBe(false);
    expect(approvalSatisfies(rec({ approverIsAuthorized: false }))).toBe(false);
  });

  it('keeps amount-tier logic out of the policy module', () => {
    const source = readFileSync(resolve(__dirname, 'approvalAuthorityMatrix.ts'), 'utf8');
    expect(source).not.toMatch(/requiredAuthority|AUTHORITY_RANK|maxAmount|250_000|1_000_000|5_000_000/);
    expect(source).toMatch(/single authorized-approver gate, no amount tiers/i);
  });
});

describe('CREDIT_APPROVAL gate consumes the simplified approval policy', () => {
  const baseFacts = {
    creditMemoFinalized: true,
    approvalDecisionRecorded: true,
    approvalConditionsDocumented: true,
  };

  it('gate passes when an authorized approver recorded approval', () => {
    const sufficient = approvalSatisfies({ approvalRecorded: true, approverIsAuthorized: true });
    const r = evaluateExitGate('CREDIT_APPROVAL', { ...baseFacts, approvalAuthoritySufficient: sufficient });
    expect(r.satisfied).toBe(true);
  });

  it('gate fails when the recorded actor is not authorized', () => {
    const sufficient = approvalSatisfies({ approvalRecorded: true, approverIsAuthorized: false });
    const r = evaluateExitGate('CREDIT_APPROVAL', { ...baseFacts, approvalAuthoritySufficient: sufficient });
    expect(r.satisfied).toBe(false);
    expect(r.requirements.find((req) => req.id === 'ca.authority')!).toMatchObject({
      met: false,
      label: 'Authorized approver recorded approval',
    });
  });
});
