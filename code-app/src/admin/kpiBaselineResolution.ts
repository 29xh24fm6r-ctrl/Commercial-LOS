import type { SystemSettingRow } from './adminDiagnosticsQueries';

/**
 * Completion Phase D — deterministic resolution of the single-valued
 * `KPI_BASELINE_DATE` system setting.
 *
 * `KPI_BASELINE_DATE` is a single-value setting, but the live environment holds MULTIPLE
 * active system-setting rows carrying conflicting baseline dates. A naive reader that
 * "picks one" would silently drive any KPI baseline math off an ambiguous value. This pure
 * resolver instead detects the conflict, raises a data-quality flag, and fails CLOSED:
 * `value` is only present when exactly one distinct baseline exists — otherwise the
 * consumer must render "baseline ambiguous", never a fabricated number.
 *
 * Operator-owned remediation (runbook): dedupe the rows to one approved baseline value.
 */

export type KpiBaselineResolution =
  | { readonly status: 'resolved'; readonly value: string }
  | { readonly status: 'absent' }
  | { readonly status: 'ambiguous'; readonly values: readonly string[]; readonly count: number };

/** The distinct, non-empty baseline values across all active system-setting rows. */
function distinctBaselines(rows: readonly SystemSettingRow[]): string[] {
  const seen = new Set<string>();
  for (const r of rows) {
    const v = (r.kpiBaselineDate ?? '').trim();
    if (v.length > 0) seen.add(v);
  }
  return [...seen];
}

/**
 * Resolve the KPI baseline date deterministically and fail-closed:
 *   - exactly one distinct value → resolved
 *   - none → absent
 *   - more than one → ambiguous (the consumer shows "baseline ambiguous", not a guess)
 */
export function resolveKpiBaselineDate(rows: readonly SystemSettingRow[]): KpiBaselineResolution {
  const values = distinctBaselines(rows);
  if (values.length === 0) return { status: 'absent' };
  if (values.length === 1) return { status: 'resolved', value: values[0] };
  return { status: 'ambiguous', values, count: values.length };
}

export interface KpiBaselineDataQualityFlag {
  readonly key: 'KPI_BASELINE_DATE';
  readonly severity: 'warning';
  readonly message: string;
  readonly conflictingValues: readonly string[];
}

/**
 * Derive a data-quality flag for the admin DQ surface when the baseline is ambiguous.
 * Returns null when the setting resolves cleanly (or is absent), so it can be spread into
 * the existing DQ flag list without adding noise.
 */
export function deriveKpiBaselineDataQualityFlag(
  rows: readonly SystemSettingRow[],
): KpiBaselineDataQualityFlag | null {
  const resolution = resolveKpiBaselineDate(rows);
  if (resolution.status !== 'ambiguous') return null;
  return {
    key: 'KPI_BASELINE_DATE',
    severity: 'warning',
    message: `KPI_BASELINE_DATE has ${resolution.count} conflicting values (${resolution.values.join(', ')}); dedupe to one approved baseline. KPI baseline is treated as ambiguous until resolved.`,
    conflictingValues: resolution.values,
  };
}
