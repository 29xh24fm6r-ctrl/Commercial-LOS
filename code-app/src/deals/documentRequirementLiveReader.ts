/**
 * Live read path for the Document Requirement Workspace — loads every
 * cr664_documentchecklist row already on the deal, derives the currently-
 * applicable requirements from the deal's own attributes
 * (documentRequirementDerivation.ts), and reconciles the two
 * (documentRequirementReconciliation.ts) into the single row list the
 * workspace UI renders. Dynamic-import only (SDK-free static graph), same
 * convention as every other *LiveDeps/*LiveReader module in this family.
 */

import { deriveRequiredDocuments, type DocumentRequirementDerivationInput } from './documentRequirementDerivation';
import {
  reconcileDocumentRequirements,
  type LiveDocumentChecklistRow,
} from './documentRequirementReconciliation';
import { requirementStatusFromCode } from './documentRequirementActions';
import type { DocumentRequirementRow } from './documentRequirementLifecycle';
import type { DocumentRequirementFields } from './documentRequirementFields';

export type DocumentRequirementLoadResult =
  | { readonly kind: 'ready'; readonly rows: readonly DocumentRequirementRow[] }
  | { readonly kind: 'failed'; readonly message: string };

interface RawChecklistRow extends DocumentRequirementFields {
  readonly cr664_documentchecklistid: string;
  readonly cr664_documentname?: string;
  readonly cr664_requestdate?: string;
  readonly cr664_receiveddate?: string;
  readonly cr664_reviewer?: string;
  readonly cr664_duedate?: string;
}

function toLiveRow(raw: RawChecklistRow): LiveDocumentChecklistRow {
  return {
    id: raw.cr664_documentchecklistid,
    documentName: raw.cr664_documentname ?? '',
    requirementStatus: requirementStatusFromCode(raw.cr664_requirementstatus),
    required: raw.cr664_required,
    acknowledged: raw.cr664_acknowledged,
    acknowledgedBy: raw._cr664_acknowledgedby_value,
    acknowledgedDate: raw.cr664_acknowledgeddate,
    requestedDate: raw.cr664_requestdate,
    receivedDate: raw.cr664_receiveddate,
    reviewedDate: raw.cr664_revieweddate,
    reviewer: raw.cr664_reviewer,
    waived: raw.cr664_waived,
    waiverReason: raw.cr664_waiverreason,
    dueDate: raw.cr664_duedate,
  };
}

export async function loadDocumentRequirements(input: {
  dealId: string;
  deal: DocumentRequirementDerivationInput;
}): Promise<DocumentRequirementLoadResult> {
  try {
    const { Cr664_documentchecklistsService } = await import(
      '../generated/services/Cr664_documentchecklistsService'
    );
    const res = await Cr664_documentchecklistsService.getAll({
      filter: `_cr664_deal_value eq ${input.dealId} and statecode eq 0`,
    });
    if (!res.success) {
      return { kind: 'failed', message: res.error?.message ?? 'Could not load document requirements.' };
    }
    const liveRows = ((res.data ?? []) as unknown as RawChecklistRow[]).map(toLiveRow);
    const derived = deriveRequiredDocuments(input.deal);
    const rows = reconcileDocumentRequirements(derived, liveRows);
    return { kind: 'ready', rows };
  } catch (err: unknown) {
    return { kind: 'failed', message: err instanceof Error ? err.message : String(err) };
  }
}
