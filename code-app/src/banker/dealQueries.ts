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
