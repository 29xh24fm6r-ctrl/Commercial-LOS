import type { CreditMemoData } from '../deals/creditMemoQueries';
import type { DealDocumentsResult } from '../deals/dealDocumentQueries';
import type { DealTasksResult } from '../deals/dealTaskQueries';

export interface CreditReadinessResult {
  status: 'ready' | 'blocked' | 'unavailable';
  missingArtifacts: readonly string[];
  memoComplete: boolean;
  committeePackageReady: boolean;
}

const REQUIRED_SECTIONS = ['Executive Summary', 'Repayment Analysis'];

export function deriveCreditReadiness(input: {
  creditMemo?: CreditMemoData;
  documents?: DealDocumentsResult;
  tasks?: DealTasksResult;
  creditMemoUnavailable?: boolean;
}): CreditReadinessResult {
  if (input.creditMemoUnavailable) {
    return {
      status: 'unavailable',
      missingArtifacts: ['Credit memo data unavailable'],
      memoComplete: false,
      committeePackageReady: false,
    };
  }

  const missingArtifacts: string[] = [];
  const hasMemo = (input.creditMemo?.memos.length ?? 0) > 0;
  if (!hasMemo) missingArtifacts.push('Credit memo');

  const sectionLabels = new Set(
    (input.creditMemo?.sections ?? []).map((section) => section.sectionLabel.toLowerCase()),
  );
  for (const section of REQUIRED_SECTIONS) {
    if (![...sectionLabels].some((label) => label.includes(section.toLowerCase()))) {
      missingArtifacts.push(section);
    }
  }

  const openCreditTasks = input.tasks?.open.filter((task) =>
    /credit|memo|committee|approval/i.test(task.title),
  );
  if ((openCreditTasks?.length ?? 0) > 0) {
    missingArtifacts.push(`${openCreditTasks?.length ?? 0} open credit task(s)`);
  }

  const pendingDocs = input.documents?.outstanding.filter((doc) =>
    /financial|tax|collateral|approval/i.test(doc.name),
  );
  if ((pendingDocs?.length ?? 0) > 0) {
    missingArtifacts.push(`${pendingDocs?.length ?? 0} incomplete credit document(s)`);
  }

  return {
    status: missingArtifacts.length === 0 ? 'ready' : 'blocked',
    missingArtifacts,
    memoComplete: hasMemo && REQUIRED_SECTIONS.every((section) =>
      [...sectionLabels].some((label) => label.includes(section.toLowerCase())),
    ),
    committeePackageReady: missingArtifacts.length === 0,
  };
}
