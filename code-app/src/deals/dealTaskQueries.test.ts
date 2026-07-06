import { describe, it, expect, vi } from 'vitest';

// dealTaskQueries statically imports the generated service (→ the Power Apps
// SDK). Stub it so this pure-mapper test collects without resolving the SDK.
vi.mock('../generated/services/Cr664_dealtask1sService', () => ({
  Cr664_dealtask1sService: { getAll: vi.fn() },
}));

import { mapDealTaskRow } from './dealTaskQueries';

/**
 * The cr664_AssignedTo systemuser lookup's display name comes from the
 * `_cr664_assignedto_value` FormattedValue annotation (the live SDK does not
 * populate the cr664_assignedtoname shadow field) — this is why the Tasks panel
 * showed "—" for the assignee.
 */

const ASSIGNEE_ANNOTATION = '_cr664_assignedto_value@OData.Community.Display.V1.FormattedValue';

describe('mapDealTaskRow — assignee name resolution', () => {
  it('reads the assignee name from the lookup FormattedValue annotation', () => {
    const row = mapDealTaskRow({
      cr664_dealtask1id: 't-1',
      cr664_taskname: 'Order flood determination',
      cr664_completed: false,
      cr664_duedate: '2026-08-01',
      _cr664_assignedto_value: 'sys-guid-1',
      [ASSIGNEE_ANNOTATION]: 'Matthew Paller',
      cr664_assignedtoname: undefined,
      modifiedon: '2026-07-06T12:00:00Z',
    });
    expect(row).toMatchObject({
      id: 't-1',
      title: 'Order flood determination',
      completed: false,
      dueDate: '2026-08-01',
      assigneeName: 'Matthew Paller',
      modifiedOn: '2026-07-06T12:00:00Z',
    });
  });

  it('falls back to the cr664_assignedtoname shadow field when the annotation is absent', () => {
    expect(
      mapDealTaskRow({ cr664_dealtask1id: 't-2', cr664_taskname: 'x', cr664_assignedtoname: 'Dana Banker' }).assigneeName,
    ).toBe('Dana Banker');
  });

  it('is undefined when neither the annotation nor the shadow name is present', () => {
    expect(mapDealTaskRow({ cr664_dealtask1id: 't-3', cr664_taskname: 'x' }).assigneeName).toBeUndefined();
  });

  it('never surfaces the raw systemuser guid as the assignee name', () => {
    const row = mapDealTaskRow({
      cr664_dealtask1id: 't-4',
      cr664_taskname: 'x',
      _cr664_assignedto_value: 'e056f0e7-4a13-f111-8406-6045bd07ee56',
    });
    expect(row.assigneeName).toBeUndefined();
  });
});
