import {
  CREDIT_INTELLIGENCE_CONTRACT_VERSION,
  executeCreditIntelligence,
  type CreditIntelligenceActor,
  type CreditIntelligenceDependencies,
  type CreditIntelligenceResult,
  type CreditIntelligenceScope,
  type CreditIntelligenceTool,
} from './creditIntelligence';

export const CREDIT_INTELLIGENCE_CUSTOM_API_NAME = 'cr664_RunCreditIntelligence' as const;

/** Minimal client intent. Identity, permissions, and record scope are never accepted from the browser. */
export interface CreditIntelligenceCustomApiCommand {
  readonly correlationId: string;
  readonly requestedAt: string;
  readonly authenticatedSystemUserId: string;
  readonly tool: CreditIntelligenceTool;
  readonly bankId: string;
  readonly dealId?: string;
  readonly partyIds: readonly string[];
  readonly requestedSourceIds: readonly string[];
  readonly question?: string;
  readonly governanceEvaluationId?: string;
}

export type CreditIntelligenceIdentityResolution =
  | { readonly kind: 'resolved'; readonly actor: CreditIntelligenceActor }
  | { readonly kind: 'missing' }
  | { readonly kind: 'duplicate'; readonly userIds: readonly string[] }
  | { readonly kind: 'failed'; readonly safeReason: string };

export interface CreditIntelligenceIdentityPort {
  resolveAuthenticatedActor(systemUserId: string): Promise<CreditIntelligenceIdentityResolution>;
}

export type CreditIntelligenceScopeResolution =
  | { readonly kind: 'resolved'; readonly scope: CreditIntelligenceScope }
  | { readonly kind: 'denied'; readonly safeReason: string }
  | { readonly kind: 'failed'; readonly safeReason: string };

export interface CreditIntelligenceScopePort {
  resolveAuthorizedScope(input: {
    readonly actor: CreditIntelligenceActor;
    readonly tool: CreditIntelligenceTool;
    readonly bankId: string;
    readonly dealId?: string;
    readonly partyIds: readonly string[];
    readonly requestedSourceIds: readonly string[];
  }): Promise<CreditIntelligenceScopeResolution>;
}

export interface CreditIntelligenceCustomApiDependencies {
  readonly identity: CreditIntelligenceIdentityPort;
  readonly scope: CreditIntelligenceScopePort;
  readonly intelligence: CreditIntelligenceDependencies;
}

function blocked(
  command: CreditIntelligenceCustomApiCommand,
  code: Extract<CreditIntelligenceResult, { status: 'blocked' }>['code'],
  safeMessage: string,
): CreditIntelligenceResult {
  return {
    status: 'blocked',
    correlationId: command.correlationId,
    tool: command.tool,
    code,
    safeMessage,
    auditEventIds: [],
  };
}

/**
 * Dataverse Custom API handler contract. It binds the caller to the
 * authenticated systemuser, resolves row/source scope on the server, and
 * only then reaches the audited intelligence orchestrator.
 */
export async function runCreditIntelligenceCustomApi(
  command: CreditIntelligenceCustomApiCommand,
  deps: CreditIntelligenceCustomApiDependencies,
): Promise<CreditIntelligenceResult> {
  if (!command.correlationId.trim() || !command.authenticatedSystemUserId.trim()) {
    return blocked(command, 'INVALID_REQUEST', 'Correlation and authenticated actor identifiers are required.');
  }
  const identity = await deps.identity.resolveAuthenticatedActor(command.authenticatedSystemUserId);
  if (identity.kind !== 'resolved') {
    const message = identity.kind === 'duplicate'
      ? 'The authenticated identity chain is ambiguous.'
      : identity.kind === 'failed'
        ? identity.safeReason
        : 'The authenticated identity could not be resolved.';
    return blocked(command, 'UNAUTHORIZED', message);
  }
  const scope = await deps.scope.resolveAuthorizedScope({
    actor: identity.actor,
    tool: command.tool,
    bankId: command.bankId,
    dealId: command.dealId,
    partyIds: command.partyIds,
    requestedSourceIds: command.requestedSourceIds,
  });
  if (scope.kind !== 'resolved') {
    return blocked(command, 'UNAUTHORIZED', scope.safeReason);
  }
  return executeCreditIntelligence({
    contractVersion: CREDIT_INTELLIGENCE_CONTRACT_VERSION,
    correlationId: command.correlationId,
    requestedAt: command.requestedAt,
    tool: command.tool,
    actor: identity.actor,
    scope: scope.scope,
    question: command.question,
    governanceEvaluationId: command.governanceEvaluationId,
  }, deps.intelligence);
}
