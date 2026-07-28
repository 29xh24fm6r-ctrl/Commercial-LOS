import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function read(rel: string) {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

function stripComments(src: string) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

describe('M365-2 read-only calendar governance', () => {
  it('BankerDealWorkspace mounts the calendar availability panel in the right rail', () => {
    const src = read('src/deals/BankerDealWorkspace.tsx');
    expect(src).toMatch(/DealCalendarAvailabilityPanel/);
    expect(src).toMatch(/data-deal-card="calendar-availability"/);
    expect(src).toMatch(/OutlookCalendarReadDiagnosticPanel/);
    expect(src).toMatch(/data-deal-card="calendar-read-diagnostic"/);
  });

  it('feature gate defaults disabled and names only disabled/live_read_only', () => {
    const src = read('src/calendar/outlookCalendarFeatureFlags.ts');
    expect(src).toMatch(/VITE_OUTLOOK_CALENDAR_READ_MODE/);
    expect(src).toMatch(/'disabled'/);
    expect(src).toMatch(/'live_read_only'/);
    expect(src).toMatch(/parseOutlookCalendarReadMode/);
  });

  it('calendar read code has no direct Graph/fetch or write operation transport', () => {
    const files = [
      'src/calendar/outlookCalendarFeatureFlags.ts',
      'src/calendar/bankerAvailability.ts',
      'src/calendar/outlookCalendarReadAdapter.ts',
      'src/calendar/DealCalendarAvailabilityPanel.tsx',
    ];
    for (const rel of files) {
      const src = stripComments(read(rel));
      expect(src, rel).not.toMatch(/fetch\s*\(/);
      expect(src, rel).not.toMatch(/XMLHttpRequest/);
      expect(src, rel).not.toMatch(/graph\.microsoft|microsoft-graph/i);
      expect(src, rel).not.toMatch(/CalendarPostItem|CalendarPatchItem|CalendarDeleteItem/);
    }
    const adapter = stripComments(read('src/calendar/outlookCalendarReadAdapter.ts'));
    expect(adapter).toMatch(/Office365OutlookService/);
    expect(adapter).toMatch(/GetEventsCalendarViewV3/);
    expect(adapter).toMatch(/CalendarGetTables/);
  });

  it('the UI says Prepare meeting proposal and never Schedule meeting', () => {
    const src = [
      read('src/calendar/DealCalendarAvailabilityPanel.tsx'),
      read('src/calendar/MeetingProposalControl.tsx'),
    ].join('\n');
    expect(src).toMatch(/Prepare meeting proposal/);
    expect(src).not.toMatch(/Schedule meeting/);
    expect(src).toMatch(/No Outlook calendar create\/update\/delete is executed/);
  });
});
