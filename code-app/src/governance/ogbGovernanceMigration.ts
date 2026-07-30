import {
  evaluateBankCreditGovernance,
  type BankCreditGovernancePolicy,
  type GovernanceEvaluation,
  type GovernanceEvaluationRequest,
  type GovernedCreditAction,
} from './bankCreditGovernanceEngine';

export type OgbRuleMigrationStatus =
  | 'MAPPED'
  | 'RETAINED_SERVER_INVARIANT'
  | 'RATIFICATION_REQUIRED';

export interface OgbLegacyRuleInventoryItem {
  readonly legacyRuleId: string;
  readonly description: string;
  readonly sourcePaths: readonly string[];
  readonly governedActions: readonly GovernedCreditAction[];
  readonly policyRuleIds: readonly string[];
  readonly migrationStatus: OgbRuleMigrationStatus;
  readonly nonOverrideable: boolean;
  readonly parityExpectation: string;
}

/**
 * Executable inventory of the controls that exist in this repository today.
 * It is a migration description, not a statement of future OGB policy.
 */
export const OGB_LEGACY_RULE_INVENTORY: readonly OgbLegacyRuleInventoryItem[] = [
  {
    legacyRuleId: 'OGB-LEGACY-IDENTITY-001',
    description: 'Credit approval denies an unresolved actor or an actor without a banker record.',
    sourcePaths: ['src/workflow/creditApprovalAuthority.ts'],
    governedActions: ['APPROVE', 'APPROVE_EXCEPTION'],
    policyRuleIds: ['ogb-credit-approval'],
    migrationStatus: 'MAPPED',
    nonOverrideable: true,
    parityExpectation: 'A missing or ambiguous actor blocks in both engines.',
  },
  {
    legacyRuleId: 'OGB-LEGACY-AUTHORITY-002',
    description: 'All three legacy banker authority fields must be populated.',
    sourcePaths: ['src/workflow/creditApprovalAuthority.ts'],
    governedActions: ['APPROVE', 'APPROVE_EXCEPTION'],
    policyRuleIds: ['ogb-credit-approval'],
    migrationStatus: 'MAPPED',
    nonOverrideable: true,
    parityExpectation: 'An explicitly migrated, effective grant replaces the three-field completeness proxy.',
  },
  {
    legacyRuleId: 'OGB-LEGACY-COMMITTEE-003',
    description: 'A normal credit approver must have the legacy credit-committee flag.',
    sourcePaths: ['src/workflow/creditApprovalAuthority.ts'],
    governedActions: ['APPROVE'],
    policyRuleIds: ['ogb-credit-approval'],
    migrationStatus: 'MAPPED',
    nonOverrideable: true,
    parityExpectation: 'Only the migrated committee or override role can match the approval rule.',
  },
  {
    legacyRuleId: 'OGB-LEGACY-LIMIT-004',
    description: 'A normal credit approval cannot exceed the banker approval limit.',
    sourcePaths: ['src/workflow/creditApprovalAuthority.ts'],
    governedActions: ['APPROVE'],
    policyRuleIds: ['ogb-credit-approval'],
    migrationStatus: 'MAPPED',
    nonOverrideable: true,
    parityExpectation: 'The migrated delegated-authority grant carries the same maximum amount.',
  },
  {
    legacyRuleId: 'OGB-LEGACY-OVERRIDE-005',
    description: 'The legacy override flag bypasses committee and amount checks, but never self-approval.',
    sourcePaths: ['src/workflow/creditApprovalAuthority.ts'],
    governedActions: ['APPROVE_EXCEPTION'],
    policyRuleIds: ['ogb-credit-approval'],
    migrationStatus: 'RATIFICATION_REQUIRED',
    nonOverrideable: false,
    parityExpectation: 'Shadow migration may mirror the flag with an explicit role and grant; activation requires policy-owner ratification.',
  },
  {
    legacyRuleId: 'OGB-LEGACY-SELF-006',
    description: 'A credit requester and assigned/originating banker cannot approve their own deal.',
    sourcePaths: [
      'src/workflow/creditApprovalAuthority.ts',
      'dataverse-plugins/CommercialLendingLOS.Plugins/DurableRecordGovernancePlugin.cs',
    ],
    governedActions: ['APPROVE', 'APPROVE_EXCEPTION'],
    policyRuleIds: ['ogb-credit-approval'],
    migrationStatus: 'MAPPED',
    nonOverrideable: true,
    parityExpectation: 'Configured approval requires durable ORIGINATE evidence and a different actor; missing evidence is a stronger fail-closed result.',
  },
  {
    legacyRuleId: 'OGB-LEGACY-BOOKING-QC-007',
    description: 'Booking QC must be performed by someone other than the originating banker.',
    sourcePaths: ['dataverse-plugins/CommercialLendingLOS.Plugins/DurableRecordGovernancePlugin.cs'],
    governedActions: ['CLOSE'],
    policyRuleIds: [],
    migrationStatus: 'RETAINED_SERVER_INVARIANT',
    nonOverrideable: true,
    parityExpectation: 'The server identity-separation check remains mandatory while policy may add further closing authority.',
  },
  {
    legacyRuleId: 'OGB-LEGACY-FUNDING-008',
    description: 'A funding requester cannot approve, reject, revoke, or confirm their own request and approvals must be distinct.',
    sourcePaths: [
      'src/funding/fundingAuthorizationPolicy.ts',
      'dataverse-plugins/CommercialLendingLOS.Plugins/DurableRecordGovernancePlugin.cs',
    ],
    governedActions: ['AUTHORIZE_FUNDING'],
    policyRuleIds: ['ogb-funding-below-250k', 'ogb-funding-at-or-above-250k'],
    migrationStatus: 'RETAINED_SERVER_INVARIANT',
    nonOverrideable: true,
    parityExpectation: 'The existing maker/checker invariant remains mandatory; policy adds approval-count evidence.',
  },
  {
    legacyRuleId: 'OGB-LEGACY-DUAL-009',
    description: 'Funding of USD 250,000 or more requires two distinct approvers.',
    sourcePaths: [
      'src/funding/fundingAuthorizationPolicy.ts',
      'dataverse-plugins/CommercialLendingLOS.Plugins/DurableRecordGovernancePlugin.cs',
    ],
    governedActions: ['AUTHORIZE_FUNDING'],
    policyRuleIds: ['ogb-funding-at-or-above-250k'],
    migrationStatus: 'MAPPED',
    nonOverrideable: true,
    parityExpectation: 'The threshold is inclusive and the configured group requires two distinct actors.',
  },
  {
    legacyRuleId: 'OGB-LEGACY-FACILITY-010',
    description: 'A funding approval amount cannot exceed the authorized facility amount.',
    sourcePaths: [
      'src/funding/fundingAuthorizationPolicy.ts',
      'dataverse-plugins/CommercialLendingLOS.Plugins/DurableRecordGovernancePlugin.cs',
    ],
    governedActions: ['AUTHORIZE_FUNDING'],
    policyRuleIds: [],
    migrationStatus: 'RETAINED_SERVER_INVARIANT',
    nonOverrideable: true,
    parityExpectation: 'The server amount invariant remains conjunctive with policy authority.',
  },
  {
    legacyRuleId: 'OGB-LEGACY-DISBURSE-011',
    description: 'The disbursement confirmer must differ from funding approvers.',
    sourcePaths: ['dataverse-plugins/CommercialLendingLOS.Plugins/DurableRecordGovernancePlugin.cs'],
    governedActions: ['CONFIRM_DISBURSEMENT'],
    policyRuleIds: ['ogb-disbursement-confirmation'],
    migrationStatus: 'RETAINED_SERVER_INVARIANT',
    nonOverrideable: true,
    parityExpectation: 'The server invariant remains authoritative until approval actors are first-class governed action evidence.',
  },
  {
    legacyRuleId: 'OGB-LEGACY-LIFECYCLE-012',
    description: 'Commitment, closing, funding, disbursement, and boarding retain durable readiness and append-only controls.',
    sourcePaths: [
      'dataverse-plugins/CommercialLendingLOS.Plugins/DurableRecordGovernancePlugin.cs',
      'dataverse-plugins/CommercialLendingLOS.Plugins/LoanDealGovernedTransitionPlugin.cs',
    ],
    governedActions: ['COMMIT', 'CLOSE', 'AUTHORIZE_FUNDING', 'CONFIRM_DISBURSEMENT', 'BOARD'],
    policyRuleIds: [],
    migrationStatus: 'RETAINED_SERVER_INVARIANT',
    nonOverrideable: true,
    parityExpectation: 'Governance is an additional actor/authority gate and never legalizes an invalid lifecycle transition.',
  },
] as const;

