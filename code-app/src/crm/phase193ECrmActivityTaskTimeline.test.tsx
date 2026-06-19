// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { deriveCrmTimeline, buildCrmActivityCreateRequest } from './crmActivityTaskModel';
import { CrmActivityTimeline } from './CrmActivityTimeline';
import type { CrmActivity, CrmTask } from './crmSalesforceSpineModel';

/** Phase 193E — activities / tasks / timeline. */

const activity: CrmActivity = { id: 'a-1', subjectEntityType: 'cr664_crmorganization', subjectEntityId: 'org-1', activityType: 'call', occurredAt: '2026-02-01T00:00:00Z', summary: 'Intro call', origin: 'seeded-spine', backingLogicalName: 'cr664_crmtimelineevent' };
const olderActivity: CrmActivity = { ...activity, id: 'a-2', occurredAt: '2026-01-01T00:00:00Z', summary: 'Older note', activityType: 'note' };
const openTask: CrmTask = { id: 't-1', subjectEntityType: 'cr664_crmorganization', subjectEntityId: 'org-1', title: 'Follow up', status: 'open', dueDate: '2026-01-15T00:00:00Z', origin: 'seeded-spine', backingLogicalName: 'cr664_crmtask' };

describe('timeline view-model', () => {
  it('sorts dated entries newest-first and counts tasks', () => {
    const vm = deriveCrmTimeline({ activities: [olderActivity, activity], tasks: [openTask], nowIso: '2026-03-01T00:00:00Z' });
    expect(vm.entries[0].id).toBe('a-1');
    expect(vm.activityCount).toBe(2);
    expect(vm.taskCount).toBe(1);
    expect(vm.openTaskCount).toBe(1);
    expect(vm.overdueTaskCount).toBe(1); // due 2026-01-15 < now 2026-03-01
  });

  it('does not compute overdue without a reference time (no fabrication)', () => {
    const vm = deriveCrmTimeline({ tasks: [openTask] });
    expect(vm.overdueTaskCount).toBe(0);
  });

  it('reports an empty (not fabricated) history with no records', () => {
    const vm = deriveCrmTimeline({});
    expect(vm.hasHistory).toBe(false);
    expect(vm.emptyCopy).toMatch(/not fabricated/i);
  });
});

describe('activity write-request builder', () => {
  it('builds a gated persistence request with required name + provenance', () => {
    const req = buildCrmActivityCreateRequest({ name: 'Intro call', subjectEntityType: 'cr664_crmorganization', subjectEntityId: 'org-1', sourceFacts: [{ statement: 'operator logged', sourceLogicalName: null, sourceRecordId: null }] });
    expect(req.entity).toBe('activity');
    expect(req.fields.cr664_name).toBe('Intro call');
    expect(req.sourceFacts.length).toBe(1);
  });
});

describe('timeline UI', () => {
  it('renders the timeline entries and overdue badge', () => {
    render(<CrmActivityTimeline input={{ activities: [activity], tasks: [openTask], nowIso: '2026-03-01T00:00:00Z' }} />);
    expect(screen.getByTestId('crm-activity-timeline').getAttribute('data-has-history')).toBe('true');
    expect(screen.getByTestId('crm-activity-timeline').getAttribute('data-overdue')).toBe('1');
    cleanup();
  });

  it('log-activity is disabled until the persistence gate is satisfied; create-task stays disabled', () => {
    const onLog = vi.fn();
    render(<CrmActivityTimeline input={{ activities: [activity] }} onLogActivity={onLog} />);
    const log = screen.getByTestId('crm-timeline-log-activity') as HTMLButtonElement;
    expect(log.disabled).toBe(true);
    fireEvent.click(log);
    expect(onLog).not.toHaveBeenCalled();
    expect((screen.getByTestId('crm-timeline-create-task') as HTMLButtonElement).disabled).toBe(true);
    cleanup();
  });

  it('log-activity fires when the persistence gate is satisfied', () => {
    const onLog = vi.fn();
    render(<CrmActivityTimeline input={{ activities: [activity] }} persistenceGateSatisfied onLogActivity={onLog} />);
    fireEvent.click(screen.getByTestId('crm-timeline-log-activity'));
    expect(onLog).toHaveBeenCalledTimes(1);
    cleanup();
  });
});
