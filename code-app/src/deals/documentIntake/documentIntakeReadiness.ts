import type { IntakeRequirementDefinition } from './documentIntakeRequirements';

export type UnderwritingIntakeStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'READY_FOR_UNDERWRITING' | 'READY_WITH_APPROVED_EXCEPTIONS' | 'BLOCKED' | 'CONFIGURATION_REQUIRED';
export type ExceptionDecision = 'NONE' | 'PENDING' | 'APPROVED' | 'DENIED' | 'REVOKED' | 'EXPIRED';

export interface IntakeRequirementEvidence {
  readonly requirementKey: string;
  readonly dealId: string;
  readonly applicable: true | false | 'UNRESOLVED';
  readonly uploadStatus: 'NOT_UPLOADED' | 'UPLOAD_PENDING' | 'SHAREPOINT_STORED' | 'UPLOAD_FAILED' | 'REPLACED' | 'REMOVED_BY_GOVERNED_ACTION' | 'STORAGE_REFERENCE_INVALID';
  readonly storageProvider?: 'SHAREPOINT' | 'DATAVERSE_FILE_LEGACY';
  readonly fileUrl?: string;
  readonly fileItemId?: string;
  readonly fileDealId?: string;
  readonly reviewAccepted?: boolean;
  readonly exceptionDecision: ExceptionDecision;
}

export interface UnderwritingIntakeReadiness {
  readonly status: UnderwritingIntakeStatus;
  readonly totalApplicable: number;
  readonly received: number;
  readonly pendingReview: number;
  readonly outstanding: number;
  readonly approvedExceptions: number;
  readonly blockers: readonly string[];
}

function verifiedFile(row: IntakeRequirementEvidence, dealId: string): boolean {
  return row.storageProvider === 'SHAREPOINT' && row.uploadStatus === 'SHAREPOINT_STORED' && Boolean(row.fileUrl) && Boolean(row.fileItemId) && row.fileDealId === dealId;
}

function storageBlocker(row: IntakeRequirementEvidence, dealId: string): string | undefined {
  if (row.uploadStatus === 'UPLOAD_PENDING') return 'upload is pending and has no durable verified result';
  if (row.uploadStatus === 'UPLOAD_FAILED') return 'the SharePoint upload failed';
  if (row.uploadStatus === 'STORAGE_REFERENCE_INVALID') return 'the SharePoint storage reference is invalid';
  if (row.fileDealId && row.fileDealId !== dealId) return 'the file reference belongs to a different deal';
  if (row.uploadStatus === 'SHAREPOINT_STORED' && (!row.fileUrl || !row.fileItemId)) return 'the stored file is missing its durable SharePoint identity';
  return undefined;
}

export function deriveUnderwritingIntakeReadiness(input: {
  readonly dealId: string;
  readonly folderReady: boolean;
  readonly requirementDerivationComplete: boolean;
  readonly definitions: readonly IntakeRequirementDefinition[];
  readonly evidence: readonly IntakeRequirementEvidence[];
}): UnderwritingIntakeReadiness {
  if (!input.requirementDerivationComplete || !input.definitions.length) return { status: 'CONFIGURATION_REQUIRED', totalApplicable: 0, received: 0, pendingReview: 0, outstanding: input.definitions.length, approvedExceptions: 0, blockers: ['Requirement applicability could not be derived from authoritative deal facts.'] };
  const byKey = new Map(input.evidence.map((row) => [row.requirementKey, row]));
  const blockers: string[] = [];
  let totalApplicable = 0, received = 0, pendingReview = 0, outstanding = 0, approvedExceptions = 0;
  for (const definition of input.definitions) {
    const row = byKey.get(definition.key);
    if (!row) { outstanding++; blockers.push(`${definition.documentName}: no verified active SharePoint file.`); continue; }
    if (row.applicable === 'UNRESOLVED') { outstanding++; blockers.push(`${definition.documentName}: applicability unresolved.`); continue; }
    if (!row.applicable) continue;
    totalApplicable++;
    if (row.exceptionDecision === 'APPROVED') { approvedExceptions++; continue; }
    if (row.exceptionDecision !== 'NONE') { outstanding++; blockers.push(`${definition.documentName}: exception is ${row.exceptionDecision.toLowerCase()}.`); continue; }
    if (!verifiedFile(row, input.dealId)) {
      outstanding++;
      const unsafeStorageState = storageBlocker(row, input.dealId);
      blockers.push(`${definition.documentName}: ${unsafeStorageState ?? 'no verified active SharePoint file.'}`);
      continue;
    }
    received++;
    if (definition.reviewLevel === 'reviewed' && !row.reviewAccepted) pendingReview++;
  }
  if (!input.folderReady) blockers.unshift('The persisted SharePoint loan folder is not verified.');
  const anyActivity = input.evidence.some((row) => row.uploadStatus !== 'NOT_UPLOADED' || row.exceptionDecision !== 'NONE');
  let status: UnderwritingIntakeStatus;
  if (!anyActivity && outstanding > 0) status = 'NOT_STARTED';
  else if (!input.folderReady || blockers.some((value) => /invalid|unresolved|different deal|upload (?:is pending|failed)|missing its durable/i.test(value))) status = 'BLOCKED';
  else if (outstanding > 0) status = 'IN_PROGRESS';
  else status = approvedExceptions > 0 ? 'READY_WITH_APPROVED_EXCEPTIONS' : 'READY_FOR_UNDERWRITING';
  return { status, totalApplicable, received, pendingReview, outstanding, approvedExceptions, blockers };
}
