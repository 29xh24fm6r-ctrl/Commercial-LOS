import { Cr664_creditmemo1sService } from '../generated/services/Cr664_creditmemo1sService';
import { Cr664_creditmemodraftsectionsService } from '../generated/services/Cr664_creditmemodraftsectionsService';

export type CreditMemoStatusKey = 'draft' | 'final' | 'stale';
export type CreditMemoReviewStatusKey = 'Pending' | 'Reviewed' | 'NeedsChanges';

/**
 * One top-level credit memo record (cr664_creditmemo1). A deal can
 * have multiple if memos are versioned; the latest by cr664_version
 * sorts first.
 */
export interface CreditMemoSummary {
  id: string;
  name: string;
  /** Display name from cr664_statusname (e.g. "Draft", "Final", "Stale"). */
  status: string | undefined;
  /** Stable key from cr664_status enum so the UI can color/sort consistently. */
  statusKey: CreditMemoStatusKey | undefined;
  memoType: string;
  version: number;
  generatedAt: string;
  modifiedOn: string | undefined;
  borrowerSafe: boolean;
  textPreview: string | undefined;
}

/**
 * One section draft (cr664_creditmemodraftsection). These link directly
 * to the deal, not to a specific memo — they're per-deal section drafts
 * that AI generation produces and bankers review.
 */
export interface CreditMemoSectionItem {
  id: string;
  sectionKey: string;
  sectionLabel: string;
  reviewStatus: string | undefined;
  reviewStatusKey: CreditMemoReviewStatusKey | undefined;
  lastGeneratedAt: string | undefined;
  modifiedOn: string | undefined;
  textPreview: string | undefined;
}

export interface CreditMemoData {
  memos: CreditMemoSummary[];
  sections: CreditMemoSectionItem[];
}

const PREVIEW_MAX_CHARS = 240;

function preview(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= PREVIEW_MAX_CHARS) return trimmed;
  return trimmed.slice(0, PREVIEW_MAX_CHARS).trimEnd() + '…';
}

/** Turn "executive_summary" / "borrower-overview" / "BorrowerOverview"
 *  into "Executive Summary" / "Borrower Overview". Best-effort. */
function humanizeSectionKey(key: string): string {
  const spaced = key
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2');
  return spaced
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Load all existing credit memo records and section drafts for the
 * given deal. Caller must have already authorized read access to
 * dealId via loadDealForBanker — DealDataProvider only mounts after
 * BankerDealWorkspace is in its 'ready' state.
 *
 * Both queries fire in parallel and are scoped server-side by
 * _cr664_deal_value plus statecode=0 (Active). If either fails the
 * whole load rejects, so the caller's AsyncResult flips to 'failed'.
 */
export async function loadDealCreditMemo(dealId: string): Promise<CreditMemoData> {
  const dealFilter = `_cr664_deal_value eq ${dealId} and statecode eq 0`;

  const [memosResult, sectionsResult] = await Promise.all([
    Cr664_creditmemo1sService.getAll({
      filter: dealFilter,
      orderBy: ['cr664_version desc'],
    }),
    Cr664_creditmemodraftsectionsService.getAll({
      filter: dealFilter,
      orderBy: ['cr664_sectionkey asc'],
    }),
  ]);

  if (!memosResult.success) {
    throw new Error(memosResult.error?.message ?? 'Failed to load credit memos');
  }
  if (!sectionsResult.success) {
    throw new Error(sectionsResult.error?.message ?? 'Failed to load memo sections');
  }

  const memos: CreditMemoSummary[] = (memosResult.data ?? []).map((m) => ({
    id: m.cr664_creditmemo1id,
    name: m.cr664_memoname,
    status: m.cr664_statusname,
    statusKey: lookupStatusKey(m.cr664_status),
    memoType: m.cr664_memotype,
    version: m.cr664_version,
    generatedAt: m.cr664_generatedat,
    modifiedOn: m.modifiedon,
    borrowerSafe: m.cr664_borrowersafe === true,
    textPreview: preview(m.cr664_memotext),
  }));

  const sections: CreditMemoSectionItem[] = (sectionsResult.data ?? []).map((s) => ({
    id: s.cr664_creditmemodraftsectionid,
    sectionKey: s.cr664_sectionkey,
    sectionLabel: humanizeSectionKey(s.cr664_sectionkey),
    reviewStatus: s.cr664_reviewstatusname,
    reviewStatusKey: lookupReviewStatusKey(s.cr664_reviewstatus),
    lastGeneratedAt: s.cr664_lastgeneratedat,
    modifiedOn: s.modifiedon,
    textPreview: preview(s.cr664_drafttext),
  }));

  return { memos, sections };
}

// Generated enum keys are numeric strings/numbers; map back to the
// human-stable status name so the UI can branch on it.
const STATUS_MAP: Record<number, CreditMemoStatusKey> = {
  788190000: 'draft',
  788190001: 'final',
  788190002: 'stale',
};
function lookupStatusKey(v: unknown): CreditMemoStatusKey | undefined {
  if (typeof v === 'number') return STATUS_MAP[v];
  if (typeof v === 'string' && /^\d+$/.test(v)) return STATUS_MAP[Number(v)];
  return undefined;
}

const REVIEW_STATUS_MAP: Record<number, CreditMemoReviewStatusKey> = {
  788190000: 'Pending',
  788190001: 'Reviewed',
  788190002: 'NeedsChanges',
};
function lookupReviewStatusKey(v: unknown): CreditMemoReviewStatusKey | undefined {
  if (typeof v === 'number') return REVIEW_STATUS_MAP[v];
  if (typeof v === 'string' && /^\d+$/.test(v)) return REVIEW_STATUS_MAP[Number(v)];
  return undefined;
}
