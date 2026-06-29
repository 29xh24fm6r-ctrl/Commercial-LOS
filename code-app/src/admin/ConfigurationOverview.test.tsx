// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { ConfigurationSnapshot, SystemSettingRow } from './adminDiagnosticsQueries';

vi.mock('./AdminDataProvider', () => ({ useAdminData: vi.fn() }));
import { useAdminData } from './AdminDataProvider';
import { ConfigurationOverview } from './ConfigurationOverview';

const useAdminDataMock = vi.mocked(useAdminData);

function setConfiguration(systemSettings: SystemSettingRow[]) {
  const configuration = { kind: 'ready' as const, data: { systemSettings, activeKpiThresholds: [] } as ConfigurationSnapshot };
  useAdminDataMock.mockReturnValue({ configuration } as unknown as ReturnType<typeof useAdminData>);
}

function row(id: string, kpiBaselineDate: string | undefined): SystemSettingRow {
  return { id, settingName: 'KPI_BASELINE_DATE', kpiBaselineDate };
}

describe('Completion Phase D — ConfigurationOverview KPI baseline surfacing', () => {
  it('surfaces an ambiguous-baseline data-quality warning when rows conflict (no silent pick)', () => {
    setConfiguration([
      row('a', '2026-12-31'), row('b', '2026-01-01'), row('c', '2026-07-01'),
      row('d', '2026-10-01'), row('e', '2026-04-01'),
    ]);
    const { container } = render(<ConfigurationOverview />);
    const warn = container.querySelector('[data-kpi-baseline-ambiguous]');
    expect(warn).not.toBeNull();
    expect(warn?.textContent).toMatch(/5 conflicting values/);
    expect(warn?.textContent).toMatch(/treated as unresolved/i);
    // It does NOT render a single resolved baseline (never picks one).
    expect(container.querySelector('[data-kpi-baseline-resolved]')).toBeNull();
  });

  it('shows the single resolved baseline when rows agree, with no ambiguity warning', () => {
    setConfiguration([row('a', '2026-01-01'), row('b', '2026-01-01')]);
    const { container } = render(<ConfigurationOverview />);
    expect(container.querySelector('[data-kpi-baseline-ambiguous]')).toBeNull();
    expect(container.querySelector('[data-kpi-baseline-resolved]')).not.toBeNull();
  });
});
