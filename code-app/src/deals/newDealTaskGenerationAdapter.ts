/**
 * Phase 175A -- New deal task generation adapter (DISABLED by default).
 *
 * Generates approved default tasks for a newly created deal, only when enabled.
 * Disabled by default; no task service is imported (IO injected). Deterministic
 * approved template only; idempotent (no duplicate tasks); binds tasks to the
 * created deal; surfaces partial creation honestly. No hardcoded user GUIDs.
 */

import type { TaskGenerationOutcome } from './dealOriginationOutcomes';
import {
  isTaskGenerationEnabled,
  type DealOriginationFeatureFlagConfig,
} from './dealOriginationFeatureFlags';

const MODULE = 'task-generation';

/** Allow-listed task create payload keys. */
export const TASK_GENERATION_ALLOWED_FIELDS = Object.freeze([
  'cr664_taskname',
  'cr664_completed',
  'cr664_Deal@odata.bind',
  'cr664_AssignedTo@odata.bind',
  'cr664_correlationid',
] as const);

export interface TaskGenerationInput {
  readonly dealId: string | undefined;
  readonly actorSystemUserId: string | undefined;
  readonly authorized: boolean;
  readonly correlationId: string;
  readonly config?: DealOriginationFeatureFlagConfig;
  /** Approved, deterministic task template (titles). Empty/absent -> skip. */
  readonly templateTaskNames?: readonly string[];
  /** Existing task titles on the deal (for idempotency). */
  readonly existingTaskNames?: readonly string[];
  /** Test-only gate override. Production never sets it (uses config). */
  readonly enabledOverride?: boolean;
}

export type RunCreateTask = (payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;

export async function runNewDealTaskGeneration(
  input: TaskGenerationInput,
  runCreateTask?: RunCreateTask,
): Promise<TaskGenerationOutcome> {
  const enabled = input.enabledOverride ?? isTaskGenerationEnabled(input.config);
  if (!enabled) {
    return { module: MODULE, kind: 'disabled', detail: 'Task generation gate is off.' };
  }
  if (!input.dealId) {
    return { module: MODULE, kind: 'dependency_not_ready', detail: 'No created deal id.' };
  }
  if (!input.authorized || !input.actorSystemUserId) {
    return { module: MODULE, kind: 'unauthorized', detail: 'Actor not authorized.' };
  }
  const template = (input.templateTaskNames ?? []).filter((t) => t.trim().length > 0);
  if (template.length === 0) {
    return { module: MODULE, kind: 'skipped_no_template', detail: 'No approved task template.' };
  }
  const existing = new Set((input.existingTaskNames ?? []).map((t) => t.trim().toLowerCase()));
  const fresh = template.filter((t) => !existing.has(t.trim().toLowerCase()));
  if (fresh.length === 0) {
    return { module: MODULE, kind: 'skipped_duplicate_detected', detail: 'All template tasks already exist.' };
  }
  if (!runCreateTask) {
    return { module: MODULE, kind: 'dependency_not_ready', detail: 'No task transport injected.' };
  }
  let created = 0;
  let failed = 0;
  for (const name of fresh) {
    const payload = {
      cr664_taskname: name,
      cr664_completed: false,
      'cr664_Deal@odata.bind': `/cr664_loandeals(${input.dealId})`,
      'cr664_AssignedTo@odata.bind': `/systemusers(${input.actorSystemUserId})`,
      cr664_correlationid: input.correlationId,
    };
    const stray = Object.keys(payload).filter(
      (k) => !(TASK_GENERATION_ALLOWED_FIELDS as readonly string[]).includes(k),
    );
    if (stray.length > 0) {
      return { module: MODULE, kind: 'failed', detail: `Disallowed task field(s): ${stray.join(', ')}.` };
    }
    try {
      const res = await runCreateTask(payload);
      if (res.ok) created += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }
  if (created === 0) return { module: MODULE, kind: 'failed', detail: 'No tasks created.' };
  if (failed > 0) {
    return { module: MODULE, kind: 'partial_success', detail: `${created} created, ${failed} failed.`, correlationId: input.correlationId };
  }
  return { module: MODULE, kind: 'success', detail: `${created} task(s) created.`, correlationId: input.correlationId };
}
