/**
 * Phase 193H — CRM manager / team / executive rollups.
 *
 * Pure aggregation over per-account rollup records the caller has already loaded
 * under the viewer's authorization. Entitlement-before-render: every rollup
 * fails closed (`entitled: false`) when the viewer is not entitled, and the
 * executive rollup never exposes account-level detail. No fake metrics — every
 * count is derived from the supplied records; an empty input yields zeros, not
 * invented KPIs.
 */

export type CrmHealthBand = 'healthy' | 'watch' | 'at-risk' | 'unknown';

export interface CrmAccountRollupRecord {
  accountId: string;
  bankerId: string | null;
  teamId: string | null;
  healthBand: CrmHealthBand;
  openTasks: number;
  overdueTasks: number;
  lastActivityIso: string | null;
  coverageCount: number;
  hasSourceFacts: boolean;
}

export interface CrmRollupInput {
  accounts: CrmAccountRollupRecord[];
  viewerEntitled: boolean;
  nowIso?: string | null;
  staleAfterDays?: number;
}

export interface CrmHealthCounts {
  healthy: number;
  watch: number;
  'at-risk': number;
  unknown: number;
}

function emptyHealthCounts(): CrmHealthCounts {
  return { healthy: 0, watch: 0, 'at-risk': 0, unknown: 0 };
}

function countHealth(records: CrmAccountRollupRecord[]): CrmHealthCounts {
  const c = emptyHealthCounts();
  for (const r of records) c[r.healthBand] += 1;
  return c;
}

function isStale(r: CrmAccountRollupRecord, nowIso: string | null | undefined, staleAfterDays: number): boolean {
  if (!nowIso || !r.lastActivityIso) return false;
  const now = Date.parse(nowIso);
  const last = Date.parse(r.lastActivityIso);
  if (Number.isNaN(now) || Number.isNaN(last)) return false;
  return Math.floor((now - last) / 86_400_000) > staleAfterDays;
}

const NOT_ENTITLED = 'Viewer is not entitled to this CRM rollup.' as const;

export interface CrmManagerRollupRow {
  bankerId: string;
  accountCount: number;
  health: CrmHealthCounts;
  overdueTasks: number;
  staleAccounts: number;
  coverageGaps: number;
}

export interface CrmManagerRollup {
  entitled: boolean;
  blockedReason: string | null;
  byBanker: CrmManagerRollupRow[];
  totalAccounts: number;
}

export function deriveCrmManagerRollup(input: CrmRollupInput): CrmManagerRollup {
  if (!input.viewerEntitled) {
    return { entitled: false, blockedReason: NOT_ENTITLED, byBanker: [], totalAccounts: 0 };
  }
  const staleAfter = input.staleAfterDays ?? 90;
  const groups = new Map<string, CrmAccountRollupRecord[]>();
  for (const r of input.accounts) {
    const key = r.bankerId ?? '(unassigned)';
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  const byBanker: CrmManagerRollupRow[] = [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([bankerId, recs]) => ({
      bankerId,
      accountCount: recs.length,
      health: countHealth(recs),
      overdueTasks: recs.reduce((n, r) => n + r.overdueTasks, 0),
      staleAccounts: recs.filter((r) => isStale(r, input.nowIso, staleAfter)).length,
      coverageGaps: recs.filter((r) => r.coverageCount === 0).length,
    }));
  return { entitled: true, blockedReason: null, byBanker, totalAccounts: input.accounts.length };
}

export interface CrmTeamRollup {
  entitled: boolean;
  blockedReason: string | null;
  teamCoverage: { teamId: string; accountCount: number; coverageGaps: number }[];
  sharedAccounts: number;
  openTasks: number;
  overdueTasks: number;
  missingSourceFacts: number;
}

export function deriveCrmTeamRollup(input: CrmRollupInput): CrmTeamRollup {
  if (!input.viewerEntitled) {
    return { entitled: false, blockedReason: NOT_ENTITLED, teamCoverage: [], sharedAccounts: 0, openTasks: 0, overdueTasks: 0, missingSourceFacts: 0 };
  }
  const groups = new Map<string, CrmAccountRollupRecord[]>();
  for (const r of input.accounts) {
    const key = r.teamId ?? '(unassigned)';
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  const teamCoverage = [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([teamId, recs]) => ({ teamId, accountCount: recs.length, coverageGaps: recs.filter((r) => r.coverageCount === 0).length }));
  return {
    entitled: true,
    blockedReason: null,
    teamCoverage,
    sharedAccounts: input.accounts.filter((r) => r.coverageCount > 1).length,
    openTasks: input.accounts.reduce((n, r) => n + r.openTasks, 0),
    overdueTasks: input.accounts.reduce((n, r) => n + r.overdueTasks, 0),
    missingSourceFacts: input.accounts.filter((r) => !r.hasSourceFacts).length,
  };
}

export interface CrmExecutiveRollup {
  entitled: boolean;
  blockedReason: string | null;
  /** Aggregate only — no account-level detail is exposed. */
  totalAccounts: number;
  health: CrmHealthCounts;
  coveragePct: number | null;
  sourceFactPct: number | null;
  overdueTasks: number;
  operationalReadiness: 'ready' | 'attention' | 'unknown';
}

function pct(n: number, d: number): number | null {
  return d === 0 ? null : Math.round((n / d) * 100);
}

export function deriveCrmExecutiveRollup(input: CrmRollupInput): CrmExecutiveRollup {
  if (!input.viewerEntitled) {
    return { entitled: false, blockedReason: NOT_ENTITLED, totalAccounts: 0, health: emptyHealthCounts(), coveragePct: null, sourceFactPct: null, overdueTasks: 0, operationalReadiness: 'unknown' };
  }
  const total = input.accounts.length;
  const health = countHealth(input.accounts);
  const withCoverage = input.accounts.filter((r) => r.coverageCount > 0).length;
  const withFacts = input.accounts.filter((r) => r.hasSourceFacts).length;
  const overdueTasks = input.accounts.reduce((n, r) => n + r.overdueTasks, 0);
  const coveragePct = pct(withCoverage, total);
  let operationalReadiness: CrmExecutiveRollup['operationalReadiness'];
  if (total === 0) operationalReadiness = 'unknown';
  else if (health['at-risk'] === 0 && overdueTasks === 0 && (coveragePct ?? 0) === 100) operationalReadiness = 'ready';
  else operationalReadiness = 'attention';
  return {
    entitled: true,
    blockedReason: null,
    totalAccounts: total,
    health,
    coveragePct,
    sourceFactPct: pct(withFacts, total),
    overdueTasks,
    operationalReadiness,
  };
}
