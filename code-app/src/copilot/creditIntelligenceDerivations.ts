import type { GovernanceEvaluation } from '../governance/bankCreditGovernanceEngine';
import type { PolicyComparison } from '../governance/policyStudioTypes';

export interface ExtractedCreditField {
  readonly fieldId: string;
  readonly documentId: string;
  readonly documentHash: string;
  readonly page: number;
  readonly name: string;
  readonly value: string | number | boolean | null;
  readonly confidence: number;
  readonly humanStatus: 'pending' | 'accepted' | 'corrected' | 'rejected';
  readonly sourceLocator: string;
}

export interface CreditEvidencePacket {
  readonly acceptedFields: readonly ExtractedCreditField[];
  readonly pendingFields: readonly ExtractedCreditField[];
  readonly rejectedFields: readonly ExtractedCreditField[];
  readonly conflicts: readonly string[];
  readonly calculations: readonly {
    name: string;
    value: number;
    formula: string;
    inputFieldIds: readonly string[];
  }[];
  readonly readyForMemoDraft: boolean;
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replace(/[\s-]+/g, '_');
}

function numericField(fields: readonly ExtractedCreditField[], name: string): ExtractedCreditField | undefined {
  return fields.find((field) => normalized(field.name) === name && typeof field.value === 'number');
}

/** Extraction is never silently accepted; only accepted/corrected inputs feed calculations. */
export function buildCreditEvidencePacket(fields: readonly ExtractedCreditField[]): CreditEvidencePacket {
  const acceptedFields = fields.filter((field) => field.humanStatus === 'accepted' || field.humanStatus === 'corrected');
  const pendingFields = fields.filter((field) => field.humanStatus === 'pending');
  const rejectedFields = fields.filter((field) => field.humanStatus === 'rejected');
  const conflicts: string[] = [];
  const grouped = new Map<string, Set<string>>();
  for (const field of acceptedFields) {
    const values = grouped.get(normalized(field.name)) ?? new Set<string>();
    values.add(JSON.stringify(field.value));
    grouped.set(normalized(field.name), values);
  }
  for (const [name, values] of grouped) {
    if (values.size > 1) conflicts.push(`Accepted documents contain conflicting values for ${name.replaceAll('_', ' ')}.`);
  }

  const calculations: CreditEvidencePacket['calculations'][number][] = [];
  const cashFlow = numericField(acceptedFields, 'cash_flow_available_for_debt_service');
  const debtService = numericField(acceptedFields, 'annual_debt_service');
  if (cashFlow && debtService && (debtService.value as number) > 0) {
    calculations.push({
      name: 'debt_service_coverage_ratio',
      value: (cashFlow.value as number) / (debtService.value as number),
      formula: 'cash_flow_available_for_debt_service / annual_debt_service',
      inputFieldIds: [cashFlow.fieldId, debtService.fieldId],
    });
  }
  const debt = numericField(acceptedFields, 'total_debt');
  const tangibleNetWorth = numericField(acceptedFields, 'tangible_net_worth');
  if (debt && tangibleNetWorth && (tangibleNetWorth.value as number) !== 0) {
    calculations.push({
      name: 'debt_to_tangible_net_worth',
      value: (debt.value as number) / (tangibleNetWorth.value as number),
      formula: 'total_debt / tangible_net_worth',
      inputFieldIds: [debt.fieldId, tangibleNetWorth.fieldId],
    });
  }
  return {
    acceptedFields,
    pendingFields,
    rejectedFields,
    conflicts,
    calculations,
    readyForMemoDraft: acceptedFields.length > 0 && pendingFields.length === 0 && conflicts.length === 0,
  };
}

export interface RelationshipCommunicationFact {
  readonly communicationId: string;
  readonly source: 'outlook' | 'teams' | 'crm_activity';
  readonly occurredAt: string;
  readonly participants: readonly string[];
  readonly summary: string;
  readonly evidenceLocator: string;
  readonly commitments: readonly { text: string; ownerUpn?: string; dueAt?: string }[];
}

export interface RelationshipIntelligenceSummary {
  readonly communications: readonly RelationshipCommunicationFact[];
  readonly openCommitments: readonly {
    communicationId: string;
    text: string;
    ownerUpn?: string;
    dueAt?: string;
    evidenceLocator: string;
  }[];
  readonly warnings: readonly string[];
}

