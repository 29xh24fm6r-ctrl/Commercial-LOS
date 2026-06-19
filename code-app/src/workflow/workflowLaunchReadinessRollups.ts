import type {
  TeamDeal,
  TeamScopedDocument,
  TeamScopedMemo,
  TeamScopedMemoSection,
  TeamScopedTask,
} from '../manager/managerQueries';
import type { DealReadinessSnapshotRow } from '../executive/snapshotQueries';

export interface WorkflowLaunchReadinessRollup {
  dealsByStage: readonly { stage: string; count: number }[];
  blockersByType: readonly { type: string; count: number }[];
  missingDocumentsCount: number;
  incompleteCreditPackages: number;
  closingBottlenecks: number;
  bankerWorkload: readonly { bankerName: string; openTasks: number }[];
  staleStageIndicators: number;
  launchReadinessScore: number;
  notReadyReasons: readonly string[];
}

export function deriveManagerWorkflowLaunchReadiness(input: {
  deals: readonly TeamDeal[];
  tasks: readonly TeamScopedTask[];
  documents: readonly TeamScopedDocument[];
  memos: readonly TeamScopedMemo[];
  memoSections: readonly TeamScopedMemoSection[];
  now?: Date;
}): WorkflowLaunchReadinessRollup {
  const dealsByStage = countBy(input.deals, (deal) => deal.stage ?? 'Unavailable');
  const missingDocuments = input.documents.filter((doc) => doc.status === 'outstanding');
  const openTasks = input.tasks.filter((task) => !task.completed);
  const dealIdsWithMemo = new Set(input.memos.map((memo) => memo.dealId).filter(Boolean));
  const dealIdsWithSections = new Set(input.memoSections.map((section) => section.dealId).filter(Boolean));
  const underwritingDeals = input.deals.filter((deal) => /underwrit|credit|approval/i.test(deal.stage ?? ''));
  const incompleteCreditPackages = underwritingDeals.filter(
    (deal) => !dealIdsWithMemo.has(deal.id) || !dealIdsWithSections.has(deal.id),
  ).length;
  const closingBottlenecks = [
    ...missingDocuments.filter((doc) => /closing|booking|insurance|agreement/i.test(doc.name)),
    ...openTasks.filter((task) => /closing|booking|funding/i.test(task.title)),
  ].length;
  const bankerWorkload = countBy(openTasks, (task) => task.assigneeName ?? 'Unassigned')
    .map((item) => ({ bankerName: item.key, openTasks: item.count }))
    .sort((a, b) => b.openTasks - a.openTasks);
  const staleStageIndicators = countStaleDeals(input.deals, input.now ?? new Date());
  const blockerCount = missingDocuments.length + incompleteCreditPackages + closingBottlenecks + staleStageIndicators;
  const score = Math.max(0, 100 - blockerCount * 8);

  return {
    dealsByStage: dealsByStage.map(({ key, count }) => ({ stage: key, count })),
    blockersByType: [
      { type: 'Missing documents', count: missingDocuments.length },
      { type: 'Incomplete credit packages', count: incompleteCreditPackages },
      { type: 'Closing bottlenecks', count: closingBottlenecks },
      { type: 'Stale stages', count: staleStageIndicators },
    ],
    missingDocumentsCount: missingDocuments.length,
    incompleteCreditPackages,
    closingBottlenecks,
    bankerWorkload,
    staleStageIndicators,
    launchReadinessScore: score,
    notReadyReasons: reasons(missingDocuments.length, incompleteCreditPackages, closingBottlenecks, staleStageIndicators),
  };
}

export function deriveExecutiveWorkflowLaunchReadiness(input: {
  readinessSnapshots: readonly DealReadinessSnapshotRow[];
}): WorkflowLaunchReadinessRollup {
  const latestByDeal = new Map<string, DealReadinessSnapshotRow>();
  for (const row of input.readinessSnapshots) {
    const key = row.dealId ?? row.id;
    if (!latestByDeal.has(key)) latestByDeal.set(key, row);
  }
  const rows = [...latestByDeal.values()];
  const missingDocumentsCount = rows.reduce((sum, row) => sum + row.missingDocsCount, 0);
  const openBlockers = rows.reduce((sum, row) => sum + row.openBlockersCount, 0);
  const pendingApprovals = rows.reduce((sum, row) => sum + row.pendingApprovalsCount, 0);
  const staleItems = rows.reduce((sum, row) => sum + row.staleItemsCount, 0);
  const scores = rows.map((row) => row.readinessScore).filter((score): score is number => typeof score === 'number');
  const score = scores.length > 0
    ? Math.round(scores.reduce((sum, item) => sum + item, 0) / scores.length)
    : Math.max(0, 100 - (openBlockers + pendingApprovals + staleItems) * 8);

  return {
    dealsByStage: [],
    blockersByType: [
      { type: 'Missing documents', count: missingDocumentsCount },
      { type: 'Open blockers', count: openBlockers },
      { type: 'Pending approvals', count: pendingApprovals },
      { type: 'Stale items', count: staleItems },
    ],
    missingDocumentsCount,
    incompleteCreditPackages: pendingApprovals,
    closingBottlenecks: openBlockers,
    bankerWorkload: [],
    staleStageIndicators: staleItems,
    launchReadinessScore: score,
    notReadyReasons: reasons(missingDocumentsCount, pendingApprovals, openBlockers, staleItems),
  };
}

function countBy<T>(items: readonly T[], key: (item: T) => string): { key: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return [...counts].map(([itemKey, count]) => ({ key: itemKey, count }));
}

function countStaleDeals(deals: readonly TeamDeal[], now: Date): number {
  const staleMs = 1000 * 60 * 60 * 24 * 30;
  return deals.filter((deal) => {
    if (!deal.stageEntryDate) return false;
    const entered = new Date(deal.stageEntryDate);
    if (Number.isNaN(entered.getTime())) return false;
    return now.getTime() - entered.getTime() > staleMs;
  }).length;
}

function reasons(
  missingDocs: number,
  incompleteCredit: number,
  closing: number,
  stale: number,
): string[] {
  return [
    missingDocs > 0 ? `${missingDocs} missing document(s)` : undefined,
    incompleteCredit > 0 ? `${incompleteCredit} incomplete credit package(s)` : undefined,
    closing > 0 ? `${closing} closing bottleneck(s)` : undefined,
    stale > 0 ? `${stale} stale stage indicator(s)` : undefined,
  ].filter((item): item is string => !!item);
}
