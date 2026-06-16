import { Cr664_loandealsService } from '../generated/services/Cr664_loandealsService';
import type { Cr664_loandeals } from '../generated/models/Cr664_loandealsModel';

export interface PipelineDeal {
  id: string;
  name: string;
  clientName: string | undefined;
  stage: string | undefined;
  status: string | undefined;
  amount: number | undefined;
  targetCloseDate: string | undefined;
  lastActivityOn: string | undefined;
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
    stageEntryDate: d.cr664_stageentrydate,
    isClosed:
      d.cr664_closedflag === true ||
      d.cr664_isterminalstatus === true ||
      d.statecode === 1,
    collateralSummary: d.cr664_collateralsummary,
  };
}

/**
 * Active deals assigned to the given banker, ordered by target close date.
 * Active = Dataverse statecode 0 (Active). Terminal statuses are excluded so
 * closed-won / closed-lost don't show up in the working pipeline.
 */
export async function loadBankerPipeline(bankerId: string): Promise<PipelineDeal[]> {
  const filter = [
    `_cr664_assignedbanker_value eq ${bankerId}`,
    `statecode eq 0`,
    `(cr664_isterminalstatus eq false or cr664_isterminalstatus eq null)`,
  ].join(' and ');

  const result = await Cr664_loandealsService.getAll({
    filter,
    orderBy: ['cr664_targetclosedate asc'],
  });

  return (result.data ?? []).map(toPipelineDeal);
}
