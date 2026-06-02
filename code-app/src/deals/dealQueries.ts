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

/**
 * Read a Dataverse `@OData.Community.Display.V1.FormattedValue`
 * annotation off the raw retrieve response.
 *
 * Phase 122C — the auto-generated Power Apps SDK declares optional
 * `<attr>name` shadow fields on the model interface, but in practice
 * the live SDK does NOT populate them for choice / lookup columns
 * (operator's 2026-06-02 cockpit reported Client / Stage / Status /
 * Banker / Customer Type / Industry / Guarantor Structure all
 * missing even though Maker Portal showed them populated). The
 * formatted value Dataverse returns lives on the `@OData.Community.
 * Display.V1.FormattedValue`-suffixed key of the raw response. This
 * helper reads it directly.
 */
function getFormattedValue(
  deal: Record<string, unknown>,
  attributeName: string,
): string | undefined {
  const annotationKey = `${attributeName}@OData.Community.Display.V1.FormattedValue`;
  const value = deal[annotationKey];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * For lookup columns the formatted value annotation hangs off the
 * `_<lookup>_value` key, not the bare lookup name. e.g. the display
 * for cr664_StageReference arrives as
 *   _cr664_stagereference_value@OData.Community.Display.V1.FormattedValue
 */
function getLookupFormattedValue(
  deal: Record<string, unknown>,
  lookupLogicalName: string,
): string | undefined {
  return getFormattedValue(deal, `_${lookupLogicalName}_value`);
}

function mapDealDetail(
  deal: NonNullable<
    Awaited<ReturnType<typeof Cr664_loandealsService.get>>['data']
  >,
): DealDetail {
  // Annotated raw retrieve response — keys with `@` in them are
  // legal JS object property names and arrive verbatim from the
  // Web API when the SDK forwards them.
  const raw = deal as unknown as Record<string, unknown>;

  // Display-value resolution priority for every choice / lookup
  // column:
  //   1. `@OData.Community.Display.V1.FormattedValue` annotation
  //      — Dataverse's authoritative formatted text.
  //   2. SDK-projected `<attr>name` shadow field (legacy / backup;
  //      not populated in the operator's live env but kept so
  //      pre-existing fixtures and any future SDK upgrade still
  //      work).
  //   3. Last-resort fallbacks (e.g. owneridname when the custom
  //      cr664_AssignedBanker lookup is unset but the standard
  //      Dataverse Owner is set — common during the Phase 121 seed
  //      flow). Documented per field below.
  return {
    id: deal.cr664_loandealid,
    name: deal.cr664_dealname,

    // Client is a Lookup (cr664_Client → typically cr664_client
    // entity). Live env exposes the display via the lookup formatted
    // value; the legacy `cr664_clientname` shadow field is retained
    // for backward compatibility with the historical fixture.
    clientName:
      getLookupFormattedValue(raw, 'cr664_client') ?? deal.cr664_clientname,

    // Stage lookup (cr664_StageReference). Operator's deal points at
    // "TEST · Stage Phase 121" — that name comes through the lookup
    // formatted value annotation.
    stage:
      getLookupFormattedValue(raw, 'cr664_stagereference') ??
      deal.cr664_stagereferencename,

    // Status: primary source is the custom cr664_StatusReference
    // lookup. If the operator hasn't pointed that lookup at a value
    // but the standard Dataverse statuscode is populated (the "Active"
    // label most live deals show), fall back to it.
    status:
      getLookupFormattedValue(raw, 'cr664_statusreference') ??
      deal.cr664_statusreferencename ??
      getFormattedValue(raw, 'statuscode') ??
      deal.statuscodename,

    amount: deal.cr664_amount,

    // Banker: primary source is cr664_AssignedBanker lookup. During
    // the Phase 121 seed flow the operator often sets only the
    // standard Dataverse Owner (`owneridname` = "Matthew Paller"),
    // which is a legitimate identity. Fall back to it.
    bankerName:
      getLookupFormattedValue(raw, 'cr664_assignedbanker') ??
      deal.cr664_assignedbankername ??
      deal.owneridname,

    targetCloseDate: deal.cr664_targetclosedate,

    // Product Type / Loan Structure / Pricing Type are reference
    // lookups that the operator legitimately leaves blank early in
    // a deal's life. No additional fallback — these stay missing
    // until a Maker Portal user populates the lookup. The cockpit's
    // "missing fields" chip is the correct nudge.
    productType:
      getLookupFormattedValue(raw, 'cr664_producttypereference') ??
      deal.cr664_producttypereferencename,
    loanStructure:
      getLookupFormattedValue(raw, 'cr664_loanstructuretypereference') ??
      deal.cr664_loanstructuretypereferencename,

    // Customer Type / Industry / Guarantor Structure are CHOICE
    // (option-set) columns. The choice integer lives on
    // cr664_customertype etc.; the human-facing label arrives via
    // the formatted-value annotation on the SAME attribute (no
    // `_value` indirection — that's only for lookups). The SDK does
    // NOT auto-populate the `<attr>name` shadow for choices in the
    // operator's live env, so the formatted-value path is the
    // authoritative source.
    customerType:
      getFormattedValue(raw, 'cr664_customertype') ?? deal.cr664_customertypename,
    industry:
      getFormattedValue(raw, 'cr664_industry') ?? deal.cr664_industryname,
    guarantorStructure:
      getFormattedValue(raw, 'cr664_guarantorstructure') ??
      deal.cr664_guarantorstructurename,

    pricingType:
      getLookupFormattedValue(raw, 'cr664_pricingtypereference') ??
      deal.cr664_pricingtypereferencename,
    spreadIndex:
      getLookupFormattedValue(raw, 'cr664_spreadindexreference') ??
      deal.cr664_spreadindexreferencename,
    spreadMargin: deal.cr664_spreadmargin,

    // Collateral Summary is a plain long-text column. No annotation
    // indirection needed.
    collateralSummary: deal.cr664_collateralsummary,
    createdOn: deal.createdon,

    stageEntryDate: deal.cr664_stageentrydate,
    isClosed:
      deal.cr664_closedflag === true ||
      deal.cr664_isterminalstatus === true ||
      deal.statecode === 1,
  };
}
