import { LOAN_WORKFLOW_STAGES } from '../workflow/loanWorkflowStages';
import {
  createDealTask,
  describeCreateDealTaskFailure,
  type CreateDealTaskInput,
  type CreateDealTaskOutcome,
} from './createDealTaskAction';

/**
 * Destination-stage work generation.
 *
 * A governed stage advance writes only the stage reference, audit, and timeline — it created no
 * work for the stage the deal just entered (the live-smoke gap: advancing produced no Underwriting
 * tasks). On a successful advance, this seeds the destination stage's standard tasks as REAL
 * governed cr664_dealtask1 rows (each created → audited → timelined by the existing createDealTask
 * write), assigned to the acting banker. It is idempotent by title: a task already open on the deal
 * is skipped, so re-entering a stage never duplicates work. Nothing is fabricated — the titles come
 * from the stage definition, and each row is a real persisted task.
 */

export interface GenerateStageWorkInput {
  readonly dealId: string;
  /** Destination stage code (e.g. 'UNDERWRITING'). */
  readonly stageCode: string;
  readonly actorSystemUserId: string;
  readonly actorEmail: string;
  /** Open-task titles already on the deal, to skip duplicates. */
  readonly existingOpenTaskTitles?: readonly string[];
}

export interface GenerateStageWorkResult {
  readonly stageCode: string;
  readonly created: readonly string[];
  readonly skipped: readonly string[];
  readonly failed: readonly { readonly title: string; readonly error: string }[];
}

/** Injectable creator so tests drive this without the SDK. */
export type DealTaskCreator = (input: CreateDealTaskInput) => Promise<CreateDealTaskOutcome>;

export async function generateDestinationStageWork(
  input: GenerateStageWorkInput,
  createTask: DealTaskCreator = (i) => createDealTask(i),
): Promise<GenerateStageWorkResult> {
  const stage = LOAN_WORKFLOW_STAGES.find((s) => s.id === input.stageCode);
  const tasks = stage?.requiredTasks ?? [];
  const existing = new Set((input.existingOpenTaskTitles ?? []).map((t) => t.trim().toLowerCase()));

  const created: string[] = [];
  const skipped: string[] = [];
  const failed: { title: string; error: string }[] = [];

  for (const t of tasks) {
    const title = t.label;
    if (existing.has(title.trim().toLowerCase())) {
      skipped.push(title);
      continue;
    }
    const outcome = await createTask({
      dealId: input.dealId,
      taskName: title,
      assigneeSystemUserId: input.actorSystemUserId,
      actorSystemUserId: input.actorSystemUserId,
      actorEmail: input.actorEmail,
      note: `Auto-generated on entering the ${stage?.id ?? input.stageCode} stage.`,
    });
    // The task row IS created on 'success' and 'governance-partial' (only the audit/timeline missed).
    if (outcome.kind === 'success' || outcome.kind === 'governance-partial') {
      created.push(title);
    } else {
      failed.push({ title, error: describeCreateDealTaskFailure(outcome) });
    }
  }

  return { stageCode: input.stageCode, created, skipped, failed };
}
