import { Cr664_dealtask1sService } from '../generated/services/Cr664_dealtask1sService';

/**
 * Parsed, UI-facing shape of one cr664_dealtask1 record. Every cr664_*
 * identifier here is present on Cr664_dealtask1s
 * (see ../generated/models/Cr664_dealtask1sModel.ts).
 */
export interface DealTask {
  id: string;
  title: string;
  completed: boolean;
  dueDate: string | undefined;
  assigneeName: string | undefined;
  modifiedOn: string | undefined;
}

export interface DealTasksResult {
  open: DealTask[];
  completed: DealTask[];
}

/**
 * Load all active tasks for the given deal. Scope is enforced by the
 * filter on _cr664_deal_value plus statecode=0 (Active). Caller must
 * already have authorized read access to dealId via loadDealForBanker
 * before invoking this — DealTasks.tsx wires that by only mounting
 * once BankerDealWorkspace is in its 'ready' state.
 *
 * Returns a result split into 'open' (cr664_completed != true) and
 * 'completed' so the UI can render them in distinct sections without
 * a second round-trip.
 */
export async function loadDealTasks(dealId: string): Promise<DealTasksResult> {
  const result = await Cr664_dealtask1sService.getAll({
    filter: `_cr664_deal_value eq ${dealId} and statecode eq 0`,
    orderBy: ['cr664_duedate asc'],
  });

  if (!result.success) {
    const message = result.error?.message ?? 'Unknown error';
    throw new Error(message);
  }

  const all = (result.data ?? []).map(
    (t): DealTask => ({
      id: t.cr664_dealtask1id,
      title: t.cr664_taskname,
      completed: t.cr664_completed === true,
      dueDate: t.cr664_duedate,
      assigneeName: t.cr664_assignedtoname,
      modifiedOn: t.modifiedon,
    }),
  );

  const open = all.filter((t) => !t.completed);

  const completed = all
    .filter((t) => t.completed)
    .sort((a, b) => compareIsoDesc(a.modifiedOn, b.modifiedOn));

  return { open, completed };
}

function compareIsoDesc(a: string | undefined, b: string | undefined): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return b.localeCompare(a);
}
