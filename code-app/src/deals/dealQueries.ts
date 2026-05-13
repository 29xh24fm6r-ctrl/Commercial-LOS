import { Cr664_loandealsService } from '../generated/services/Cr664_loandealsService';

/**
 * Parsed, UI-facing shape of one cr664_loandeal record. Only fields that
 * actually exist on Cr664_loandeals (see ../generated/models/Cr664_loandealsModel.ts)
 * are included here.
 */
export interface DealDetail {
  // Header fields (rendered in <DealHeader />)
  id: string;
  name: string;
  clientName: string | undefined;
  stage: string | undefined;
  status: string | undefined;
  amount: number | undefined;
  bankerName: string | undefined;
  targetCloseDate: string | undefined;

  // Summary fields (rendered in <DealSummary />)
  productType: string | undefined;
  loanStructure: string | undefined;
  customerType: string | undefined;
  industry: string | undefined;
  guarantorStructure: string | undefined;
  pricingType: string | undefined;
  spreadIndex: string | undefined;
  spreadMargin: number | undefined;
  collateralSummary: string | undefined;
  createdOn: string | undefined;

  // Blocker-derivation inputs (rendered in <DealBlockers />)
  stageEntryDate: string | undefined;
  isClosed: boolean;
}

export type DealLoadResult =
  | { kind: 'ready'; deal: DealDetail }
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

  return { kind: 'ready', deal: mapDealDetail(deal) };
}

/**
 * Phase 36: manager-team-scoped deal authorization. Mirrors
 * loadDealForBanker but matches the deal's _cr664_team_value
 * against the caller's authorized teamId. Used by
 * ManagerDealWorkspace under the /deals/:id manager branch.
 * The manager surface stays read-only; this function only
 * authorizes — it does not gate any write.
 */
export async function loadDealForManager(
  dealId: string,
  teamId: string,
): Promise<DealLoadResult> {
  return loadDealByTeamMatch(dealId, teamId);
}

/**
 * Phase 37: team-scoped deal authorization. Same team-match rule
 * as loadDealForManager today — both surfaces gate on the deal's
 * _cr664_team_value matching the caller's authorized teamId. The
 * two functions are kept distinct on purpose: their authorization
 * boundaries are conceptually different (manager oversight vs
 * shared-team operating visibility) and may diverge in a later
 * phase (e.g. if team members get a tighter "deals you touch"
 * scope). The shared loadDealByTeamMatch helper keeps the schema
 * predicate in lockstep until that day.
 */
export async function loadDealForTeam(
  dealId: string,
  teamId: string,
): Promise<DealLoadResult> {
  return loadDealByTeamMatch(dealId, teamId);
}

async function loadDealByTeamMatch(
  dealId: string,
  teamId: string,
): Promise<DealLoadResult> {
  const result = await Cr664_loandealsService.get(dealId);

  if (!result.success) {
    if (isNotFoundError(result.error)) return { kind: 'not-found' };
    const message = result.error?.message ?? 'Unknown error';
    return { kind: 'failed', message };
  }

  const deal = result.data;
  if (!deal) return { kind: 'not-found' };

  if (deal._cr664_team_value !== teamId) {
    return { kind: 'denied' };
  }

  return { kind: 'ready', deal: mapDealDetail(deal) };
}

function mapDealDetail(
  deal: NonNullable<
    Awaited<ReturnType<typeof Cr664_loandealsService.get>>['data']
  >,
): DealDetail {
  return {
    id: deal.cr664_loandealid,
    name: deal.cr664_dealname,
    clientName: deal.cr664_clientname,
    stage: deal.cr664_stagereferencename,
    status: deal.cr664_statusreferencename,
    amount: deal.cr664_amount,
    bankerName: deal.cr664_assignedbankername,
    targetCloseDate: deal.cr664_targetclosedate,

    productType: deal.cr664_producttypereferencename,
    loanStructure: deal.cr664_loanstructuretypereferencename,
    customerType: deal.cr664_customertypename,
    industry: deal.cr664_industryname,
    guarantorStructure: deal.cr664_guarantorstructurename,
    pricingType: deal.cr664_pricingtypereferencename,
    spreadIndex: deal.cr664_spreadindexreferencename,
    spreadMargin: deal.cr664_spreadmargin,
    collateralSummary: deal.cr664_collateralsummary,
    createdOn: deal.createdon,

    stageEntryDate: deal.cr664_stageentrydate,
    isClosed:
      deal.cr664_closedflag === true ||
      deal.cr664_isterminalstatus === true ||
      deal.statecode === 1,
  };
}
