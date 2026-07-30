import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  actionEvidence,
  buildDurableCertificationEvidence,
  CERTIFICATION_PROFILES,
  certificationActor,
  certificationFacts,
  committeeEvidence,
  DIRECT_DATAVERSE_BYPASS_EVIDENCE,
  discloseCombinedRoles,
  evaluateCertificationProfile,
  reconcileCertificationEvidence,
} from './multiProfileCertification';
import { GOVERNED_CREDIT_ACTIONS } from './bankCreditGovernanceEngine';

describe.each(CERTIFICATION_PROFILES)('$profileId certification', (profile) => {
  it('permits a fully evidenced action and records exact policy evidence', () => {
    const evaluation = evaluateCertificationProfile({ profile });
    expect(evaluation.decision).toBe('PERMIT');
    expect(evaluation.policyId).toBe(profile.policy.policyId);
    expect(evaluation.policyVersion).toBe(profile.policy.version);
    expect(evaluation.matchedRuleIds).not.toHaveLength(0);
    expect(reconcileCertificationEvidence(buildDurableCertificationEvidence(evaluation))).toEqual([]);
  });

  it('has a positive, policy-bound route for every governed lifecycle action', () => {
    const standardHistory = actionEvidence({
      ORIGINATE: 'originator-fixture',
      UNDERWRITE: 'underwriter-fixture',
      RECOMMEND: 'recommender-fixture',
      APPROVE: 'approver-prior-fixture',
      COMMIT: 'committer-fixture',
      CLOSE: 'closer-fixture',
      AUTHORIZE_FUNDING: 'funding-authorizer-fixture',
      CONFIRM_DISBURSEMENT: 'disbursement-confirmer-fixture',
      BOARD: 'boarder-fixture',
      SERVICE: 'servicer-fixture',
      MODIFY: 'modifier-fixture',
    });
    for (const action of GOVERNED_CREDIT_ACTIONS) {
      const isException = action === 'APPROVE_EXCEPTION';
      const needsVotes = profile.profileId === 'COMMITTEE_APPROVAL' ||
        profile.profileId === 'GOVERNED_VERSION_MIGRATION';
      const evaluation = evaluateCertificationProfile({
        profile,
        action,
        facts: certificationFacts(isException
          ? { hasPolicyException: true, policyExceptionTypes: ['Covenant'] }
          : {}),
        actor: certificationActor(action, isException ? { exceptionTypes: ['Covenant'] } : {}),
        history: standardHistory,
        approvals: needsVotes && (action === 'APPROVE' || action === 'APPROVE_EXCEPTION')
          ? committeeEvidence()
          : [],
      });
      expect(evaluation.decision, `${profile.profileId} ${action}`).toBe('PERMIT');
    }
  });

  it('blocks missing, insufficient, and expired delegated authority', () => {
    const missing = evaluateCertificationProfile({
      profile,
      actor: { actorId: 'approver-fixture', roles: ['authorized-officer'], committeeMemberships: [], authorityGrants: [] },
    });
    const insufficient = evaluateCertificationProfile({
      profile,
      actor: certificationActor('APPROVE', { maximumAmount: 99_999 }),
    });
    const expired = evaluateCertificationProfile({
      profile,
      actor: certificationActor('APPROVE', { effectiveThrough: '2026-06-30T23:59:59.999Z' }),
    });
    expect(missing.findings.map((item) => item.code)).toContain('DELEGATED_AUTHORITY_MISSING');
    expect(insufficient.findings.map((item) => item.code)).toContain('DELEGATED_AUTHORITY_EXCEEDED');
    expect(expired.findings.map((item) => item.code)).toContain('DELEGATED_AUTHORITY_MISSING');
  });

  it('enforces relationship exposure, product, risk, geography, and industry grant scope', () => {
    const cases = [
      evaluateCertificationProfile({ profile, facts: certificationFacts({ totalRelationshipExposure: 2_000_001 }) }),
      evaluateCertificationProfile({ profile, facts: certificationFacts({ product: 'CRE' }) }),
      evaluateCertificationProfile({ profile, facts: certificationFacts({ riskRating: 'Doubtful' }) }),
      evaluateCertificationProfile({ profile, facts: certificationFacts({ geography: 'US-West' }) }),
      evaluateCertificationProfile({ profile, facts: certificationFacts({ industry: 'Hospitality' }) }),
    ];
    cases.forEach((evaluation) => {
      expect(evaluation.decision).toBe('BLOCK');
      expect(evaluation.findings.map((item) => item.code)).toEqual(
        expect.arrayContaining([expect.stringMatching(/^DELEGATED_AUTHORITY_/)]),
      );
    });
  });

  it('routes policy exceptions through an exception-scoped grant', () => {
    const facts = certificationFacts({ hasPolicyException: true, policyExceptionTypes: ['Covenant'] });
    const standard = evaluateCertificationProfile({ profile, facts });
    const exception = evaluateCertificationProfile({
      profile,
      action: 'APPROVE_EXCEPTION',
      facts,
      actor: certificationActor('APPROVE_EXCEPTION', { exceptionTypes: ['Covenant'] }),
    });
    const wrongScope = evaluateCertificationProfile({
      profile,
      action: 'APPROVE_EXCEPTION',
      facts,
      actor: certificationActor('APPROVE_EXCEPTION', { exceptionTypes: ['Documentation'] }),
    });
    expect(standard.findings.map((item) => item.code)).toContain('ACTION_PROHIBITED');
    expect(exception.decision).toBe('PERMIT');
    expect(wrongScope.findings.map((item) => item.code)).toContain('DELEGATED_AUTHORITY_MISSING');
  });

  it('certifies the profile-specific role-combination rule and disclosure', () => {
    const sameActorHistory = actionEvidence({
      ORIGINATE: 'combined-fixture',
      UNDERWRITE: 'combined-fixture',
      RECOMMEND: 'combined-fixture',
    });
    const evaluation = evaluateCertificationProfile({
      profile,
      actor: certificationActor('APPROVE', { actorId: 'combined-fixture' }),
      history: sameActorHistory,
    });
    const disclosure = discloseCombinedRoles('combined-fixture', sameActorHistory);
    expect(disclosure.combined).toBe(true);
    expect(disclosure.statement).toContain('ORIGINATE');
    if (profile.profileId === 'SINGLE_AUTHORIZED_OFFICER') expect(evaluation.decision).toBe('PERMIT');
    else expect(evaluation.findings.map((item) => item.code)).toContain('INDEPENDENCE_REQUIRED');
  });

  it('handles committee evidence honestly for its operating model', () => {
    const isCommittee = profile.profileId === 'COMMITTEE_APPROVAL' ||
      profile.profileId === 'GOVERNED_VERSION_MIGRATION';
    const missingVotes = evaluateCertificationProfile({ profile, approvals: [] });
    if (isCommittee) {
      expect(missingVotes.findings.map((item) => item.code)).toContain('COMMITTEE_QUORUM_UNSATISFIED');
    } else {
      expect(missingVotes.findings.map((item) => item.code)).not.toContain('COMMITTEE_QUORUM_UNSATISFIED');
    }
  });

  it('carries the same direct-write bypass proof without claiming production registration', () => {
    expect(DIRECT_DATAVERSE_BYPASS_EVIDENCE.registrationPath).toContain('Registration.json');
    expect(DIRECT_DATAVERSE_BYPASS_EVIDENCE.productionRegistered).toBe(false);
    expect(DIRECT_DATAVERSE_BYPASS_EVIDENCE.activationState).toBe('NO_GO');
  });
});

