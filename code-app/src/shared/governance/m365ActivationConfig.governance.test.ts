import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  M365_CONFIG_MATRIX,
  resolveM365ActivationConfig,
} from '../../microsoft365/m365ActivationConfig';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function read(rel: string) {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

describe('M365 activation configuration governance', () => {
  it('defaults every new Microsoft 365 production write gate disabled and malformed values fail closed', () => {
    expect(resolveM365ActivationConfig({})).toMatchObject({
      outlookCalendarReadMode: 'disabled',
      outlookCalendarWriteEnabled: false,
      teamsMeetingCreationEnabled: false,
      teamsChannelPostEnabled: false,
    });
    expect(resolveM365ActivationConfig({
      VITE_OUTLOOK_CALENDAR_READ_MODE: 'LIVE',
      VITE_OUTLOOK_CALENDAR_WRITE_ENABLED: 'yes',
      VITE_TEAMS_MEETING_CREATION_ENABLED: '1',
      VITE_TEAMS_CHANNEL_POST_ENABLED: 'TRUE ',
    })).toMatchObject({
      outlookCalendarReadMode: 'disabled',
      outlookCalendarWriteEnabled: false,
      teamsMeetingCreationEnabled: false,
      teamsChannelPostEnabled: true,
    });
  });

  it('has one canonical matrix row for every activation variable', () => {
    const names = M365_CONFIG_MATRIX.map((row) => row.variable);
    expect(names).toEqual([
      'VITE_OUTLOOK_CALENDAR_READ_MODE',
      'VITE_OUTLOOK_CALENDAR_WRITE_ENABLED',
      'VITE_TEAMS_MEETING_CREATION_ENABLED',
      'VITE_TEAMS_CHANNEL_POST_ENABLED',
      'VITE_TEAMS_CHANNEL_POST_TRANSPORT_ALIAS',
      'VITE_TEAMS_MEETING_TRANSPORT_ALIAS',
      'VITE_M365_ACTIVATION_POLICY_VERSION',
    ]);
    for (const row of M365_CONFIG_MATRIX) {
      expect(row.rollbackValue).toBeTruthy();
      expect(row.prerequisites).toBeTruthy();
    }
  });

  it('documents production values and keeps production M365 write gates disabled', () => {
    const doc = read('docs/governance/M365_ACTIVATION_CONFIGURATION_MATRIX_2026-07-28.md');
    for (const row of M365_CONFIG_MATRIX) expect(doc).toContain(row.variable);
    const production = read('.env.production');
    expect(production).toMatch(/VITE_OUTLOOK_CALENDAR_READ_MODE=disabled/);
    expect(production).toMatch(/VITE_OUTLOOK_CALENDAR_WRITE_ENABLED=false/);
    expect(production).toMatch(/VITE_TEAMS_MEETING_CREATION_ENABLED=false/);
    expect(production).toMatch(/VITE_TEAMS_CHANNEL_POST_ENABLED=false/);
  });

  it('routes old flag helpers through the canonical config layer', () => {
    expect(read('src/calendar/outlookCalendarFeatureFlags.ts')).toMatch(/m365ActivationConfig/);
    expect(read('src/calendar/meetingProposalFeatureFlags.ts')).toMatch(/m365ActivationConfig/);
    expect(read('src/teamsChannelPosting/teamsChannelPostFeatureFlags.ts')).toMatch(/m365ActivationConfig/);
  });
});
