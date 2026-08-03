import type { GovernanceEvaluation } from '../governance/bankCreditGovernanceEngine';

export const CREDIT_INTELLIGENCE_CONTRACT_VERSION =
  'ogb-credit-intelligence/v1' as const;

export const CREDIT_INTELLIGENCE_TOOLS = [
  'research_party',
  'build_credit_evidence_packet',
  'explain_governance_route',
  'relationship_intelligence',
  'portfolio_monitoring',
  'policy_intelligence',
] as const;

export type CreditIntelligenceTool = (typeof CREDIT_INTELLIGENCE_TOOLS)[number];
export type CreditFactClass =
  | 'verified_source_fact'
  | 'crm_provided_fact'
  | 'calculated_fact'
  | 'unverified_claim'
  | 'ai_inference';

export type CreditIntelligenceSourceKind =
  | 'dataverse'
  | 'sharepoint'
  | 'microsoft_graph'
  | 'government_api'
  | 'licensed_external_api'
  | 'azure_ai_search'
  | 'document_intelligence';

export interface CreditIntelligenceActor {
  readonly systemUserId: string;
  readonly upn: string;
  readonly permissions: readonly string[];
}

export interface CreditIntelligenceScope {
  readonly bankId: string;
  readonly dealId?: string;
  readonly partyIds: readonly string[];
  readonly authorizedRecordIds: readonly string[];
  readonly authorizedSourceIds: readonly string[];
  readonly purpose:
    | 'commercial_credit_underwriting'
    | 'relationship_management'
    | 'portfolio_monitoring'
    | 'policy_administration';
}

export interface CreditIntelligenceRequest {
  readonly contractVersion: typeof CREDIT_INTELLIGENCE_CONTRACT_VERSION;
  readonly correlationId: string;
  readonly requestedAt: string;
  readonly tool: CreditIntelligenceTool;
  readonly actor: CreditIntelligenceActor;
  readonly scope: CreditIntelligenceScope;
  readonly question?: string;
  readonly governanceEvaluationId?: string;
}

export interface CreditEvidenceReference {
  readonly evidenceId: string;
  readonly sourceId: string;
  readonly sourceKind: CreditIntelligenceSourceKind;
  readonly recordId?: string;
  readonly title: string;
  readonly locator: string;
  readonly retrievedAt: string;
  readonly contentHash: string;
  readonly permissionBasis: string;
  readonly freshness: 'current' | 'aging' | 'stale' | 'unknown';
}

export interface CreditIntelligenceFact {
  readonly factId: string;
  readonly name: string;
  readonly value: string | number | boolean | null;
  readonly classification: CreditFactClass;
  readonly evidenceIds: readonly string[];
  readonly confidence?: number;
  readonly asOf?: string;
  readonly requiresHumanVerification: boolean;
}

export interface CreditSourceArtifact {
  readonly artifactId: string;
  readonly sourceId: string;
  readonly sourceKind: CreditIntelligenceSourceKind;
  readonly recordId?: string;
  readonly title: string;
  readonly locator: string;
  readonly retrievedAt: string;
  readonly contentHash: string;
  readonly permissionBasis: string;
  readonly freshness: CreditEvidenceReference['freshness'];
  readonly facts: readonly CreditIntelligenceFact[];
}

export interface CreditIntelligenceProposal {
  readonly proposalId: string;
  readonly type:
    | 'request_document'
    | 'draft_borrower_message'
    | 'create_task'
    | 'flag_for_review'
    | 'prepare_credit_memo'
    | 'explain_only';
  readonly title: string;
  readonly rationale: string;
  readonly governedWritePath?: string;
  readonly requiresConfirmation: true;
}

export interface CreditIntelligenceNarrative {
  readonly summary: string;
  readonly sections: readonly { heading: string; body: string; evidenceIds: readonly string[] }[];
  readonly citedEvidenceIds: readonly string[];
  readonly containsDecisionOrAuthorityClaim: boolean;
}

