import type { DealDocumentsResult } from '../deals/dealDocumentQueries';
import type { DealTasksResult } from '../deals/dealTaskQueries';

export interface ClosingReadinessResult {
  closingReady: boolean;
  bookingReady: boolean;
  blockers: readonly string[];
  postCloseExceptions: readonly string[];
}

export function deriveClosingReadiness(input: {
  documents?: DealDocumentsResult;
  tasks?: DealTasksResult;
  documentsUnavailable?: boolean;
  tasksUnavailable?: boolean;
}): ClosingReadinessResult {
  const blockers: string[] = [];
  if (input.documentsUnavailable) blockers.push('Document data unavailable');
  if (input.tasksUnavailable) blockers.push('Task data unavailable');

  const outstandingClosingDocs = input.documents?.outstanding.filter((doc) =>
    /closing|commitment|agreement|insurance|booking|collateral/i.test(doc.name),
  );
  if ((outstandingClosingDocs?.length ?? 0) > 0) {
    blockers.push(`${outstandingClosingDocs?.length ?? 0} unresolved closing document(s)`);
  }

  const openClosingTasks = input.tasks?.open.filter((task) =>
    /closing|booking|funding|post close|post-close|exception/i.test(task.title),
  );
  if ((openClosingTasks?.length ?? 0) > 0) {
    blockers.push(`${openClosingTasks?.length ?? 0} unresolved closing task(s)`);
  }

  const postCloseExceptions = [
    ...(input.documents?.outstanding ?? []).filter((doc) => /post close|post-close|exception/i.test(doc.name)).map((doc) => doc.name),
    ...(input.tasks?.open ?? []).filter((task) => /post close|post-close|exception/i.test(task.title)).map((task) => task.title),
  ];

  return {
    closingReady: blockers.length === 0,
    bookingReady: blockers.length === 0 && postCloseExceptions.length === 0,
    blockers,
    postCloseExceptions,
  };
}
