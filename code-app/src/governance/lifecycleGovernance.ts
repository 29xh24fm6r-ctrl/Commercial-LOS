import {
  evaluateBankCreditGovernance,
  GOVERNED_CREDIT_ACTIONS,
  type GovernanceEvaluation,
  type GovernanceEvaluationRequest,
  type GovernedCreditAction,
} from './bankCreditGovernanceEngine';
import {
  BANK_CREDIT_GOVERNANCE_CONTRACT_VERSION,
  serverResponsePermitsAction,
  type BankCreditGovernanceServer,
  type ServerGovernanceEvaluationResponse,
} from './bankCreditGovernancePorts';

export type CreditLifecyclePoint =
  | 'origination'
  | 'underwriting'
  | 'recommendation'
  | 'approval'
  | 'exception-approval'
  | 'commitment'
  | 'closing'
  | 'funding-authorization'
  | 'disbursement-confirmation'
  | 'boarding'
  | 'servicing'
  | 'modification'
  | 'renewal';

export const CREDIT_LIFECYCLE_ACTION: Readonly<Record<CreditLifecyclePoint, GovernedCreditAction>> = {
  origination: 'ORIGINATE',
  underwriting: 'UNDERWRITE',
  recommendation: 'RECOMMEND',
  approval: 'APPROVE',
  'exception-approval': 'APPROVE_EXCEPTION',
  commitment: 'COMMIT',
  closing: 'CLOSE',
  'funding-authorization': 'AUTHORIZE_FUNDING',
  'disbursement-confirmation': 'CONFIRM_DISBURSEMENT',
  boarding: 'BOARD',
  servicing: 'SERVICE',
  modification: 'MODIFY',
  renewal: 'RENEW',
};

export type LifecycleGovernanceMode = 'LEGACY_ONLY' | 'SHADOW' | 'ENFORCE';

/**
 * Production remains pinned to the legacy controls. PR 6 may run an explicitly
 * injected SHADOW coordinator; only PR 8 may authorize an ENFORCE resolver.
 */
export const BANK_CREDIT_GOVERNANCE_RUNTIME_MODE: LifecycleGovernanceMode = 'LEGACY_ONLY';

export interface LifecycleGovernanceContext {
  readonly bankId: string;
  readonly caseId: string;
  readonly actorSystemUserId: string;
  readonly requestedAt: string;
  readonly operationCorrelationId: string;
}

export type LegacyControlDecision =
  | { readonly allowed: true; readonly evidenceIds: readonly string[] }
  | {
      readonly allowed: false;
      readonly reasonCode: string;
      readonly safeMessage: string;
      readonly evidenceIds: readonly string[];
    };

export interface LifecycleGovernanceTrace {
  readonly lifecyclePoint: CreditLifecyclePoint;
  readonly action: GovernedCreditAction;
  readonly mode: LifecycleGovernanceMode;
  readonly legacyDecision: LegacyControlDecision;
  readonly configurableResponse?: ServerGovernanceEvaluationResponse;
  readonly configurableAvailable: boolean;
  readonly decisionsMatch?: boolean;
}

export type LifecycleGovernanceGateResult =
  | {
      readonly allowed: true;
      readonly trace: LifecycleGovernanceTrace;
      readonly authoritativeBasis: 'LEGACY' | 'LEGACY_AND_CONFIGURABLE';
    }
  | {
      readonly allowed: false;
      readonly trace: LifecycleGovernanceTrace;
      readonly reasonCode: string;
      readonly safeMessage: string;
    };

export interface LifecycleGovernanceCoordinator {
  evaluate(
    lifecyclePoint: CreditLifecyclePoint,
    context: LifecycleGovernanceContext,
    legacyDecision: LegacyControlDecision,
  ): Promise<LifecycleGovernanceGateResult>;
}

function legacyBlocked(
  lifecyclePoint: CreditLifecyclePoint,
  mode: LifecycleGovernanceMode,
  legacyDecision: Extract<LegacyControlDecision, { allowed: false }>,
): LifecycleGovernanceGateResult {
  return {
    allowed: false,
    reasonCode: legacyDecision.reasonCode,
    safeMessage: legacyDecision.safeMessage,
    trace: {
      lifecyclePoint,
      action: CREDIT_LIFECYCLE_ACTION[lifecyclePoint],
      mode,
      legacyDecision,
      configurableAvailable: false,
    },
  };
}

