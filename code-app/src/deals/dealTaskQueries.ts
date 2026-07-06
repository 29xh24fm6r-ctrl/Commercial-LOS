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

function nonEmpty(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

/**
 * Assignee display name for the cr664_AssignedTo systemuser lookup. The live SDK
 * does NOT populate the `cr664_assignedtoname` shadow field for lookup columns
 * (same as the deal/portfolio read models), so the authoritative label arrives
 * on the `_cr664_assignedto_value` `@OData.Community.Display.V1.FormattedValue`
 * annotation. Prefer that; fall back to the shadow field; else undefined.
 */
function assigneeNameOf(raw: Record<string, unknown>): string | undefined {
  return (
    nonEmpty(raw['_cr664_assignedto_value@OData.Community.Display.V1.FormattedValue']) ??
    nonEmpty(raw['cr664_assignedtoname'])
  );
}

/** Pure mapper: one raw cr664_dealtask1 row → the UI-facing DealTask. */
export function mapDealTaskRow(raw: Record<string, unknown>): DealTask {
  return {
    id: (raw['cr664_dealtask1id'] as string) ?? '',
    title: (raw['cr664_taskname'] as string) ?? '',
    completed: raw['cr664_completed'] === true,
    dueDate: nonEmpty(raw['cr664_duedate']),
    assigneeName: assigneeNameOf(raw),
    modifiedOn: nonEmpty(raw['modifiedon']),
  };
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

  const all = (result.data ?? []).map((t) =>
    mapDealTaskRow(t as unknown as Record<string, unknown>),
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
