/**
 * Phase 193F — CRM relationship health + next actions.
 *
 * Pure, evidence-based, deterministic RULES — no AI claims, no outcome
 * predictions, no fabricated score. Health is derived only from signals the
 * caller supplies (coverage presence, contact presence, activity recency, open/
 * overdue tasks, provisional-account identity). When there is not enough
 * evidence, the band is `unknown` (never a made-up number), and next actions are
 * deterministic, source-linked suggestions — never lending/committee decisions.
 */

export type CrmHealthBand = 'healthy' | 'watch' | 'at-risk' | 'unknown';
export type CrmHealthSeverity = 'ok' | 'watch' | 'risk' | 'unknown';

export interface CrmHealthSignal {
  key: string;
  label: string;
  severity: CrmHealthSeverity;
  evidence: string;
}

export interface CrmNextAction {
  priority: number;
  key: string;
  action: string;
  reason: string;
}

export interface CrmHealthInput {
  hasAccount?: boolean;
  accountProvisional?: boolean;
  contactCount?: number;
  coverageCount?: number;
  activityCount?: number;
  lastActivityIso?: string | null;
  openTaskCount?: number;
  overdueTaskCount?: number;
  /** Caller-provided reference time for staleness; deterministic, no clock read. */
  nowIso?: string | null;
  /** Activity is "stale" after this many days (default 90). */
  staleAfterDays?: number;
}

export interface CrmRelationshipHealthViewModel {
  band: CrmHealthBand;
  hasSufficientEvidence: boolean;
  signals: CrmHealthSignal[];
  missingInputs: string[];
  sourceFacts: string[];
  nextActions: CrmNextAction[];
}

function daysBetween(laterIso: string, earlierIso: string): number | null {
  const later = Date.parse(laterIso);
  const earlier = Date.parse(earlierIso);
  if (Number.isNaN(later) || Number.isNaN(earlier)) return null;
  return Math.floor((later - earlier) / 86_400_000);
}

