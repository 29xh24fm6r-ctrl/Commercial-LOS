import { describe, expect, it } from 'vitest';
import { deriveUnderwritingIntakeReadiness, type IntakeRequirementEvidence } from './documentIntakeReadiness';
import { deriveCoreUnderwritingRequirements } from './documentIntakeRequirements';

const definitions = deriveCoreUnderwritingRequirements(2026);
const stored = (key: string): IntakeRequirementEvidence => ({ requirementKey: key, dealId: 'd1', applicable: true, uploadStatus: 'SHAREPOINT_STORED', storageProvider: 'SHAREPOINT', fileUrl: `https://sp/${key}`, fileItemId: key, fileDealId: 'd1', reviewAccepted: true, exceptionDecision: 'NONE' });
const derive = (evidence: readonly IntakeRequirementEvidence[], folderReady = true) => deriveUnderwritingIntakeReadiness({ dealId: 'd1', folderReady, requirementDerivationComplete: true, definitions, evidence });

describe('underwriting intake readiness', () => {
  it('reports not started with zero evidence and in progress for partial collection', () => {
    expect(derive([]).status).toBe('NOT_STARTED');
    expect(derive([stored(definitions[0].key)]).status).toBe('IN_PROGRESS');
  });
  it('requires verified SharePoint evidence for every applicable row', () => {
    expect(derive(definitions.map((row) => stored(row.key))).status).toBe('READY_FOR_UNDERWRITING');
    const legacy = definitions.map((row) => stored(row.key)); legacy[0] = { ...legacy[0], storageProvider: 'DATAVERSE_FILE_LEGACY' };
    expect(derive(legacy).status).toBe('IN_PROGRESS');
  });
  it('distinguishes approved and pending exceptions', () => {
    const evidence = definitions.map((row) => stored(row.key));
    evidence[0] = { ...evidence[0], uploadStatus: 'NOT_UPLOADED', storageProvider: undefined, fileUrl: undefined, fileItemId: undefined, exceptionDecision: 'APPROVED' };
    expect(derive(evidence).status).toBe('READY_WITH_APPROVED_EXCEPTIONS');
    evidence[0] = { ...evidence[0], exceptionDecision: 'PENDING' };
    expect(derive(evidence).status).toBe('IN_PROGRESS');
  });
  it('blocks invalid folder and cross-deal references', () => {
    expect(derive(definitions.map((row) => stored(row.key)), false).status).toBe('BLOCKED');
    const evidence = definitions.map((row) => stored(row.key)); evidence[0] = { ...evidence[0], fileDealId: 'other' };
    expect(derive(evidence).status).toBe('BLOCKED');
  });
  it.each(['UPLOAD_PENDING', 'UPLOAD_FAILED', 'STORAGE_REFERENCE_INVALID'] as const)('fails closed for %s', (uploadStatus) => {
    const evidence = definitions.map((row) => stored(row.key)); evidence[0] = { ...evidence[0], uploadStatus };
    expect(derive(evidence).status).toBe('BLOCKED');
  });
});
