/**
 * CRM-ELITE-1 Phase 1 — live relationship-health data layer.
 *
 * Derives one CrmHealthInput per organization, and CrmAccountRollupRecord[],
 * from data already loaded by crmWorkspaceData.ts — zero new Dataverse reads.
 * Pure. No IO. Honest-missing: a domain that failed to load (`status !==
 * 'ready'`) leaves the corresponding CrmHealthInput field `undefined`, NOT
 * zero — zero and "we don't know" must never be conflated.
 */

import type { CrmWorkspaceData } from './crmWorkspaceData';
import { deriveCrmRelationshipHealth, type CrmHealthInput } from '../crmRelationshipHealthModel';
import type { CrmAccountRollupRecord } from '../crmRelationshipRollups';

export interface OrgHealthInputResult {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly input: CrmHealthInput;
}

/** Activity event types that count toward engagement; 'follow-up-task' is a task, not an activity. */
const ACTIVITY_EVENT_TYPES: ReadonlySet<string> = new Set(['call', 'email', 'meeting', 'note']);

/** Latest (max) ISO timestamp among the given values, or null when none parse. */
function latestIso(isos: readonly string[]): string | null {
  let latest: string | null = null;
  let latestMs = -Infinity;
  for (const iso of isos) {
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) continue;
    if (ms > latestMs) {
      latestMs = ms;
      latest = iso;
    }
  }
  return latest;
}

/**
 * Derive one CrmHealthInput per organization from already-loaded CrmWorkspaceData.
 * `overdueTaskCount` is always `undefined` — `cr664_crmtimelineevents` has no
 * status/completed field, so overdue detection has no live signal behind it
 * (known schema gap, not a bug). `accountProvisional` is always `false` — no
 * provisional-account concept exists in this schema today.
 */
export function deriveOrgHealthInputs(
  data: CrmWorkspaceData,
  nowIso: string,
): readonly OrgHealthInputResult[] {
  const orgs = data.organizations;
  if (orgs.status !== 'ready') return [];

  const peopleReady = data.people.status === 'ready';
  const relationshipsReady = data.relationships.status === 'ready';
  const timelineReady = data.timelineEvents.status === 'ready';

  return orgs.records.map((org) => {
    const contactCount = peopleReady
      ? data.people.records.filter((p) => p.organizationId === org.id).length
      : undefined;

    const coverageCount = relationshipsReady
      ? data.relationships.records.filter((r) => r.organizationId === org.id).length
      : undefined;

    let activityCount: number | undefined;
    let lastActivityIso: string | null | undefined;
    let openTaskCount: number | undefined;

    if (timelineReady) {
      const orgEvents = data.timelineEvents.records.filter((t) => t.organizationId === org.id);
      const activityEvents = orgEvents.filter((t) => t.eventType !== undefined && ACTIVITY_EVENT_TYPES.has(t.eventType));
      activityCount = activityEvents.length;
      lastActivityIso = latestIso(
        activityEvents.map((e) => e.occurredAt).filter((v): v is string => Boolean(v)),
      );
      openTaskCount = orgEvents.filter((t) => t.eventType === 'follow-up-task').length;
    } else {
      activityCount = undefined;
      lastActivityIso = undefined;
      openTaskCount = undefined;
    }

    const input: CrmHealthInput = {
      hasAccount: true,
      accountProvisional: false,
      contactCount,
      coverageCount,
      activityCount,
      lastActivityIso,
      openTaskCount,
      overdueTaskCount: undefined,
      nowIso,
    };

    return {
      organizationId: org.id,
      organizationName: org.title,
      input,
    };
  });
}

/**
 * Assemble CrmAccountRollupRecord[] from Phase 1 org health inputs, calling the
 * already-implemented deriveCrmRelationshipHealth per org for its healthBand.
 * `teamId` is always `null` — team-assignment data isn't in this schema today,
 * so no mapping is invented. `bankerIdByOrgId` is caller-supplied; pass an
 * empty map when ownership data is unavailable rather than guessing.
 */
export function deriveAccountRollupRecords(
  orgHealthInputs: readonly OrgHealthInputResult[],
  bankerIdByOrgId: ReadonlyMap<string, string | null>,
  nowIso: string,
): readonly CrmAccountRollupRecord[] {
  return orgHealthInputs.map(({ organizationId, input }) => {
    const health = deriveCrmRelationshipHealth({ ...input, nowIso });
    return {
      accountId: organizationId,
      bankerId: bankerIdByOrgId.get(organizationId) ?? null,
      teamId: null,
      healthBand: health.band,
      openTasks: input.openTaskCount ?? 0,
      overdueTasks: input.overdueTaskCount ?? 0,
      lastActivityIso: input.lastActivityIso ?? null,
      coverageCount: input.coverageCount ?? 0,
      hasSourceFacts: health.sourceFacts.length > 0,
    };
  });
}