export function deriveCrmRelationshipHealth(input: CrmHealthInput): CrmRelationshipHealthViewModel {
  const signals: CrmHealthSignal[] = [];
  const missingInputs: string[] = [];
  const sourceFacts: string[] = [];
  const staleAfter = input.staleAfterDays ?? 90;

  // Coverage signal
  const coverageCount = input.coverageCount;
  if (coverageCount === undefined) {
    missingInputs.push('coverage data');
  } else if (coverageCount > 0) {
    signals.push({ key: 'coverage', label: 'Coverage team', severity: 'ok', evidence: `${coverageCount} authorized coverage member(s) on record.` });
    sourceFacts.push(`${coverageCount} coverage member(s) derived from authorized banker/team facts.`);
  } else {
    signals.push({ key: 'coverage', label: 'Coverage team', severity: 'risk', evidence: 'No coverage team is assigned.' });
  }

  // Contact signal
  const contactCount = input.contactCount;
  if (contactCount === undefined) {
    missingInputs.push('contact data');
  } else if (contactCount > 0) {
    signals.push({ key: 'contacts', label: 'Contacts', severity: 'ok', evidence: `${contactCount} contact(s) on record.` });
  } else {
    signals.push({ key: 'contacts', label: 'Contacts', severity: 'watch', evidence: 'No CRM contacts on record.' });
  }

  // Activity recency signal
  if (input.activityCount === undefined && input.lastActivityIso === undefined) {
    missingInputs.push('activity data');
  } else if (!input.activityCount || input.lastActivityIso == null) {
    signals.push({ key: 'activity', label: 'Activity recency', severity: 'unknown', evidence: 'No activity on record to assess engagement.' });
  } else if (input.nowIso) {
    const days = daysBetween(input.nowIso, input.lastActivityIso);
    if (days === null) {
      signals.push({ key: 'activity', label: 'Activity recency', severity: 'unknown', evidence: 'Activity date could not be parsed.' });
    } else if (days > staleAfter) {
      signals.push({ key: 'activity', label: 'Activity recency', severity: 'watch', evidence: `Last activity was ${days} day(s) ago (> ${staleAfter}).` });
      sourceFacts.push(`Most recent activity ${input.lastActivityIso} is stale relative to ${input.nowIso}.`);
    } else {
      signals.push({ key: 'activity', label: 'Activity recency', severity: 'ok', evidence: `Last activity ${days} day(s) ago.` });
    }
  } else {
    signals.push({ key: 'activity', label: 'Activity recency', severity: 'unknown', evidence: 'No reference time supplied to assess recency.' });
  }

  // Task signal — only counts as evidence when task data was actually provided.
  const overdue = input.overdueTaskCount ?? 0;
  const open = input.openTaskCount ?? 0;
  if (input.overdueTaskCount === undefined && input.openTaskCount === undefined) {
    missingInputs.push('task data');
  } else if (overdue > 0) {
    signals.push({ key: 'tasks', label: 'Open tasks', severity: 'risk', evidence: `${overdue} overdue CRM task(s).` });
    sourceFacts.push(`${overdue} overdue CRM task(s) on record.`);
  } else if (open > 0) {
    signals.push({ key: 'tasks', label: 'Open tasks', severity: 'watch', evidence: `${open} open CRM task(s).` });
  } else {
    signals.push({ key: 'tasks', label: 'Open tasks', severity: 'ok', evidence: 'No open CRM tasks.' });
  }

  // Account identity signal
  if (input.hasAccount === false) {
    signals.push({ key: 'identity', label: 'Account identity', severity: 'watch', evidence: 'No CRM account linked.' });
  } else if (input.accountProvisional) {
    signals.push({ key: 'identity', label: 'Account identity', severity: 'watch', evidence: 'Account is provisional (borrower/client stub, not seeded).' });
    sourceFacts.push('Account identity is provisional and not yet migrated to a seeded CRM Account.');
  } else if (input.hasAccount) {
    signals.push({ key: 'identity', label: 'Account identity', severity: 'ok', evidence: 'Seeded CRM account on record.' });
  }

  const hasRisk = signals.some((s) => s.severity === 'risk');
  const hasWatch = signals.some((s) => s.severity === 'watch');
  const hasOk = signals.some((s) => s.severity === 'ok');
  const hasSufficientEvidence = hasRisk || hasWatch || hasOk;

  let band: CrmHealthBand;
  if (!hasSufficientEvidence) band = 'unknown';
  else if (hasRisk) band = 'at-risk';
  else if (hasWatch) band = 'watch';
  else band = 'healthy';

  return {
    band,
    hasSufficientEvidence,
    signals,
    missingInputs,
    sourceFacts,
    nextActions: deriveCrmNextActions(signals, input),
  };
}

/**
 * Deterministic, rules-based next actions linked to the signals above. No AI,
 * no outcome odds, no ranking claims, no lending-decision language.
 */
export function deriveCrmNextActions(signals: CrmHealthSignal[], input: CrmHealthInput): CrmNextAction[] {
  const actions: CrmNextAction[] = [];
  let priority = 1;
  const sev = (k: string) => signals.find((s) => s.key === k)?.severity;

  if (sev('coverage') === 'risk') {
    actions.push({ priority: priority++, key: 'assign-coverage', action: 'Assign a coverage team from authorized banker/team facts.', reason: 'No coverage team is assigned.' });
  }
  if (sev('tasks') === 'risk') {
    actions.push({ priority: priority++, key: 'resolve-overdue', action: `Resolve ${input.overdueTaskCount ?? 0} overdue CRM task(s).`, reason: 'Overdue CRM tasks indicate slipping follow-through.' });
  }
  if (sev('activity') === 'watch') {
    actions.push({ priority: priority++, key: 'log-activity', action: 'Log a relationship activity to refresh engagement.', reason: 'Most recent activity is stale.' });
  }
  if (sev('identity') === 'watch' && input.accountProvisional) {
    actions.push({ priority: priority++, key: 'migrate-account', action: 'Migrate the provisional account to a seeded CRM Account (gated apply).', reason: 'Account identity is provisional.' });
  }
  if (sev('contacts') === 'watch') {
    actions.push({ priority: priority++, key: 'add-contact', action: 'Add a primary contact to the account.', reason: 'No CRM contacts on record.' });
  }
  return actions;
}
