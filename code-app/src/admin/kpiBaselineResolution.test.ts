// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolveKpiBaselineDate, deriveKpiBaselineDataQualityFlag } from './kpiBaselineResolution';
import type { SystemSettingRow } from './adminDiagnosticsQueries';

/**
 * Completion Phase D — KPI_BASELINE_DATE is single-valued; conflicting rows must surface as a
 * data-quality flag and fail closed (no fabricated baseline), never silently pick one.
 */

function row(id: string, kpiBaselineDate: string | undefined): SystemSettingRow {
  return { id, settingName: 'KPI_BASELINE_DATE', kpiBaselineDate };
}

describe('resolveKpiBaselineDate', () => {
  it('resolves a single distinct baseline', () => {
    const r = resolveKpiBaselineDate([row('a', '2026-01-01'), row('b', '2026-01-01')]);
    expect(r.status).toBe('resolved');
    if (r.status === 'resolved') expect(r.value).toBe('2026-01-01');
  });

  it('is absent when no row carries a baseline', () => {
    expect(resolveKpiBaselineDate([row('a', undefined), row('b', '   ')]).status).toBe('absent');
  });

  it('is AMBIGUOUS (fail-closed) when rows conflict — never picks one', () => {
    // The live environment's 5 conflicting rows.
    const rows = [
      row('a', '2026-12-31'), row('b', '2026-01-01'), row('c', '2026-07-01'),
      row('d', '2026-10-01'), row('e', '2026-04-01'),
    ];
    const r = resolveKpiBaselineDate(rows);
    expect(r.status).toBe('ambiguous');
    if (r.status === 'ambiguous') {
      expect(r.count).toBe(5);
      expect(r.values).toHaveLength(5);
      // No `value` field exists on an ambiguous result — a consumer cannot read a baseline.
      expect('value' in r).toBe(false);
    }
  });
});

describe('deriveKpiBaselineDataQualityFlag', () => {
  it('raises a warning DQ flag listing the conflicting values when ambiguous', () => {
    const flag = deriveKpiBaselineDataQualityFlag([row('a', '2026-12-31'), row('b', '2026-01-01')]);
    expect(flag).not.toBeNull();
    expect(flag?.key).toBe('KPI_BASELINE_DATE');
    expect(flag?.severity).toBe('warning');
    expect(flag?.conflictingValues).toEqual(['2026-12-31', '2026-01-01']);
    expect(flag?.message).toMatch(/2 conflicting values/);
    expect(flag?.message).toMatch(/ambiguous until resolved/i);
  });

  it('raises no flag when the baseline resolves cleanly or is absent', () => {
    expect(deriveKpiBaselineDataQualityFlag([row('a', '2026-01-01')])).toBeNull();
    expect(deriveKpiBaselineDataQualityFlag([row('a', undefined)])).toBeNull();
  });
});