/**
 * Initial versioned OGB migration profile. It intentionally contains no people,
 * votes, approvals, or grants. Those are evidence supplied at evaluation time
 * and must never be inferred from titles or workspace access.
 */
export const INITIAL_OGB_SHADOW_POLICY: BankCreditGovernancePolicy = {
  policyId: 'ogb-governance-migration',
  version: 1,
  status: 'DRAFT',
  effectiveFrom: '2026-01-01T00:00:00.000Z',
  rules: [
    {
      ruleId: 'ogb-credit-approval',
      description: 'Migrated current credit approval authority and self-approval controls.',
      actions: ['APPROVE', 'APPROVE_EXCEPTION'],
      requirements: {
        actorRoles: ['OGB_CREDIT_COMMITTEE', 'OGB_APPROVAL_OVERRIDE'],
        delegatedAuthorityRequired: true,
        independentFrom: ['ORIGINATE'],
      },
      nonOverrideable: true,
    },
    {
      ruleId: 'ogb-funding-below-250k',
      description: 'Current funding approval count below the legacy dual-control threshold.',
      actions: ['AUTHORIZE_FUNDING'],
      when: { maximumAmount: 249_999.999999 },
      requirements: {
        delegatedAuthorityRequired: true,
        approvalGroups: [{
          groupId: 'OGB_FUNDING_APPROVERS',
          approvalsRequired: 1,
          distinctActors: true,
        }],
      },
      nonOverrideable: true,
    },
    {
      ruleId: 'ogb-funding-at-or-above-250k',
      description: 'Current two-person funding approval at and above USD 250,000.',
      actions: ['AUTHORIZE_FUNDING'],
      when: { minimumAmount: 250_000 },
      requirements: {
        delegatedAuthorityRequired: true,
        approvalGroups: [{
          groupId: 'OGB_FUNDING_APPROVERS',
          approvalsRequired: 2,
          distinctActors: true,
        }],
      },
      nonOverrideable: true,
    },
    {
      ruleId: 'ogb-disbursement-confirmation',
      description: 'Adds explicit delegated authority while legacy disbursement separation remains mandatory.',
      actions: ['CONFIRM_DISBURSEMENT'],
      requirements: { delegatedAuthorityRequired: true },
      nonOverrideable: true,
    },
  ],
};

