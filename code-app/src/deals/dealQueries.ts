import { Cr664_loandealsService } from '../generated/services/Cr664_loandealsService';
import type { CrmEdgeLookupClassification } from '../crm/crmRelationshipViewModel';

/**
 * Where the deal's client display/completeness value comes from:
 *   - `crm-client-relationship` — a VERIFIED cr664_Client lookup to a
 *     cr664_clientrelationship (the governed link path). This is authoritative.
 *   - `deal-client-name` — only the legacy free-text cr664_clientname is set
 *     (no verified lookup).
 *   - `missing` — neither is set.
 * A contact-only CRM record or an unbridged CRM organization never sets the
 * cr664_Client lookup, so it can never resolve to `crm-client-relationship`.
 */
export type DealClientSource = 'crm-client-relationship' | 'deal-client-name' | 'missing';

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

  // Factory Arc Phase 3 — the PR105-provisioned columns (cr664_loanpurpose /
  // cr664_loantermmonths / cr664_ownershipstructure). Read via the raw retrieve
  // row (see mapDealDetail) since the generated Cr664_loandealsModel.ts does not
  // declare them yet, pending the operator-run `pac code` regeneration Phase 2
  // escalated (docs/factory-arc/PR114_LOAN_DEAL_SDK_REGENERATION_ESCALATION.md).
  // Optional for the same reason as the Phase 189D fields below: existing
  // hand-built DealDetail fixtures across the test suite predate this phase and
  // should keep compiling without edits. `mapDealDetail` always sets all three.
  loanPurpose?: string | undefined;
  loanTermMonths?: number | undefined;
  ownershipStructure?: string | undefined;

  // Blocker-derivation inputs (rendered in <DealBlockers />)
  stageEntryDate: string | undefined;
  isClosed: boolean;

  // Phase 189D — CRM relationship enrichment. These come off the SAME
  // already-authorized retrieve (no second Dataverse GET): real lookup ids +
  // a classification so the read-only CRM panel can use real GUIDs instead of
  // a name surrogate. `clientName` (above) remains the display label.
  //
  // Optional on the interface ONLY so the many existing hand-built DealDetail
  // test fixtures keep compiling without edits (Phase 189D touches no fixture
  // outside its scope). `mapDealDetail` — the single real producer, used by
  // every loadDealFor* path — ALWAYS sets all seven, so the authorized runtime
  // row carries definite values.
  clientId?: string | undefined;
  clientLookupClassification?: CrmEdgeLookupClassification;
  /**
   * Client display name projected with the verified cr664_Client lookup taking
   * priority over any stale explicit cr664_clientname. Equal to `clientName`
   * today; kept as a distinct field so surfaces + completeness can reason about
   * the SOURCE, not just the string. Always set by `mapDealDetail`.
   */
  effectiveClientName?: string | undefined;
  /** Where `effectiveClientName` came from. Always set by `mapDealDetail`. */
  effectiveClientSource?: DealClientSource;
  teamId?: string | undefined;
  teamName?: string | undefined;
  teamLookupClassification?: CrmEdgeLookupClassification;
  assignedBankerId?: string | undefined;
  assignedBankerLookupClassification?: CrmEdgeLookupClassification;
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

  // Phase 189D — CRM relationship enrichment off the SAME retrieve. A real
  // `_<lookup>_value` GUID classifies the edge as a real lookup; a display
  // label without a GUID is `unknown` (we have a name but no verified lookup);
  // nothing at all is `missing`.
  const clientId = deal._cr664_client_value;
  // A verified cr664_Client lookup (a real GUID) is authoritative; its formatted
  // value is the linked cr664_clientrelationship's name. The legacy free-text
  // cr664_clientname is a fallback only. The lookup name WINS over a stale
  // explicit name.
  const lookupClientName = getLookupFormattedValue(raw, 'cr664_client');
  const explicitClientName = deal.cr664_clientname;
  const clientLabel = lookupClientName ?? explicitClientName;
  const clientLookupClassification: CrmEdgeLookupClassification = clientId
    ? 'real-lookup'
    : clientLabel
      ? 'unknown'
      : 'missing';
  const effectiveClientSource: DealClientSource = clientId
    ? 'crm-client-relationship'
    : explicitClientName
      ? 'deal-client-name'
      : 'missing';
  const effectiveClientName =
    effectiveClientSource === 'crm-client-relationship'
      ? (lookupClientName ?? explicitClientName)
      : effectiveClientSource === 'deal-client-name'
        ? explicitClientName
        : undefined;

  const teamId = deal._cr664_team_value;
  const teamName = getLookupFormattedValue(raw, 'cr664_team') ?? deal.cr664_teamname;
  const teamLookupClassification: CrmEdgeLookupClassification = teamId
    ? 'real-lookup'
    : 'missing';

  const assignedBankerId = deal._cr664_assignedbanker_value;
  const assignedBankerLabel =
    getLookupFormattedValue(raw, 'cr664_assignedbanker') ??
    deal.cr664_assignedbankername ??
    deal.owneridname;
  const assignedBankerLookupClassification: CrmEdgeLookupClassification =
    assignedBankerId ? 'real-lookup' : assignedBankerLabel ? 'unknown' : 'missing';

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

    // Client is a Lookup (cr664_Client → cr664_clientrelationship). The
    // verified lookup's formatted value wins over the legacy free-text
    // cr664_clientname. `clientName` mirrors `effectiveClientName` for the many
    // downstream surfaces that already read `clientName`.
    clientName: effectiveClientName,

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

    // Factory Arc Phase 3 — plain String/Integer columns not yet declared on
    // the generated model (see the DealDetail field comments above), so read
    // via the raw retrieve row rather than the typed `deal` accessor.
    loanPurpose: raw['cr664_loanpurpose'] as string | undefined,
    loanTermMonths: raw['cr664_loantermmonths'] as number | undefined,
    ownershipStructure: raw['cr664_ownershipstructure'] as string | undefined,

    stageEntryDate: deal.cr664_stageentrydate,
    isClosed:
      deal.cr664_closedflag === true ||
      deal.cr664_isterminalstatus === true ||
      deal.statecode === 1,

    // Phase 189D — CRM relationship enrichment (same retrieve, no new GET).
    clientId,
    clientLookupClassification,
    effectiveClientName,
    effectiveClientSource,
    teamId,
    teamName,
    teamLookupClassification,
    assignedBankerId,
    assignedBankerLookupClassification,
  };
}