export type CreditIntelligenceResult =
  | {
      readonly status: 'complete';
      readonly correlationId: string;
      readonly tool: CreditIntelligenceTool;
      readonly facts: readonly CreditIntelligenceFact[];
      readonly evidence: readonly CreditEvidenceReference[];
      readonly contradictions: readonly string[];
      readonly narrative?: CreditIntelligenceNarrative;
      readonly governanceEvaluation?: GovernanceEvaluation;
      readonly proposals: readonly CreditIntelligenceProposal[];
      readonly warnings: readonly string[];
      readonly evaluationHash: string;
      readonly auditEventIds: readonly string[];
    }
  | {
      readonly status: 'blocked';
      readonly correlationId: string;
      readonly tool: CreditIntelligenceTool;
      readonly code:
        | 'INVALID_REQUEST'
        | 'UNAUTHORIZED'
        | 'AUDIT_UNAVAILABLE'
        | 'SOURCE_UNAVAILABLE'
        | 'GOVERNANCE_UNAVAILABLE'
        | 'UNSAFE_OUTPUT'
        | 'EVIDENCE_INTEGRITY_FAILED';
      readonly safeMessage: string;
      readonly auditEventIds: readonly string[];
    };

export interface CreditIntelligenceSourcePort {
  retrieve(request: CreditIntelligenceRequest): Promise<readonly CreditSourceArtifact[]>;
}

export interface CreditIntelligenceAuthorizationPort {
  authorize(request: CreditIntelligenceRequest): Promise<{
    readonly allowed: boolean;
    readonly safeReason?: string;
  }>;
}

export interface CreditIntelligenceGovernancePort {
  getEvaluation(evaluationId: string, actorSystemUserId: string): Promise<GovernanceEvaluation | undefined>;
}

export interface CreditIntelligenceNarratorPort {
  compose(input: {
    readonly request: CreditIntelligenceRequest;
    readonly facts: readonly CreditIntelligenceFact[];
    readonly evidence: readonly CreditEvidenceReference[];
    readonly contradictions: readonly string[];
    readonly governanceEvaluation?: GovernanceEvaluation;
  }): Promise<CreditIntelligenceNarrative>;
}

export interface CreditIntelligenceAuditEvent {
  readonly correlationId: string;
  readonly eventType: 'intelligence_start' | 'intelligence_completion' | 'intelligence_fail_closed';
  readonly timestamp: string;
  readonly actorSystemUserId: string;
  readonly actorUpn: string;
  readonly tool: CreditIntelligenceTool;
  readonly dealId?: string;
  readonly sourceIds?: readonly string[];
  readonly evidenceIds?: readonly string[];
  readonly evaluationHash?: string;
  readonly safeMessage?: string;
}

export interface CreditIntelligenceAuditPort {
  append(event: CreditIntelligenceAuditEvent): Promise<
    | { readonly kind: 'appended'; readonly eventId: string }
    | { readonly kind: 'failed'; readonly safeReason: string }
  >;
}

export interface CreditIntelligenceHashPort {
  hashCanonical(value: unknown): Promise<string>;
}

export interface CreditIntelligenceDependencies {
  readonly authorization: CreditIntelligenceAuthorizationPort;
  readonly sources: CreditIntelligenceSourcePort;
  readonly audit: CreditIntelligenceAuditPort;
  readonly hash: CreditIntelligenceHashPort;
  readonly governance?: CreditIntelligenceGovernancePort;
  readonly narrator?: CreditIntelligenceNarratorPort;
  readonly now?: () => string;
}

const TOOL_PERMISSIONS: Readonly<Record<CreditIntelligenceTool, string>> = {
  research_party: 'copilot.research_party',
  build_credit_evidence_packet: 'copilot.credit_evidence',
  explain_governance_route: 'copilot.governance_explain',
  relationship_intelligence: 'copilot.relationship_intelligence',
  portfolio_monitoring: 'copilot.portfolio_monitoring',
  policy_intelligence: 'copilot.policy_intelligence',
};

/** Never permitted as inputs to Copilot credit analysis or recommendations. */
export const PROHIBITED_CREDIT_FACT_NAMES = [
  'race',
  'color',
  'religion',
  'national_origin',
  'sex',
  'marital_status',
  'age',
  'public_assistance_income',
  'protected_rights_exercise',
] as const;

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replace(/[\s-]+/g, '_');
}

