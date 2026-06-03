// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import {
  VerticalBarChart,
  HorizontalBarChart,
  Histogram,
  DonutChart,
  ForecastSparkline,
} from './ManagerChartPrimitives';

/**
 * Phase 125A — ManagerChartPrimitives tests.
 *
 * Pins:
 *   - every primitive renders a labelled <section> + an aria-label
 *     summary that captures the data (screen-reader path);
 *   - empty data renders the honest "No data yet." copy;
 *   - the data-manager-chart attribute identifies the chart type;
 *   - per-datum data-manager-chart-bar / data-manager-chart-bin
 *     attributes label each bar / segment for golden tests;
 *   - donut renders one circle per non-zero segment + the total in
 *     the center.
 */

describe('Phase 125A — VerticalBarChart', () => {
  it('renders one labelled bar per datum + an aria-summary', () => {
    render(
      <VerticalBarChart
        title="Pipeline by stage"
        data={[
          { label: 'Origination', value: 3 },
          { label: 'Underwriting', value: 5 },
        ]}
      />,
    );
    const region = screen.getByRole('region', { name: /Pipeline by stage/ });
    expect(region.getAttribute('data-manager-chart')).toBe('vertical-bar-chart');
    expect(region.getAttribute('aria-label')).toContain('Origination 3');
    expect(region.getAttribute('aria-label')).toContain('Underwriting 5');
  });

  it('renders the honest empty state when all values are zero', () => {
    render(
      <VerticalBarChart
        title="Empty"
        data={[{ label: 'A', value: 0 }, { label: 'B', value: 0 }]}
      />,
    );
    expect(screen.getByText('No data yet.')).toBeInTheDocument();
  });
});

describe('Phase 125A — HorizontalBarChart', () => {
  it('caps at maxRows', () => {
    const data = Array.from({ length: 12 }, (_, i) => ({
      label: `b${i}`,
      value: 10 - i,
    }));
    render(<HorizontalBarChart title="t" data={data} maxRows={5} />);
    const region = screen.getByRole('region', { name: /t/ });
    for (let i = 0; i < 5; i += 1) {
      expect(region.querySelector(`[data-manager-chart-bar="b${i}"]`)).not.toBeNull();
    }
    for (let i = 5; i < 12; i += 1) {
      expect(region.querySelector(`[data-manager-chart-bar="b${i}"]`)).toBeNull();
    }
  });

  it('renders a secondary label when supplied', () => {
    render(
      <HorizontalBarChart
        title="t"
        data={[{ label: 'Alice', value: 4, secondaryLabel: '$1.5M' }]}
      />,
    );
    expect(screen.getByText('$1.5M')).toBeInTheDocument();
  });
});

describe('Phase 125A — Histogram', () => {
  it('renders one bin per datum with data-manager-chart-bin', () => {
    render(
      <Histogram
        title="Aging"
        data={[
          { label: '0–7 d', value: 2 },
          { label: '8–14 d', value: 1 },
        ]}
      />,
    );
    const region = screen.getByRole('region', { name: /Aging/ });
    expect(region.querySelector('[data-manager-chart-bin="0–7 d"]')).not.toBeNull();
    expect(region.querySelector('[data-manager-chart-bin="8–14 d"]')).not.toBeNull();
  });
});

describe('Phase 125A — DonutChart', () => {
  it('renders one segment per non-zero entry + the total in the center', () => {
    render(
      <DonutChart
        title="Risk distribution"
        segments={[
          { label: 'Blocked', value: 1, tone: 'blocked' },
          { label: 'At risk', value: 2, tone: 'atRisk' },
          { label: 'Clear', value: 3, tone: 'clear' },
          { label: 'Unknown', value: 0, tone: 'neutral' },
        ]}
      />,
    );
    const region = screen.getByRole('region', { name: /Risk distribution/ });
    expect(region.querySelector('[data-manager-chart-segment="Blocked"]')).not.toBeNull();
    expect(region.querySelector('[data-manager-chart-segment="At risk"]')).not.toBeNull();
    expect(region.querySelector('[data-manager-chart-segment="Clear"]')).not.toBeNull();
    // SVG <text> shows total value in the middle.
    expect(region.querySelector('svg text')?.textContent).toBe('6');
  });

  it('renders empty state when every segment is zero', () => {
    render(
      <DonutChart
        title="Empty risk"
        segments={[
          { label: 'Blocked', value: 0, tone: 'blocked' },
          { label: 'Clear', value: 0, tone: 'clear' },
        ]}
      />,
    );
    expect(screen.getByText('No data yet.')).toBeInTheDocument();
  });
});

describe('Phase 125A — ForecastSparkline', () => {
  it('renders one bar per month + the count + an em-dash for $0 months', () => {
    render(
      <ForecastSparkline
        title="Closings forecast"
        points={[
          { label: 'Jun 2026', dealCount: 2, totalAmount: 750_000 },
          { label: 'Jul 2026', dealCount: 1, totalAmount: 0 },
        ]}
      />,
    );
    const region = screen.getByRole('region', { name: /Closings forecast/ });
    expect(region.querySelector('[data-manager-chart-month="Jun 2026"]')).not.toBeNull();
    expect(region.querySelector('[data-manager-chart-month="Jul 2026"]')).not.toBeNull();
    expect(screen.getByText('$750K')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
