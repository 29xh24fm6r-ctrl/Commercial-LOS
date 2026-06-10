/**
 * Phase 143D — CRM account/contact/opportunity sync PREVIEW plan (NO WRITES).
 *
 * PURE. Produces a preview-only plan of what a future sync WOULD do for
 * Salesforce/nCino account/contact/opportunity/task/activity/loan-workflow
 * objects. It never creates, updates, or links anything. Operations use
 * "would_*" verbs only. Every outcome keeps `previewOnly` true and
 * `liveWritePerformed` / `crmRecordCreated` / `crmRecordUpdated` /
 * `crmRecordLinked` / `externalSystemChanged` false. Conflicts block write items.
 */

export type CrmSyncEntity =
  | 'account'
  | 'contact'
  | 'opportunity'
  | 'task'
  | 'activity'
  | 'ncino_relationship'
  | 'ncino_loan'
  | 'ncino_document_checklist';

export type CrmSyncOperation = 'no_op' | 'would_create' | 'would_update' | 'would_link' | 'would_skip' | 'blocked';

export interface CrmSyncPreviewInput {
  dealId?: string;
  hasConflicts?: boolean;
  existingSalesforceAccount?: boolean;
  existingOpportunity?: boolean;
  existingNcinoRelationship?: boolean;
  existingNcinoLoan?: boolean;
  contactCount?: number;
  documentChecklistPresent?: boolean;
}

export interface CrmSyncPreviewRow {
  entity: CrmSyncEntity;
  operation: CrmSyncOperation;
  label: string;
  blocked: boolean;
}

export interface CrmSyncPreviewResult {
  dealId: string;
  rows: readonly CrmSyncPreviewRow[];
  wouldCreateCount: number;
  wouldUpdateCount: number;
  wouldLinkCount: number;
  blockedCount: number;
  warnings: readonly string[];
  previewOnly: true;
  liveWritePerformed: false;
  crmRecordCreated: false;
  crmRecordUpdated: false;
  crmRecordLinked: false;
  externalSystemChanged: false;
}

const OP_LABELS: Record<CrmSyncOperation, string> = {
  no_op: 'No change',
  would_create: 'Would create (preview only)',
  would_update: 'Would update (preview only)',
  would_link: 'Would link (preview only)',
  would_skip: 'Would skip (read-only reference)',
  blocked: 'Blocked by conflict (no write preview)',
};

function row(entity: CrmSyncEntity, operation: CrmSyncOperation): CrmSyncPreviewRow {
  return { entity, operation, label: `${entity.replace(/_/g, ' ')}: ${OP_LABELS[operation]}`, blocked: operation === 'blocked' };
}

export function deriveCrmSyncPreviewPlan(input: CrmSyncPreviewInput | null | undefined): CrmSyncPreviewResult {
  const dealId = (input?.dealId ?? '').trim();
  const warnings: string[] = ['Preview only — no Salesforce or nCino record is created, updated, or linked.'];

  if (!input || dealId.length === 0) {
    return {
      dealId, rows: [], wouldCreateCount: 0, wouldUpdateCount: 0, wouldLinkCount: 0, blockedCount: 0,
      warnings: ['No deal identity provided; no sync preview is generated.'],
      previewOnly: true, liveWritePerformed: false, crmRecordCreated: false, crmRecordUpdated: false, crmRecordLinked: false, externalSystemChanged: false,
    };
  }

  const conflict = input.hasConflicts === true;
  if (conflict) warnings.push('Conflicts present — all write-preview items are blocked.');

  const writeOp = (existing: boolean | undefined, createOp: CrmSyncOperation, existingOp: CrmSyncOperation): CrmSyncOperation =>
    conflict ? 'blocked' : existing ? existingOp : createOp;

  const rows: CrmSyncPreviewRow[] = [
    row('account', writeOp(input.existingSalesforceAccount, 'would_create', 'would_link')),
    row('contact', conflict ? 'blocked' : (input.contactCount ?? 0) > 0 ? 'would_create' : 'no_op'),
    row('opportunity', writeOp(input.existingOpportunity, 'would_create', 'would_update')),
    row('task', 'would_skip'),
    row('activity', 'would_skip'),
    row('ncino_relationship', writeOp(input.existingNcinoRelationship, 'would_create', 'would_link')),
    row('ncino_loan', writeOp(input.existingNcinoLoan, 'would_create', 'would_update')),
    row('ncino_document_checklist', conflict ? 'blocked' : input.documentChecklistPresent === true ? 'would_update' : 'no_op'),
  ];

  return {
    dealId,
    rows,
    wouldCreateCount: rows.filter((r) => r.operation === 'would_create').length,
    wouldUpdateCount: rows.filter((r) => r.operation === 'would_update').length,
    wouldLinkCount: rows.filter((r) => r.operation === 'would_link').length,
    blockedCount: rows.filter((r) => r.operation === 'blocked').length,
    warnings,
    previewOnly: true,
    liveWritePerformed: false,
    crmRecordCreated: false,
    crmRecordUpdated: false,
    crmRecordLinked: false,
    externalSystemChanged: false,
  };
}
