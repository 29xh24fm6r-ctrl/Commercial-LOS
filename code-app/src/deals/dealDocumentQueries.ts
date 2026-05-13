import { Cr664_documentchecklistsService } from '../generated/services/Cr664_documentchecklistsService';

export type DocumentStatus = 'outstanding' | 'received' | 'reviewed';

/**
 * Parsed shape of one cr664_documentchecklist row. Every cr664_*
 * identifier here is present on Cr664_documentchecklists
 * (see ../generated/models/Cr664_documentchecklistsModel.ts).
 *
 * Note: cr664_documenttype is the *file format* enum (PDF/Word/Excel/
 * Image), not a document category. We do not surface it here to avoid
 * being confused with the document's business type.
 */
export interface DealDocument {
  id: string;
  name: string;
  dueDate: string | undefined;
  requestDate: string | undefined;
  receivedDate: string | undefined;
  reviewer: string | undefined;
  uploaded: boolean;
  modifiedOn: string | undefined;
  status: DocumentStatus;
}

export interface DealDocumentsResult {
  outstanding: DealDocument[];
  received: DealDocument[];
  reviewed: DealDocument[];
}

/**
 * Bucket the document into one of three states, derived only from
 * fields actually on cr664_documentchecklist:
 *   reviewed   = cr664_reviewer is non-empty
 *   received   = cr664_receiveddate set OR cr664_uploadstatus === true
 *                (but no reviewer yet)
 *   outstanding = neither received nor reviewed
 */
function deriveStatus(opts: {
  reviewer: string | undefined;
  receivedDate: string | undefined;
  uploaded: boolean;
}): DocumentStatus {
  if (opts.reviewer && opts.reviewer.trim().length > 0) return 'reviewed';
  if (opts.receivedDate || opts.uploaded) return 'received';
  return 'outstanding';
}

/**
 * Load all active document-checklist rows for the given deal. Caller
 * must have already authorized read access to dealId via
 * loadDealForBanker — DealDocuments.tsx only mounts after
 * BankerDealWorkspace is in its 'ready' state.
 */
export async function loadDealDocuments(dealId: string): Promise<DealDocumentsResult> {
  const result = await Cr664_documentchecklistsService.getAll({
    filter: `_cr664_deal_value eq ${dealId} and statecode eq 0`,
    orderBy: ['cr664_duedate asc'],
  });

  if (!result.success) {
    const message = result.error?.message ?? 'Unknown error';
    throw new Error(message);
  }

  const all = (result.data ?? []).map((d): DealDocument => {
    const uploaded = d.cr664_uploadstatus === true;
    const status = deriveStatus({
      reviewer: d.cr664_reviewer,
      receivedDate: d.cr664_receiveddate,
      uploaded,
    });
    return {
      id: d.cr664_documentchecklistid,
      name: d.cr664_documentname,
      dueDate: d.cr664_duedate,
      requestDate: d.cr664_requestdate,
      receivedDate: d.cr664_receiveddate,
      reviewer: d.cr664_reviewer,
      uploaded,
      modifiedOn: d.modifiedon,
      status,
    };
  });

  const outstanding = all
    .filter((d) => d.status === 'outstanding')
    .sort((a, b) => compareIsoAsc(a.dueDate, b.dueDate));

  const received = all
    .filter((d) => d.status === 'received')
    .sort((a, b) => compareIsoDesc(a.receivedDate ?? a.modifiedOn, b.receivedDate ?? b.modifiedOn));

  const reviewed = all
    .filter((d) => d.status === 'reviewed')
    .sort((a, b) => compareIsoDesc(a.modifiedOn, b.modifiedOn));

  return { outstanding, received, reviewed };
}

function compareIsoAsc(a: string | undefined, b: string | undefined): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

function compareIsoDesc(a: string | undefined, b: string | undefined): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return b.localeCompare(a);
}