export function deriveRelationshipIntelligence(
  communications: readonly RelationshipCommunicationFact[],
  asOf: string,
): RelationshipIntelligenceSummary {
  const ordered = [...communications].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  const openCommitments = ordered.flatMap((communication) => communication.commitments.map((commitment) => ({
    communicationId: communication.communicationId,
    ...commitment,
    evidenceLocator: communication.evidenceLocator,
  })));
  const warnings = openCommitments
    .filter((commitment) => commitment.dueAt && Date.parse(commitment.dueAt) < Date.parse(asOf))
    .map((commitment) => `Commitment is overdue: ${commitment.text}`);
  return { communications: ordered, openCommitments, warnings };
}

export interface PortfolioMonitoringInput {
  readonly dealId: string;
  readonly asOf: string;
  readonly covenantDueAt?: string;
  readonly financialReportingDueAt?: string;
  readonly insuranceExpiresAt?: string;
  readonly priorRiskRating?: string;
  readonly currentRiskRating?: string;
  readonly priorBorrowingBase?: number;
  readonly currentBorrowingBase?: number;
  readonly evidenceIds: readonly string[];
}

export interface PortfolioMonitoringAlert {
  readonly type: 'covenant_due' | 'financials_due' | 'insurance_expiring' | 'risk_rating_change' | 'borrowing_base_decline';
  readonly summary: string;
  readonly evidenceIds: readonly string[];
  readonly requiresHumanReview: true;
}

export function derivePortfolioMonitoringAlerts(input: PortfolioMonitoringInput): readonly PortfolioMonitoringAlert[] {
  const alerts: PortfolioMonitoringAlert[] = [];
  const asOf = Date.parse(input.asOf);
  const due = (value: string | undefined) => value !== undefined && Date.parse(value) <= asOf;
  if (due(input.covenantDueAt)) alerts.push({ type: 'covenant_due', summary: 'A covenant review is due.', evidenceIds: input.evidenceIds, requiresHumanReview: true });
  if (due(input.financialReportingDueAt)) alerts.push({ type: 'financials_due', summary: 'Required financial reporting is due.', evidenceIds: input.evidenceIds, requiresHumanReview: true });
  if (due(input.insuranceExpiresAt)) alerts.push({ type: 'insurance_expiring', summary: 'Insurance has expired or reached its review date.', evidenceIds: input.evidenceIds, requiresHumanReview: true });
  if (input.priorRiskRating && input.currentRiskRating && input.priorRiskRating !== input.currentRiskRating) {
    alerts.push({ type: 'risk_rating_change', summary: `Recorded risk rating changed from ${input.priorRiskRating} to ${input.currentRiskRating}.`, evidenceIds: input.evidenceIds, requiresHumanReview: true });
  }
  if (input.priorBorrowingBase && input.currentBorrowingBase !== undefined && input.currentBorrowingBase < input.priorBorrowingBase) {
    alerts.push({ type: 'borrowing_base_decline', summary: `Borrowing base declined by ${input.priorBorrowingBase - input.currentBorrowingBase}.`, evidenceIds: input.evidenceIds, requiresHumanReview: true });
  }
  return alerts;
}

/** Deterministic explanation of the stored result; never recomputes or changes it. */
export function explainGovernanceEvaluation(evaluation: GovernanceEvaluation): readonly string[] {
  const lines = [
    `The authoritative governance decision is ${evaluation.decision}.`,
    `Policy ${evaluation.policyId ?? 'unresolved'} version ${evaluation.policyVersion ?? 'unresolved'} was evaluated for ${evaluation.action}.`,
  ];
  for (const finding of evaluation.findings) lines.push(`${finding.code}: ${finding.message}`);
  if (evaluation.findings.length === 0) lines.push('All requirements in the matched policy rules were satisfied.');
  return lines;
}

export function summarizePolicyComparison(comparison: PolicyComparison): readonly string[] {
  return [
    ...comparison.weakerControls.map((item) => `WEAKER: ${item}`),
    ...comparison.strongerControls.map((item) => `STRONGER: ${item}`),
    ...comparison.neutralChanges.map((item) => `NEUTRAL: ${item}`),
  ];
}