export function createLifecycleGovernanceCoordinator(input: {
  readonly mode?: LifecycleGovernanceMode;
  readonly server?: BankCreditGovernanceServer;
} = {}): LifecycleGovernanceCoordinator {
  const mode = input.mode ?? BANK_CREDIT_GOVERNANCE_RUNTIME_MODE;
  return {
    async evaluate(lifecyclePoint, context, legacyDecision) {
      if (!legacyDecision.allowed) return legacyBlocked(lifecyclePoint, mode, legacyDecision);
      const action = CREDIT_LIFECYCLE_ACTION[lifecyclePoint];
      if (mode === 'LEGACY_ONLY') {
        return {
          allowed: true,
          authoritativeBasis: 'LEGACY',
          trace: {
            lifecyclePoint,
            action,
            mode,
            legacyDecision,
            configurableAvailable: false,
          },
        };
      }

      let response: ServerGovernanceEvaluationResponse | undefined;
      try {
        response = await input.server?.evaluate({
          contractVersion: BANK_CREDIT_GOVERNANCE_CONTRACT_VERSION,
          evaluationId: `${context.operationCorrelationId}:${action}`,
          bankId: context.bankId,
          caseId: context.caseId,
          action,
          actorSystemUserId: context.actorSystemUserId,
          requestedAt: context.requestedAt,
          operationCorrelationId: context.operationCorrelationId,
        });
      } catch {
        response = undefined;
      }
      const configurableAvailable = response !== undefined;
      const configurablePermits = response ? serverResponsePermitsAction(response) : false;
      const trace: LifecycleGovernanceTrace = {
        lifecyclePoint,
        action,
        mode,
        legacyDecision,
        configurableResponse: response,
        configurableAvailable,
        decisionsMatch: configurableAvailable ? configurablePermits : undefined,
      };
      if (mode === 'SHADOW') {
        return { allowed: true, authoritativeBasis: 'LEGACY', trace };
      }
      if (!response) {
        return {
          allowed: false,
          reasonCode: 'CONFIGURABLE_GOVERNANCE_UNAVAILABLE',
          safeMessage: 'The authoritative bank-credit governance service is unavailable.',
          trace,
        };
      }
      if (!configurablePermits) {
        return {
          allowed: false,
          reasonCode: response.kind === 'denied-before-evaluation'
            ? response.reasonCode
            : response.result.findings[0]?.code ?? 'CONFIGURABLE_POLICY_BLOCKED',
          safeMessage: response.kind === 'denied-before-evaluation'
            ? response.safeMessage
            : response.result.findings[0]?.message ?? 'The configured bank policy blocked this action.',
          trace,
        };
      }
      return {
        allowed: true,
        authoritativeBasis: 'LEGACY_AND_CONFIGURABLE',
        trace,
      };
    },
  };
}

export type GovernedLifecycleMutationOutcome<T> =
  | {
      readonly kind: 'executed';
      readonly value: T;
      readonly governance: LifecycleGovernanceGateResult;
    }
  | {
      readonly kind: 'governance-blocked';
      readonly governance: Extract<LifecycleGovernanceGateResult, { allowed: false }>;
    };

/**
 * Single mutation boundary for every lifecycle write. Legacy controls are
 * evaluated first and remain binding in every mode; ENFORCE adds the persisted
 * server decision as a second required permit.
 */
export async function executeGovernedLifecycleMutation<T>(input: {
  readonly coordinator: LifecycleGovernanceCoordinator;
  readonly lifecyclePoint: CreditLifecyclePoint;
  readonly context: LifecycleGovernanceContext;
  readonly legacyDecision: LegacyControlDecision;
  readonly mutate: () => Promise<T>;
}): Promise<GovernedLifecycleMutationOutcome<T>> {
  const governance = await input.coordinator.evaluate(
    input.lifecyclePoint,
    input.context,
    input.legacyDecision,
  );
  if (!governance.allowed) return { kind: 'governance-blocked', governance };
  return { kind: 'executed', value: await input.mutate(), governance };
}

export interface ClientLifecyclePreview {
  readonly authoritative: false;
  readonly action: GovernedCreditAction;
  readonly evaluation: GovernanceEvaluation;
}

/**
 * Client preview uses the exact TypeScript policy semantics, but is explicitly
 * non-authoritative. A lifecycle mutation can only rely on the server response.
 */
export function previewLifecyclePolicy(
  lifecyclePoint: CreditLifecyclePoint,
  request: Omit<GovernanceEvaluationRequest, 'action'>,
): ClientLifecyclePreview {
  const action = CREDIT_LIFECYCLE_ACTION[lifecyclePoint];
  return {
    authoritative: false,
    action,
    evaluation: evaluateBankCreditGovernance({ ...request, action }),
  };
}

export function validateLifecycleActionCoverage(): readonly string[] {
  const errors: string[] = [];
  const mapped = Object.values(CREDIT_LIFECYCLE_ACTION);
  for (const action of GOVERNED_CREDIT_ACTIONS) {
    if (mapped.filter((candidate) => candidate === action).length !== 1) {
      errors.push(`${action} must map to exactly one lifecycle point.`);
    }
  }
  if (new Set(mapped).size !== mapped.length) errors.push('Lifecycle action mappings must be unique.');
  return errors;
}