export function activateOgbPolicyForShadow(
  policy: BankCreditGovernancePolicy = INITIAL_OGB_SHADOW_POLICY,
): BankCreditGovernancePolicy {
  return { ...policy, status: 'ACTIVE' };
}

export type ShadowComparisonClassification =
  | 'MATCH'
  | 'CONFIGURABLE_STRONGER'
  | 'CONFIGURABLE_WEAKER'
  | 'UNEXPLAINED';

export interface OgbShadowCase {
  readonly caseId: string;
  readonly description: string;
  readonly source: 'REPOSITORY_CONTROLLED' | 'REPRESENTATIVE_SYNTHETIC' | 'EXISTING_DEAL';
  readonly legacyPermitted: boolean;
  readonly request: GovernanceEvaluationRequest;
  readonly expectedClassification?: ShadowComparisonClassification;
}

export interface OgbShadowResult {
  readonly caseId: string;
  readonly classification: ShadowComparisonClassification;
  readonly legacyPermitted: boolean;
  readonly configurableDecision: GovernanceEvaluation['decision'];
  readonly evaluation: GovernanceEvaluation;
  readonly explained: boolean;
}

export function compareOgbShadowCase(testCase: OgbShadowCase): OgbShadowResult {
  const evaluation = evaluateBankCreditGovernance(testCase.request);
  const configurablePermitted = evaluation.decision === 'PERMIT';
  let classification: ShadowComparisonClassification;
  if (evaluation.decision === 'ESCALATE') classification = 'UNEXPLAINED';
  else if (configurablePermitted === testCase.legacyPermitted) classification = 'MATCH';
  else if (testCase.legacyPermitted) classification = 'CONFIGURABLE_STRONGER';
  else classification = 'CONFIGURABLE_WEAKER';
  return {
    caseId: testCase.caseId,
    classification,
    legacyPermitted: testCase.legacyPermitted,
    configurableDecision: evaluation.decision,
    evaluation,
    explained: testCase.expectedClassification === undefined || testCase.expectedClassification === classification,
  };
}

export interface OgbShadowCertification {
  readonly activationState: 'NO_GO';
  readonly cutoverEligible: boolean;
  readonly results: readonly OgbShadowResult[];
  readonly blockers: readonly string[];
}

export function certifyOgbShadowCases(cases: readonly OgbShadowCase[]): OgbShadowCertification {
  const results = cases.map(compareOgbShadowCase);
  const blockers: string[] = [];
  if (cases.length === 0) blockers.push('No controlled shadow cases were supplied.');
  if (results.some((result) => result.classification === 'CONFIGURABLE_WEAKER')) {
    blockers.push('At least one configurable result is weaker than the legacy control.');
  }
  if (results.some((result) => result.classification === 'UNEXPLAINED' || !result.explained)) {
    blockers.push('At least one shadow difference is unexplained.');
  }
  if (OGB_LEGACY_RULE_INVENTORY.some((item) => item.migrationStatus === 'RATIFICATION_REQUIRED')) {
    blockers.push('The legacy approval-override interpretation requires institutional ratification.');
  }
  blockers.push('Production policy activation is outside PR 6 authorization.');
  return {
    activationState: 'NO_GO',
    cutoverEligible: false,
    results,
    blockers,
  };
}
