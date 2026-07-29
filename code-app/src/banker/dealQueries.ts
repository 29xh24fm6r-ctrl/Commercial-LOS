import { Cr664_loandealsService } from '../generated/services/Cr664_loandealsService';
import type { Cr664_loandeals } from '../generated/models/Cr664_loandealsModel';
import { operationalDeals, isTestOrSmokeDeal } from '../shared/deals/testDealClassification';
import { ACTIVE_DEAL_ODATA_PREDICATE } from '../shared/deals/dealVisibilityScopes';

export interface PipelineDeal {
  id: string;
  name: string;
  clientName: string | undefined;
  stage: string | undefined;
  status: string | undefined;
  /**
   * True when the deal is classified as a test/smoke record — the governed
   * cr664_istestrecord column when an admin has explicitly set it (N-17,
   * Production Remediation Factory Arc Phase 11), falling back to the
   * controlled test/smoke naming convention when unset (see
   * testDealClassification.ts). Populated by loadBankerPipeline/toPipelineDeal
   * for every real read — optional here only so hand-built PipelineDeal
   * fixtures elsewhere (which represent ordinary, non-test deals) don't all
   * need updating; omitted is treated as false everywhere it's read. Any
   * caller that opts in to seeing test records (includeTestDeals: true) can
   * use this to label them instead of silently mixing them into an
   * unlabeled operational list.
   */
  isTestRecord?: boolean;
  amount: number | undefined;
  targetCloseDate: string | undefined;
  lastActivityOn: string | undefined;
  /** Dataverse system createdon — used by the Loan Workflow workbench to
   *  surface "Recently Created" deals (e.g. a deal just made via + New Deal). */
  createdOn?: string | undefined;
  /** When the deal entered its current stage. Used by Phase-32 work
   *  queue to flag stale-stage at-risk signals. */
  stageEntryDate: string | undefined;
  /** True when the deal is terminal (closed-won / closed-lost) or
   *  Dataverse statecode = Inactive. */
  isClosed: boolean;
  /** Phase 95: read-only collateral summary projected from
   *  cr664_collateralsummary. Surfaced on the pipeline projection so
   *  the Phase 73 deterministic consistency check can run on the
   *  banker autopilot rollup and morning-catch-up surfaces (it
   *  compares memo draft text against the collateral summary field).
   *  No new screen renders this on the pipeline list — it is only
   *  forwarded into the rollup derivation. */
  collateralSummary: string | undefined;
}

/**
 * Read a Dataverse `@OData.Community.Display.V1.FormattedValue`
 * annotation off the raw record. Mirrors the deal-detail loader
 * (src/deals/dealQueries.ts, Phase 122C) and the team/manager query
 * hydration (Phase 125B): the auto-generated SDK declares optional
 * `<attr>name` shadow fields but does NOT populate them for lookup
 * columns in the live env. The authoritative display text lives on the
 * `@OData.Community.Display.V1.FormattedValue`-suffixed key.
 */
function getFormattedValue(
  record: Record<string, unknown>,
  attributeName: string,
): string | undefined {
  const annotationKey = `${attributeName}@OData.Community.Display.V1.FormattedValue`;
  const value = record[annotationKey];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * For lookup columns the formatted value hangs off the `_<lookup>_value`
 * key, e.g. cr664_StageReference arrives as
 *   _cr664_stagereference_value@OData.Community.Display.V1.FormattedValue
 */
function getLookupFormattedValue(
  record: Record<string, unknown>,
  lookupLogicalName: string,
): string | undefined {
  return getFormattedValue(record, `_${lookupLogicalName}_value`);
}

function toPipelineDeal(d: Cr664_loandeals): PipelineDeal {
  // Annotated raw response — `@`-suffixed keys arrive verbatim from the
  // Web API and are legal JS property names.
  const raw = d as unknown as Record<string, unknown>;
  return {
    id: d.cr664_loandealid,
    name: d.cr664_dealname,
    // Production GO live retest — use the regenerated governed Boolean directly.
    // Before the SDK regeneration the app could not see true flags on records whose
    // names lacked a controlled marker, so they contaminated operational totals.
    isTestRecord: isTestOrSmokeDeal({
      name: d.cr664_dealname,
      isTestRecord: d.cr664_istestrecord,
    }),
    clientName: d.cr664_clientname,
    // Phase 170L — formatted-value-first hydration parity with the deal
    // detail / team / manager read models. Deals created via the
    // cr664_StageReference / cr664_StatusReference lookups (e.g. the Phase
    // 170K smoke deal) surface their label through the lookup formatted
    // value, NOT the legacy cr664_stagereferencename shadow field (which
    // the live SDK leaves unpopulated). Fall back to the shadow field, then
    // the standard statuscode label for status, so legacy/test fixtures and
    // a future SDK upgrade still work. A truly unset stage/status stays
    // undefined here so the honest missing-stage signal still fires.
    stage:
      getLookupFormattedValue(raw, 'cr664_stagereference') ??
      d.cr664_stagereferencename,
    status:
      getLookupFormattedValue(raw, 'cr664_statusreference') ??
      d.cr664_statusreferencename ??
      getFormattedValue(raw, 'statuscode') ??
      d.statuscodename,
    amount: d.cr664_amount,
    targetCloseDate: d.cr664_targetclosedate,
    lastActivityOn: d.modifiedon,
    createdOn: d.createdon,
    stageEntryDate: d.cr664_stageentrydate,
    isClosed:
      d.cr664_closedflag === true ||
      d.cr664_isterminalstatus === true ||
      d.statecode === 1,
    collateralSummary: d.cr664_collateralsummary,
  };
}

export interface LoadBankerPipelineOptions {
  /**
   * P1-11 — include classified TEST/SMOKE deals. Default false: the normal banker pipeline (and
   * every count derived from it) excludes test/smoke records. An authorized admin surface passes
   * true to see them. Records are never deleted — this is aggregation-only.
   */
  readonly includeTestDeals?: boolean;
}

/**
 * Active deals assigned to the given banker, ordered by target close date.
 * Active = Dataverse statecode 0 (Active). Terminal statuses are excluded so
 * closed-won / closed-lost don't show up in the working pipeline. Classified test/smoke deals are
 * also excluded by default (P1-11) so supervised smoke-test records don't inflate operational counts.
 */
export async function loadBankerPipeline(
  bankerId: string,
  options: LoadBankerPipelineOptions = {},
): Promise<PipelineDeal[]> {
  const filter = [
    `_cr664_assignedbanker_value eq ${bankerId}`,
    ACTIVE_DEAL_ODATA_PREDICATE,
  ].join(' and ');

  const result = await Cr664_loandealsService.getAll({
    filter,
    orderBy: ['cr664_targetclosedate asc'],
  });

  const deals = (result.data ?? []).map(toPipelineDeal);
  return [...operationalDeals(deals, { includeTest: options.includeTestDeals })];
}