function validIso(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function block(
  request: CreditIntelligenceRequest,
  code: Extract<CreditIntelligenceResult, { status: 'blocked' }>['code'],
  safeMessage: string,
  auditEventIds: readonly string[] = [],
): CreditIntelligenceResult {
  return { status: 'blocked', correlationId: request.correlationId, tool: request.tool, code, safeMessage, auditEventIds };
}

async function failClosed(
  request: CreditIntelligenceRequest,
  deps: CreditIntelligenceDependencies,
  code: Extract<CreditIntelligenceResult, { status: 'blocked' }>['code'],
  safeMessage: string,
  auditEventIds: readonly string[],
): Promise<CreditIntelligenceResult> {
  const written = await deps.audit.append({
    correlationId: request.correlationId,
    eventType: 'intelligence_fail_closed',
    timestamp: deps.now?.() ?? new Date().toISOString(),
    actorSystemUserId: request.actor.systemUserId,
    actorUpn: request.actor.upn,
    tool: request.tool,
    dealId: request.scope.dealId,
    safeMessage,
  });
  return block(
    request,
    code,
    safeMessage,
    written.kind === 'appended' ? [...auditEventIds, written.eventId] : auditEventIds,
  );
}

function validateRequest(request: CreditIntelligenceRequest): string[] {
  const errors: string[] = [];
  if (request.contractVersion !== CREDIT_INTELLIGENCE_CONTRACT_VERSION) errors.push('unsupported contract version');
  if (!request.correlationId.trim()) errors.push('correlationId is required');
  if (!validIso(request.requestedAt)) errors.push('requestedAt must be an ISO timestamp');
  if (!(CREDIT_INTELLIGENCE_TOOLS as readonly string[]).includes(request.tool)) errors.push('unknown tool');
  if (!request.actor.systemUserId.trim() || !request.actor.upn.trim()) errors.push('authenticated actor is required');
  if (!request.scope.bankId.trim()) errors.push('bankId is required');
  if (!request.scope.authorizedSourceIds.length) errors.push('at least one authorized source is required');
  if (request.tool === 'explain_governance_route' && !request.governanceEvaluationId) {
    errors.push('governanceEvaluationId is required');
  }
  return errors;
}

function flattenAuthorizedArtifacts(
  request: CreditIntelligenceRequest,
  artifacts: readonly CreditSourceArtifact[],
): { evidence: CreditEvidenceReference[]; facts: CreditIntelligenceFact[]; errors: string[] } {
  const evidence: CreditEvidenceReference[] = [];
  const facts: CreditIntelligenceFact[] = [];
  const errors: string[] = [];
  const sources = new Set(request.scope.authorizedSourceIds.map(normalize));
  const records = new Set(request.scope.authorizedRecordIds.map(normalize));
  const evidenceIds = new Set<string>();

  for (const artifact of artifacts) {
    if (!sources.has(normalize(artifact.sourceId))) {
      errors.push(`source ${artifact.sourceId} is outside the authorized scope`);
      continue;
    }
    if (artifact.recordId && !records.has(normalize(artifact.recordId))) {
      errors.push(`record ${artifact.recordId} is outside the authorized scope`);
      continue;
    }
    if (!artifact.contentHash.trim() || !artifact.locator.trim() || !validIso(artifact.retrievedAt)) {
      errors.push(`artifact ${artifact.artifactId} lacks immutable provenance`);
      continue;
    }
    if (evidenceIds.has(normalize(artifact.artifactId))) {
      errors.push(`duplicate evidence id ${artifact.artifactId}`);
      continue;
    }
    evidenceIds.add(normalize(artifact.artifactId));
    evidence.push({
      evidenceId: artifact.artifactId,
      sourceId: artifact.sourceId,
      sourceKind: artifact.sourceKind,
      recordId: artifact.recordId,
      title: artifact.title,
      locator: artifact.locator,
      retrievedAt: artifact.retrievedAt,
      contentHash: artifact.contentHash,
      permissionBasis: artifact.permissionBasis,
      freshness: artifact.freshness,
    });
    for (const fact of artifact.facts) {
      if ((PROHIBITED_CREDIT_FACT_NAMES as readonly string[]).includes(normalize(fact.name))) {
        errors.push(`prohibited credit fact ${fact.name}`);
        continue;
      }
      if (!fact.evidenceIds.length || fact.evidenceIds.some((id) => normalize(id) !== normalize(artifact.artifactId))) {
        errors.push(`fact ${fact.factId} is not tied to its source evidence`);
        continue;
      }
      facts.push(fact);
    }
  }
  return { evidence, facts, errors };
}

function contradictionsFor(facts: readonly CreditIntelligenceFact[]): string[] {
  const byName = new Map<string, Set<string>>();
  for (const fact of facts) {
    const values = byName.get(normalize(fact.name)) ?? new Set<string>();
    values.add(JSON.stringify(fact.value));
    byName.set(normalize(fact.name), values);
  }
  return [...byName.entries()]
    .filter(([, values]) => values.size > 1)
    .map(([name]) => `Conflicting evidence was found for ${name.replaceAll('_', ' ')}.`);
}

function proposalsFor(
  request: CreditIntelligenceRequest,
  facts: readonly CreditIntelligenceFact[],
  contradictions: readonly string[],
): CreditIntelligenceProposal[] {
  const proposals: CreditIntelligenceProposal[] = [];
  if (facts.some((fact) => fact.requiresHumanVerification) || contradictions.length) {
    proposals.push({
      proposalId: `${request.correlationId}-review`,
      type: 'flag_for_review',
      title: 'Review unresolved evidence',
      rationale: 'One or more facts require human verification or conflict with another source.',
      governedWritePath: 'governed-review-task',
      requiresConfirmation: true,
    });
  }
  if (request.tool === 'build_credit_evidence_packet') {
    proposals.push({
      proposalId: `${request.correlationId}-memo`,
      type: 'prepare_credit_memo',
      title: 'Prepare a cited credit memo draft',
      rationale: 'Use the verified evidence packet as a draft input for banker review.',
      governedWritePath: 'governed-credit-memo-draft',
      requiresConfirmation: true,
    });
  }
  return proposals;
}

function narrativeIsSafe(
  narrative: CreditIntelligenceNarrative,
  evidence: readonly CreditEvidenceReference[],
): boolean {
  if (narrative.containsDecisionOrAuthorityClaim) return false;
  const ids = new Set(evidence.map((item) => normalize(item.evidenceId)));
  return narrative.citedEvidenceIds.length > 0 &&
    narrative.citedEvidenceIds.every((id) => ids.has(normalize(id))) &&
    narrative.sections.every((section) =>
      section.evidenceIds.length > 0 && section.evidenceIds.every((id) => ids.has(normalize(id))),
    );
}

/**
 * Server-only orchestrator. Audit begins before any retrieval/model work;
 * every source and record is rechecked against the authenticated scope;
 * unsupported, uncited, protected, or unauditable output fails closed.
 */
export async function executeCreditIntelligence(
  request: CreditIntelligenceRequest,
  deps: CreditIntelligenceDependencies,
): Promise<CreditIntelligenceResult> {
  const errors = validateRequest(request);
  if (errors.length) return block(request, 'INVALID_REQUEST', errors.join('; '));
  const requiredPermission = TOOL_PERMISSIONS[request.tool];
  if (!request.actor.permissions.map(normalize).includes(normalize(requiredPermission))) {
    return block(request, 'UNAUTHORIZED', 'The authenticated user is not permitted to use this intelligence tool.');
  }
  const authorization = await deps.authorization.authorize(request);
  if (!authorization.allowed) {
    return block(request, 'UNAUTHORIZED', authorization.safeReason ?? 'The requested scope is not authorized.');
  }

  const start = await deps.audit.append({
    correlationId: request.correlationId,
    eventType: 'intelligence_start',
    timestamp: deps.now?.() ?? new Date().toISOString(),
    actorSystemUserId: request.actor.systemUserId,
    actorUpn: request.actor.upn,
    tool: request.tool,
    dealId: request.scope.dealId,
    sourceIds: request.scope.authorizedSourceIds,
  });
  if (start.kind === 'failed') return block(request, 'AUDIT_UNAVAILABLE', start.safeReason);
  const auditEventIds = [start.eventId];

  let artifacts: readonly CreditSourceArtifact[];
  try {
    artifacts = await deps.sources.retrieve(request);
  } catch {
    return failClosed(request, deps, 'SOURCE_UNAVAILABLE', 'An authorized intelligence source could not be retrieved.', auditEventIds);
  }
  const flattened = flattenAuthorizedArtifacts(request, artifacts);
  if (flattened.errors.length) {
    return failClosed(request, deps, 'EVIDENCE_INTEGRITY_FAILED', flattened.errors.join('; '), auditEventIds);
  }

  let governanceEvaluation: GovernanceEvaluation | undefined;
  if (request.tool === 'explain_governance_route') {
    if (!deps.governance || !request.governanceEvaluationId) {
      return failClosed(request, deps, 'GOVERNANCE_UNAVAILABLE', 'The authoritative governance evaluation is unavailable.', auditEventIds);
    }
    governanceEvaluation = await deps.governance.getEvaluation(
      request.governanceEvaluationId,
      request.actor.systemUserId,
    );
    if (!governanceEvaluation) {
      return failClosed(request, deps, 'GOVERNANCE_UNAVAILABLE', 'The authoritative governance evaluation could not be resolved.', auditEventIds);
    }
  }

  const contradictions = contradictionsFor(flattened.facts);
  let narrative: CreditIntelligenceNarrative | undefined;
  if (deps.narrator && flattened.evidence.length) {
    narrative = await deps.narrator.compose({
      request,
      facts: flattened.facts,
      evidence: flattened.evidence,
      contradictions,
      governanceEvaluation,
    });
    if (!narrativeIsSafe(narrative, flattened.evidence)) {
      return failClosed(request, deps, 'UNSAFE_OUTPUT', 'Copilot returned an uncited or decision-making claim.', auditEventIds);
    }
  }

  const proposals = proposalsFor(request, flattened.facts, contradictions);
  const evaluationHash = await deps.hash.hashCanonical({
    contractVersion: request.contractVersion,
    correlationId: request.correlationId,
    tool: request.tool,
    actorSystemUserId: request.actor.systemUserId,
    scope: request.scope,
    facts: flattened.facts,
    evidence: flattened.evidence,
    contradictions,
    governanceEvaluation,
    narrative,
    proposals,
  });
  if (!evaluationHash.trim()) {
    return failClosed(request, deps, 'EVIDENCE_INTEGRITY_FAILED', 'The immutable evaluation hash could not be produced.', auditEventIds);
  }
  const completion = await deps.audit.append({
    correlationId: request.correlationId,
    eventType: 'intelligence_completion',
    timestamp: deps.now?.() ?? new Date().toISOString(),
    actorSystemUserId: request.actor.systemUserId,
    actorUpn: request.actor.upn,
    tool: request.tool,
    dealId: request.scope.dealId,
    sourceIds: request.scope.authorizedSourceIds,
    evidenceIds: flattened.evidence.map((item) => item.evidenceId),
    evaluationHash,
  });
  if (completion.kind === 'failed') {
    return block(request, 'AUDIT_UNAVAILABLE', completion.safeReason, auditEventIds);
  }
  return {
    status: 'complete',
    correlationId: request.correlationId,
    tool: request.tool,
    facts: flattened.facts,
    evidence: flattened.evidence,
    contradictions,
    narrative,
    governanceEvaluation,
    proposals,
    warnings: [
      'Copilot provides research and drafting assistance only; the governed LOS remains authoritative.',
      ...(contradictions.length ? ['Conflicting evidence requires human resolution.'] : []),
    ],
    evaluationHash,
    auditEventIds: [...auditEventIds, completion.eventId],
  };
}
