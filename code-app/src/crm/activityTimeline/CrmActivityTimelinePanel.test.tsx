// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CrmActivityTimelinePanel } from './CrmActivityTimelinePanel';
import { deriveCrmActivityTimeline } from './crmActivityTimelineModel';

const TIMELINE = deriveCrmActivityTimeline([
  { eventType: 'los_task', label: 'Collect financials', occurredAt: '2026-01-10' },
  { eventType: 'salesforce_activity_reference', label: 'SF call logged', occurredAt: '2026-01-20' },
]);

describe('Phase 143G — CrmActivityTimelinePanel', () => {
  it('renders the timeline rows and the read-only banner', () => {
    render(<CrmActivityTimelinePanel timeline={TIMELINE} />);
    expect(screen.getByText('CRM Relationship Timeline')).toBeTruthy();
    expect(screen.getByText('Collect financials')).toBeTruthy();
    expect(screen.getByText(/no email is sent/i)).toBeTruthy();
  });

  it('marks external references as reference only', () => {
    render(<CrmActivityTimelinePanel timeline={TIMELINE} />);
    expect(screen.getByText(/reference only/i)).toBeTruthy();
  });

  it('renders an honest empty state', () => {
    render(<CrmActivityTimelinePanel timeline={deriveCrmActivityTimeline([])} />);
    expect(screen.getByText(/No relationship timeline events available/i)).toBeTruthy();
  });

  it('exposes no buttons / forms and no external URL', () => {
    const { container } = render(<CrmActivityTimelinePanel timeline={TIMELINE} />);
    expect(container.querySelectorAll('button, form, input').length).toBe(0);
    expect(container.innerHTML).not.toMatch(/https?:\/\//);
  });
});
