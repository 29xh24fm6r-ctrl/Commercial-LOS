import type {
  ApprovalEvidence,
  BankCreditGovernancePolicy,
  CreditCaseFacts,
  GovernanceActor,
  GovernanceEvaluation,
  GovernanceEvaluationRequest,
  GovernedActionEvidence,
  GovernedCreditAction,
} from './bankCreditGovernanceEngine';

/**
 * Stable cross-runtime contract version. TypeScript clients and the Dataverse
 * server implementation must reject versions they do not understand.
 */
export const BANK_CREDIT_GOVERNANCE_CONTRACT_VERSION = 'bank-credit-governance/v1' as const;
export type BankCreditGovernanceContractVersion = typeof BANK_CREDIT_GOVERNANCE_CONTRACT_VERSION;

export interface ActivePolicyQuery {
  readonly bankId: string;
  readonly effectiveAt: string;
}

export type ActivePolicyResolution =
  | { readonly kind: 'resolved'; readonly policy: BankCreditGovernancePolicy; readonly snapshotId: string }
  | { readonly kind: 'missing' }
  | { readonly kind: 'ambiguous'; readonly policyIds: readonly string[] }
  | { readonly kind: 'failed'; readonly safeReason: string };

/** Read port for immutable, already-published policy snapshots. */
export interface BankCreditGovernancePolicyRepository {
  resolveActivePolicy(query: ActivePolicyQuery): Promise<ActivePolicyResolution>;
}

export interface GovernanceCaseQuery {
  readonly bankId: string;
  readonly caseId: string;
  readonly action: GovernedCreditAction;
  readonly effectiveAt: string;
}

export type GovernanceCaseResolution =
  | {
      readonly kind: 'resolved';
      readonly facts: CreditCaseFacts;
      readonly actor: GovernanceActor;
      readonly actionHistory: readonly GovernedActionEvidence[];
      readonly approvals: readonly ApprovalEvidence[];
      readonly sourceVersionTokens: Readonly<Record<string, string>>;
    }
  | { readonly kind: 'actor-unresolved'; readonly facts: CreditCaseFacts }
  | { readonly kind: 'facts-incomplete'; readonly missingFacts: readonly string[] }
  | { readonly kind: 'failed'; readonly safeReason: string };

/** Read port that takes an atomic fact/evidence snapshot for evaluation. */
export interface BankCreditGovernanceEvidenceRepository {
  resolveCase(query: GovernanceCaseQuery): Promise<GovernanceCaseResolution>;
}

export interface PersistedGovernanceEvaluation {
  readonly contractVersion: BankCreditGovernanceContractVersion;
  readonly bankId: string;
  readonly caseId: string;
  readonly policySnapshotId: string;
  readonly sourceVersionTokens: Readonly<Record<string, string>>;
  readonly request: GovernanceEvaluationRequest;
  readonly result: GovernanceEvaluation;
}

export type EvaluationAppendResult =
  | { readonly kind: 'appended'; readonly evaluationRecordId: string }
  | { readonly kind: 'duplicate'; readonly evaluationRecordId: string }
  | { readonly kind: 'failed'; readonly safeReason: string };

/** Append-only write port. An evaluation is never updated or deleted. */
export interface BankCreditGovernanceEvaluationRepository {
  appendEvaluation(record: PersistedGovernanceEvaluation): Promise<EvaluationAppendResult>;
}

export interface ServerGovernanceEvaluationCommand {
  readonly contractVersion: BankCreditGovernanceContractVersion;
  readonly evaluationId: string;
  readonly bankId: string;
  readonly caseId: string;
  readonly action: GovernedCreditAction;
  readonly actorSystemUserId: string;
  readonly requestedAt: string;
  readonly operationCorrelationId: string;
}

export type ServerGovernanceEvaluationResponse =
  | {
      readonly contractVersion: BankCreditGovernanceContractVersion;
      readonly kind: 'evaluated';
      readonly evaluationRecordId: string;
      readonly result: GovernanceEvaluation;
    }
  | {
      readonly contractVersion: BankCreditGovernanceContractVersion;
      readonly kind: 'denied-before-evaluation';
      readonly reasonCode:
        | 'CONTRACT_VERSION_UNSUPPORTED'
        | 'ACTIVE_POLICY_UNRESOLVED'
        | 'CASE_FACTS_UNRESOLVED'
        | 'ACTOR_UNRESOLVED'
        | 'EVALUATION_PERSISTENCE_FAILED';
      readonly safeMessage: string;
    };

/**
 * Authoritative server boundary used by lifecycle plug-ins/custom APIs.
 * Callers may proceed only for an evaluated response whose decision is PERMIT.
 */
export interface BankCreditGovernanceServer {
  evaluate(command: ServerGovernanceEvaluationCommand): Promise<ServerGovernanceEvaluationResponse>;
}

export function serverResponsePermitsAction(response: ServerGovernanceEvaluationResponse): boolean {
  return response.kind === 'evaluated' && response.result.decision === 'PERMIT';
}
