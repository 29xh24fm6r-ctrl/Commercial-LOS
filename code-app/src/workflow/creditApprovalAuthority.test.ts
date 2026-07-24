import { describe, it, expect } from 'vitest';
import {
  evaluateCreditApprovalAuthority,
  describeCreditApprovalAuthorityReason,
  type CreditApprovalAuthorityInput,
  type CreditApprovalAuthorityReasonCode,
} from './creditApprovalAuthority';

function baseInput(over: Partial<CreditApprovalAuthorityInput> = {}): CreditApprovalAuthorityInput {
  return {
    actorResolved: true,
    banker: { approvalLimit: 1_000_000, creditCommitteeMember: true, approvalOverrideAuthority: false },
    dealAmount: 500_000,
    requestProfileAmount: undefined,
    ...over,
  };
}

describe('evaluateCreditApprovalAuthority', () => {
  it('allows a committee member within their approval limit', () => {
    expect(evaluateCreditApprovalAuthority(baseInput())).toEqual({ allowed: true });
  });

  it('fails closed when the actor cannot be resolved', () => {
    const r = evaluateCreditApprovalAuthority(baseInput({ actorResolved: false }));
    expect(r).toEqual({ allowed: false, reasonCode: 'actor_unresolved', detail: expect.any(String) });
  });

  it('fails closed when no banker record exists', () => {
    const r = evaluateCreditApprovalAuthority(baseInput({ banker: undefined }));
    expect(r).toMatchObject({ allowed: false, reasonCode: 'no_banker_record' });
  });

  it.each([
    ['approvalLimit', { approvalLimit: undefined, creditCommitteeMember: true, approvalOverrideAuthority: false }],
    ['creditCommitteeMember', { approvalLimit: 1_000_000, creditCommitteeMember: undefined, approvalOverrideAuthority: false }],
    ['approvalOverrideAuthority', { approvalLimit: 1_000_000, creditCommitteeMember: true, approvalOverrideAuthority: undefined }],
  ])('fails closed when %s is absent (undefined), never treating absence as false', (_field, banker) => {
    const r = evaluateCreditApprovalAuthority(baseInput({ banker: banker as never }));
    expect(r).toMatchObject({ allowed: false, reasonCode: 'authority_fields_absent' });
  });

  it('fails closed when the governed amount is missing', () => {
    const r = evaluateCreditApprovalAuthority(baseInput({ dealAmount: undefined, requestProfileAmount: undefined }));
    expect(r).toMatchObject({ allowed: false, reasonCode: 'amount_missing' });
  });

  it('fails closed when the deal amount and request-profile amount conflict', () => {
    const r = evaluateCreditApprovalAuthority(baseInput({ dealAmount: 500_000, requestProfileAmount: 750_000 }));
    expect(r).toMatchObject({ allowed: false, reasonCode: 'amount_conflict' });
  });

  it('blocks a non-committee-member regardless of amount', () => {
    const r = evaluateCreditApprovalAuthority(baseInput({ banker: { approvalLimit: 10_000_000, creditCommitteeMember: false, approvalOverrideAuthority: false } }));
    expect(r).toMatchObject({ allowed: false, reasonCode: 'committee_authority_required' });
  });

  it('blocks a committee member whose approval limit is exceeded by the amount', () => {
    const r = evaluateCreditApprovalAuthority(baseInput({ banker: { approvalLimit: 100_000, creditCommitteeMember: true, approvalOverrideAuthority: false }, dealAmount: 500_000 }));
    expect(r).toMatchObject({ allowed: false, reasonCode: 'amount_exceeds_individual_authority' });
  });

  it('allows exactly at the approval limit boundary (not strictly greater)', () => {
    const r = evaluateCreditApprovalAuthority(baseInput({ banker: { approvalLimit: 500_000, creditCommitteeMember: true, approvalOverrideAuthority: false }, dealAmount: 500_000 }));
    expect(r).toEqual({ allowed: true });
  });

  it('override authority bypasses the committee-membership requirement', () => {
    const r = evaluateCreditApprovalAuthority(baseInput({ banker: { approvalLimit: 0, creditCommitteeMember: false, approvalOverrideAuthority: true }, dealAmount: 50_000_000 }));
    expect(r).toEqual({ allowed: true });
  });

  it('override authority bypasses the amount-conflict check too (never needs to resolve the amount)', () => {
    const r = evaluateCreditApprovalAuthority(baseInput({ banker: { approvalLimit: 0, creditCommitteeMember: false, approvalOverrideAuthority: true }, dealAmount: undefined, requestProfileAmount: undefined }));
    expect(r).toEqual({ allowed: true });
  });

  it('a committee member with an amount conflict is still blocked even if within their limit (conflict checked before the limit)', () => {
    const r = evaluateCreditApprovalAuthority(baseInput({ dealAmount: 500_000, requestProfileAmount: 999_999 }));
    expect(r).toMatchObject({ allowed: false, reasonCode: 'amount_conflict' });
  });

  describe('PR 106 — self-approval prevention', () => {
    it('blocks the advancing actor from approving their own deal, even with override authority', () => {
      const r = evaluateCreditApprovalAuthority(
        baseInput({
          banker: { approvalLimit: 0, creditCommitteeMember: false, approvalOverrideAuthority: true },
          advancingActorBankerId: 'banker-1',
          originatingBankerId: 'banker-1',
        }),
      );
      expect(r).toMatchObject({ allowed: false, reasonCode: 'self_approval_not_permitted' });
    });

    it('allows a genuinely different approver (both ids present, distinct)', () => {
      const r = evaluateCreditApprovalAuthority(
        baseInput({ advancingActorBankerId: 'banker-1', originatingBankerId: 'banker-2' }),
      );
      expect(r).toEqual({ allowed: true });
    });

    it('has no opinion (does not deny) when either id is absent -- never fabricates enforcement it cannot verify', () => {
      const r1 = evaluateCreditApprovalAuthority(baseInput({ advancingActorBankerId: undefined, originatingBankerId: 'banker-2' }));
      expect(r1).toEqual({ allowed: true });
      const r2 = evaluateCreditApprovalAuthority(baseInput({ advancingActorBankerId: 'banker-1', originatingBankerId: undefined }));
      expect(r2).toEqual({ allowed: true });
    });

    it('self-approval is checked before the amount/committee checks (denies even when those would also fail)', () => {
      const r = evaluateCreditApprovalAuthority(
        baseInput({
          banker: { approvalLimit: 100, creditCommitteeMember: false, approvalOverrideAuthority: false },
          dealAmount: undefined,
          requestProfileAmount: undefined,
          advancingActorBankerId: 'banker-1',
          originatingBankerId: 'banker-1',
        }),
      );
      expect(r).toMatchObject({ allowed: false, reasonCode: 'self_approval_not_permitted' });
    });
  });
});

describe('describeCreditApprovalAuthorityReason', () => {
  const codes: CreditApprovalAuthorityReasonCode[] = [
    'actor_unresolved', 'no_banker_record', 'authority_fields_absent', 'amount_missing',
    'amount_conflict', 'amount_exceeds_individual_authority', 'committee_authority_required',
    'self_approval_not_permitted',
  ];

  it('returns non-empty, distinct copy for every reason code, never leaking numbers or field names', () => {
    const seen = new Set<string>();
    for (const code of codes) {
      const copy = describeCreditApprovalAuthorityReason(code);
      expect(copy.length).toBeGreaterThan(0);
      expect(seen.has(copy)).toBe(false);
      seen.add(copy);
      expect(copy).not.toMatch(/cr664_|approvallimit|creditcommitteemember|approvaloverrideauthority|\$\d/i);
    }
  });
});
