// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { buildChartDrillThrough, buildChartSegmentDrillThrough } from './chartDrillThrough';
import { resolveDrillThroughAction, hasDrillThroughContent } from './drillThroughTypes';
import { VerticalBarChart, DonutChart } from '../CommandChartPrimitives';

describe('Phase 144C — buildChartDrillThrough', () => {
  it('builds a read-only chart-level target with segment rows + source counts', () => {
    const t = buildChartDrillThrough({
      chartTitle: 'Pipeline by stage',
      surface: 'portfolio_command_center',
      segments: [
        { label: 'Application', value: 3, secondary: '$900K' },
        { label: 'Underwriting', value: 2 },
      ],
      nextReviewStep: 'Review the largest stage with the team.',
    });
    expect(t.readOnly).toBe(true);
    expect(t.entityKind).toBe('chart');
    expect(resolveDrillThroughAction(t).kind).toBe('panel');
    expect(hasDrillThroughContent(t)).toBe(true);
    expect(t.detailSections[0].rows.map((r) => r.label)).toEqual(['Application', 'Underwriting']);
    expect(t.sourceCounts.map((c) => c.count)).toEqual([3, 2]);
    // The chart title must NOT leak into visible panel text (avoids cockpit
    // substring collisions); it is generic.
    expect(t.title).toBe('Chart details');
    expect(t.summary).not.toMatch(/Pipeline by stage/);
  });

  it('degrades to an honest, generic unavailable reason when all segments are zero', () => {
    const t = buildChartDrillThrough({
      chartTitle: 'Missing field concentration',
      surface: 'portfolio_command_center',
      segments: [{ label: 'A', value: 0 }],
    });
    const action = resolveDrillThroughAction(t);
    expect(action.kind).toBe('unavailable');
    if (action.kind === 'unavailable') {
      expect(action.reason).toBe('This chart has no contributing data in the current scope.');
      expect(action.reason).not.toMatch(/Missing field concentration/);
    }
  });

  it('segment-level target lists contributing rows or an honest unavailable reason', () => {
    const withRows = buildChartSegmentDrillThrough({
      chartTitle: 'Risk distribution', surface: 'team_ops_queue', segmentLabel: 'Blocked', value: 2,
      contributingRows: [{ label: 'Acme', value: 'blocked on collateral' }],
    });
    expect(resolveDrillThroughAction(withRows).kind).toBe('panel');
    const noRows = buildChartSegmentDrillThrough({
      chartTitle: 'Risk distribution', surface: 'team_ops_queue', segmentLabel: 'Clear', value: 5,
    });
    expect(resolveDrillThroughAction(noRows).kind).toBe('unavailable');
  });
});

describe('Phase 144C — chart primitives expose an opt-in drill-through disclosure', () => {
  it('VerticalBarChart renders a keyboard-accessible chart-details disclosure when opted in', () => {
    const { container } = render(
      <VerticalBarChart
        title="Pipeline by stage"
        subtitle="Deal count"
        data={[{ label: 'Application', value: 3 }, { label: 'Underwriting', value: 1 }]}
        drillThroughSurface="portfolio_command_center"
      />,
    );
    const details = container.querySelector('details[data-manager-chart-drilldown="vertical-bar-chart"]');
    expect(details).toBeTruthy();
    const summary = details!.querySelector('summary')!;
    expect(summary.getAttribute('aria-label')).toMatch(/view chart details/i);
    expect(summary.textContent).toMatch(/View chart details/);
    // The revealed panel renders a heading and the segment rows.
    expect(screen.getByRole('heading', { name: 'Chart details' })).toBeTruthy();
    // "Application" appears both as the bar label and as a panel detail row.
    expect(screen.getAllByText('Application').length).toBeGreaterThanOrEqual(2);
    // No write controls were introduced.
    expect(container.querySelectorAll('button, form, input').length).toBe(0);
  });

  it('does NOT render a disclosure when drillThroughSurface is omitted (additive, back-compatible)', () => {
    const { container } = render(
      <VerticalBarChart title="Pipeline by stage" data={[{ label: 'A', value: 1 }]} />,
    );
    expect(container.querySelector('details')).toBeNull();
  });

  it('DonutChart opted-in disclosure shows an honest unavailable reason when empty', () => {
    render(
      <DonutChart
        title="Risk distribution"
        segments={[{ label: 'Blocked', value: 0, tone: 'blocked' }, { label: 'Clear', value: 0, tone: 'clear' }]}
        drillThroughSurface="portfolio_command_center"
      />,
    );
    expect(screen.getByText('This chart has no contributing data in the current scope.')).toBeTruthy();
  });
});
