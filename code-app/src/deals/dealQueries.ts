import { Cr664_loandealsService } from '../generated/services/Cr664_loandealsService';

export interface DealHeader {
  id: string;
  name: string;
  clientName: string | undefined;
  stage: string | undefined;
  status: string | undefined;
  amount: number | undefined;
  bankerName: string | undefined;
  targetCloseDate: string | undefined;
}

export type DealLoadResult =
  | { kind: 'ready'; deal: DealHeader }
  | { kind: 'denied' }
  | { kind: 'not-found' }
  | { kind: 'failed'; message: string };

interface HasStatus {
  status?: number;
}

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const status = (error as HasStatus).status;
  return status === 404;
}

/**
 * Load a deal and authorize for the current banker. The query first
 * retrieves the record (subject to Dataverse row-level read access),
 * then matches the assigned-banker FK against the caller's bankerId.
 *
 * Distinct results are intentional per phase-4 acceptance criteria:
 *   not-found != denied != failed
 *
 * Note: this does reveal "deal exists but you can't see it" vs "deal
 * does not exist". That's an internal-app trade-off we're choosing
 * here; tighten later if compliance requires uniform responses.
 */
export async function loadDealForBanker(
  dealId: string,
  bankerId: string,
): Promise<DealLoadResult> {
  const result = await Cr664_loandealsService.get(dealId);

  if (!result.success) {
    if (isNotFoundError(result.error)) return { kind: 'not-found' };
    const message = result.error?.message ?? 'Unknown error';
    return { kind: 'failed', message };
  }

  const deal = result.data;
  if (!deal) return { kind: 'not-found' };

  if (deal._cr664_assignedbanker_value !== bankerId) {
    return { kind: 'denied' };
  }

  return {
    kind: 'ready',
    deal: {
      id: deal.cr664_loandealid,
      name: deal.cr664_dealname,
      clientName: deal.cr664_clientname,
      stage: deal.cr664_stagereferencename,
      status: deal.cr664_statusreferencename,
      amount: deal.cr664_amount,
      bankerName: deal.cr664_assignedbankername,
      targetCloseDate: deal.cr664_targetclosedate,
    },
  };
}