describe('committee and hybrid certification details', () => {
  const committeeProfile = CERTIFICATION_PROFILES.find((item) => item.profileId === 'COMMITTEE_APPROVAL')!;
  const hybridProfile = CERTIFICATION_PROFILES.find((item) => item.profileId === 'HYBRID_THRESHOLD_RISK')!;

  it('counts an allowed abstention toward quorum but not approval', () => {
    const evaluation = evaluateCertificationProfile({
      profile: committeeProfile,
      approvals: committeeEvidence([
        ['APPROVE', 'voter-1'],
        ['APPROVE', 'voter-2'],
        ['ABSTAIN', 'voter-3'],
      ]),
    });
    expect(evaluation.decision).toBe('PERMIT');
  });

  it('does not count duplicate or recused identities and honors declines', () => {
    const duplicate = evaluateCertificationProfile({
      profile: committeeProfile,
      approvals: committeeEvidence([
        ['APPROVE', 'voter-1'],
        ['APPROVE', 'VOTER-1'],
        ['ABSTAIN', 'voter-3'],
      ]),
    });
    const recused = evaluateCertificationProfile({
      profile: committeeProfile,
      approvals: committeeEvidence([
        ['APPROVE', 'voter-1'],
        ['APPROVE', 'recused-fixture'],
        ['ABSTAIN', 'voter-3'],
      ]),
    });
    const declined = evaluateCertificationProfile({
      profile: committeeProfile,
      approvals: committeeEvidence([
        ['APPROVE', 'voter-1'],
        ['DECLINE', 'voter-2'],
        ['ABSTAIN', 'voter-3'],
      ]),
    });
    [duplicate, recused, declined].forEach((evaluation) => expect(evaluation.decision).toBe('BLOCK'));
  });

  it('blocks committee authority limits', () => {
    const evaluation = evaluateCertificationProfile({
      profile: committeeProfile,
      facts: certificationFacts({ amount: 5_000_001 }),
      actor: certificationActor('APPROVE', { maximumAmount: 6_000_000 }),
    });
    expect(evaluation.findings.map((item) => item.code)).toContain('COMMITTEE_AUTHORITY_EXCEEDED');
  });

  it('selects hybrid committee routes by amount or risk and leaves low-risk small deals individual', () => {
    const ordinary = evaluateCertificationProfile({ profile: hybridProfile, approvals: [] });
    const large = evaluateCertificationProfile({
      profile: hybridProfile,
      facts: certificationFacts({ amount: 500_000 }),
      approvals: [],
    });
    const risky = evaluateCertificationProfile({
      profile: hybridProfile,
      facts: certificationFacts({ riskRating: 'Substandard' }),
      approvals: [],
    });
    expect(ordinary.decision).toBe('PERMIT');
    expect(large.findings.map((item) => item.code)).toContain('COMMITTEE_QUORUM_UNSATISFIED');
    expect(risky.findings.map((item) => item.code)).toContain('COMMITTEE_QUORUM_UNSATISFIED');
  });
});

