import { describe, it, expect, vi } from 'vitest';

// teamQueries.ts imports several generated Dataverse service modules at module scope; mock them
// so this pure-function test doesn't pull in the real (environment-dependent) generated SDK.
vi.mock('../generated/services/Cr664_loandealsService', () => ({ Cr664_loandealsService: {} }));
vi.mock('../generated/services/Cr664_bankersService', () => ({ Cr664_bankersService: {} }));
vi.mock('../generated/services/Cr664_dealtask1sService', () => ({ Cr664_dealtask1sService: {} }));
vi.mock('../generated/services/Cr664_documentchecklistsService', () => ({ Cr664_documentchecklistsService: {} }));
vi.mock('../generated/services/Cr664_creditmemo1sService', () => ({ Cr664_creditmemo1sService: {} }));
vi.mock('../generated/services/Cr664_creditmemodraftsectionsService', () => ({
  Cr664_creditmemodraftsectionsService: {},
}));

import { isPastDue } from './teamQueries';

/**
 * PR A remediation — teamQueries.ts's own `isPastDue` used to compare a raw `new Date(iso)`
 * (UTC midnight, for a date-only dueDate) against the exact current instant, disagreeing with
 * the calendar-safe work-queue primitive (src/shared/workQueue/primitives.ts's isPastDue) on the
 * very same Team Workspace page (TeamDocumentNeeds.tsx / TeamTaskLoad.tsx consume this one
 * directly; the work-queue card consumes the other) for a viewer west of UTC. Now both delegate
 * to the same shared calendar-day predicate, so they can no longer disagree.
 */
describe('teamQueries.isPastDue', () => {
  const NOW = new Date('2026-05-13T12:00:00Z');

  it('a date-only value due "today" is not overdue', () => {
    expect(isPastDue('2026-05-13', NOW)).toBe(false);
  });

  it('a date-only value due yesterday is overdue', () => {
    expect(isPastDue('2026-05-12', NOW)).toBe(true);
  });

  it('returns false for undefined', () => {
    expect(isPastDue(undefined, NOW)).toBe(false);
  });
});
