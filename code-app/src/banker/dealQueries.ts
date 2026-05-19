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

function toPipelineDeal(d: Cr664_loandeals): PipelineDeal {
  return {
    id: d.cr664_loandealid,
    name: d.cr664_dealname,
    clientName: d.cr664_clientname,
    stage: d.cr664_stagereferencename,
    status: d.cr664_statusreferencename,
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
