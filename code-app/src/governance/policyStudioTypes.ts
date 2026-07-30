import type {
  ApprovalGroupRequirement,
  BankCreditGovernancePolicy,
  CreditCaseFacts,
  DelegatedAuthorityGrant,
  GovernanceActor,
  GovernanceEvaluation,
  GovernedCreditAction,
} from './bankCreditGovernanceEngine';

export type PolicyProfileKind =
  | 'SINGLE_OFFICER'
  | 'DUAL_APPROVAL'
  | 'SEGREGATED'
  | 'COMMITTEE'
  | 'HYBRID';

export type StudioVersionStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'SCHEDULED'
  | 'ACTIVE'
  | 'SUPERSEDED'
  | 'RETIRED';

export interface ExposureTier {
  readonly tierId: string;
  readonly label: string;
  readonly minimumAmount?: number;
  readonly maximumAmount?: number;
  readonly minimumRelationshipExposure?: number;
  readonly maximumRelationshipExposure?: number;
  readonly requiredApprovalGroupIds: readonly string[];
}

export interface RoleCombinationControl {
  readonly controlId: string;
  readonly action: GovernedCreditAction;
  readonly priorAction: GovernedCreditAction;
  readonly permitted: boolean;
  readonly nonOverrideable: boolean;
}

export interface CommitteeConfiguration {
  readonly committeeId: string;
  readonly name: string;
  readonly eligibleRoles: readonly string[];
  readonly quorumRequired: number;
  readonly approvalsRequired: number;
  readonly unanimous: boolean;
  readonly abstentionsCountTowardQuorum: boolean;
  readonly recusedActors: readonly string[];
  readonly maximumAmount?: number;
  readonly maximumRelationshipExposure?: number;
}

export interface StudioAuthorityAssignment {
  readonly assignmentId: string;
  readonly userId: string;
  readonly userDisplayName: string;
  readonly roles: readonly string[];
  readonly actions: readonly GovernedCreditAction[];
  readonly products: readonly string[];
  readonly maximumAmount?: number;
  readonly maximumRelationshipExposure?: number;
  readonly riskRatings: readonly string[];
  readonly geographies: readonly string[];
  readonly industries: readonly string[];
  readonly exceptionTypes: readonly string[];
  readonly effectiveFrom: string;
  readonly effectiveThrough?: string;
  readonly temporary: boolean;
  readonly supersedesAssignmentId?: string;
}

export interface PolicyStudioVersion {
  readonly studioVersionId: string;
  readonly profileId: string;
  readonly versionNumber: number;
  readonly status: StudioVersionStatus;
  readonly title: string;
  readonly profileKind: PolicyProfileKind;
  readonly policy: BankCreditGovernancePolicy;
  readonly exposureTiers: readonly ExposureTier[];
  readonly roleCombinationControls: readonly RoleCombinationControl[];
  readonly committees: readonly CommitteeConfiguration[];
  readonly authorityAssignments: readonly StudioAuthorityAssignment[];
  readonly createdBy: string;
  readonly createdAt: string;
  readonly approvedBy?: string;
  readonly approvedAt?: string;
  readonly scheduledFor?: string;
  readonly activatedAt?: string;
  readonly supersedesVersionId?: string;
}

export interface PolicyStudioProfile {
  readonly profileId: string;
  readonly bankKey: string;
  readonly name: string;
  readonly versions: readonly PolicyStudioVersion[];
}

export type PolicyStudioAuditAction =
  | 'CREATED'
  | 'CLONED'
  | 'EDITED'
  | 'VALIDATED'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'SCHEDULED'
  | 'ACTIVATED'
  | 'SUPERSEDED'
  | 'RETIRED'
  | 'AUTHORITY_ASSIGNED'
  | 'AUTHORITY_REVOKED'
  | 'SIMULATED';

export interface PolicyStudioAuditEntry {
  readonly auditId: string;
  readonly profileId: string;
  readonly studioVersionId: string;
  readonly action: PolicyStudioAuditAction;
  readonly actorId: string;
  readonly occurredAt: string;
  readonly reason: string;
  readonly beforeSha256?: string;
  readonly afterSha256?: string;
}

export interface PolicyStudioState {
  readonly profiles: readonly PolicyStudioProfile[];
  readonly audit: readonly PolicyStudioAuditEntry[];
  readonly activationState: 'NO_GO';
}

export type StudioDiagnosticSeverity = 'ERROR' | 'WARNING' | 'INFO';

export interface StudioDiagnostic {
  readonly code: string;
  readonly severity: StudioDiagnosticSeverity;
  readonly message: string;
  readonly subjectId?: string;
}

export interface PolicyValidationReport {
  readonly valid: boolean;
  readonly diagnostics: readonly StudioDiagnostic[];
}

export interface PolicyComparison {
  readonly fromVersionId: string;
  readonly toVersionId: string;
  readonly weakerControls: readonly string[];
  readonly strongerControls: readonly string[];
  readonly neutralChanges: readonly string[];
}

export interface PolicySimulationInput {
  readonly facts: CreditCaseFacts;
  readonly action: GovernedCreditAction;
  readonly actorId: string;
  readonly actionHistory: readonly {
    action: GovernedCreditAction;
    actorId: string;
    occurredAt: string;
    evidenceId: string;
  }[];
  readonly approvals: readonly {
    approvalId: string;
    groupId: string;
    actorId: string;
    actorRoles: readonly string[];
    committeeId?: string;
    decision: 'APPROVE' | 'DECLINE' | 'ABSTAIN';
    occurredAt: string;
  }[];
}

export interface PolicySimulationResult {
  readonly evaluation: GovernanceEvaluation;
  readonly selectedAssignment?: StudioAuthorityAssignment;
  readonly selectedActor?: GovernanceActor;
  readonly explanation: readonly string[];
}

export interface PolicyTemplate {
  readonly kind: PolicyProfileKind;
  readonly title: string;
  readonly description: string;
  readonly approvalGroups: readonly ApprovalGroupRequirement[];
  readonly policy: BankCreditGovernancePolicy;
  readonly tiers: readonly ExposureTier[];
  readonly combinations: readonly RoleCombinationControl[];
  readonly committees: readonly CommitteeConfiguration[];
}

export function assignmentToGrant(assignment: StudioAuthorityAssignment): DelegatedAuthorityGrant {
  return {
    grantId: assignment.assignmentId,
    actions: assignment.actions,
    maximumAmount: assignment.maximumAmount,
    maximumRelationshipExposure: assignment.maximumRelationshipExposure,
    products: assignment.products.length > 0 ? assignment.products : undefined,
    effectiveFrom: assignment.effectiveFrom,
    effectiveThrough: assignment.effectiveThrough,
  };
}