describe('governed migration and bypass certification', () => {
  const migration = CERTIFICATION_PROFILES.find((item) => item.profileId === 'GOVERNED_VERSION_MIGRATION')!;

  it('blocks a retired policy snapshot and evaluates only the active stronger version', () => {
    const retired = evaluateCertificationProfile({ profile: migration, policy: migration.priorPolicy });
    const active = evaluateCertificationProfile({ profile: migration });
    const priorShadow = evaluateCertificationProfile({
      profile: migration,
      policy: { ...migration.priorPolicy!, status: 'ACTIVE', effectiveThrough: undefined },
      approvals: [],
    });
    const activeWithoutNewControl = evaluateCertificationProfile({ profile: migration, approvals: [] });
    expect(retired.findings.map((item) => item.code)).toContain('POLICY_NOT_ACTIVE');
    expect(active.decision).toBe('PERMIT');
    expect(active.policyVersion).toBe(2);
    expect(priorShadow.decision).toBe('PERMIT');
    expect(activeWithoutNewControl.decision).toBe('BLOCK');
  });

  it('pins direct-write bypass protection to server registration and server tests without claiming production registration', () => {
    const registration = readFileSync(DIRECT_DATAVERSE_BYPASS_EVIDENCE.registrationPath, 'utf8');
    const plugin = readFileSync(DIRECT_DATAVERSE_BYPASS_EVIDENCE.pluginPath, 'utf8');
    const tests = readFileSync(DIRECT_DATAVERSE_BYPASS_EVIDENCE.testPath, 'utf8');
    expect(registration).toMatch(/Create|Update/);
    expect(plugin).toMatch(/Deny\(/);
    expect(tests).toMatch(/Throws|Deny|den/i);
    expect(DIRECT_DATAVERSE_BYPASS_EVIDENCE.productionRegistered).toBe(false);
    expect(DIRECT_DATAVERSE_BYPASS_EVIDENCE.activationState).toBe('NO_GO');
  });

  it('detects audit and timeline reconciliation drift', () => {
    const evaluation = evaluateCertificationProfile({ profile: migration });
    const evidence = buildDurableCertificationEvidence(evaluation);
    expect(reconcileCertificationEvidence({
      ...evidence,
      timeline: { ...evidence.timeline, evaluationId: 'wrong-evaluation' },
    })).toContain('Timeline evaluation ID mismatch.');
  });
});
