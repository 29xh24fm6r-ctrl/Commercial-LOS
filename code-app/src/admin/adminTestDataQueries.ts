/**
 * PR 104 -- Admin Test Data view. Every operational query in the codebase
 * (banker, manager, executive, team) already routes through
 * operationalDeals()/partitionDealsByTestClassification() to EXCLUDE
 * SYSTEM-TEST/SMOKE/QA-tagged deals from KPIs (see
 * shared/deals/testDealClassification.ts). Nothing before this file gave an
 * admin a labeled, dedicated place to actually SEE what got excluded and why
 * -- the classification logic existed only as an invisible filter.
 *
 * Deliberately unfiltered by state/terminal-status: an admin auditing test
 * data needs to see test records regardless of stage or active/terminal
 * status, not just the operationally-active subset other surfaces show.
 */

import { Cr664_loandealsService } from '../generated/services/Cr664_loandealsService';
import { partitionDealsByTestClassification, type NamedDealLike } from '../shared/deals/testDealClassification';

export interface TestDataDealRow extends NamedDealLike {
  readonly id: string;
  readonly name: string;
  readonly createdOn?: string;
  readonly stage?: string;
}

export interface TestDataSnapshot {
  readonly operationalCount: number;
  readonly testRows: readonly TestDataDealRow[];
}

export async function loadTestDataSnapshot(): Promise<TestDataSnapshot> {
  const result = await Cr664_loandealsService.getAll({
    select: ['cr664_loandealid', 'cr664_dealname', 'createdon', 'cr664_stagereferencename'],
    orderBy: ['createdon desc'],
  });
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to load deals for the test-data view.');
  }
  const rows: TestDataDealRow[] = (result.data ?? []).map((d) => ({
    id: d.cr664_loandealid,
    name: d.cr664_dealname,
    createdOn: d.createdon,
    stage: d.cr664_stagereferencename,
  }));
  const { operational, test } = partitionDealsByTestClassification(rows);
  return { operationalCount: operational.length, testRows: test };
}
