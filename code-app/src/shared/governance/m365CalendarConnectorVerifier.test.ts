import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const CALENDAR_SCRIPT = resolve(REPO_ROOT, 'scripts/activation/verify-outlook-calendar-connector.ps1');
const M365_SCRIPT = resolve(REPO_ROOT, 'scripts/activation/verify-microsoft365-integration.ps1');

const REAL_SERVICE = readFileSync(
  resolve(REPO_ROOT, 'src/generated/services/Office365OutlookService.ts'),
  'utf8',
);

function minimalService(methodNames: string[]) {
  return `export class Office365OutlookService {
${methodNames.map((name) => `  public static async ${name}(): Promise<unknown> { return {}; }`).join('\n')}
}\n`;
}

function makeFixture(options: {
  service?: string | false;
  model?: string | false;
  index?: boolean;
  powerConfig?: boolean;
  runtime?: 'absent' | 'missing-office365' | 'office365-connector';
  teams?: boolean;
}) {
  const root = mkdtempSync(join(tmpdir(), 'los-calendar-verifier-'));
  mkdirSync(join(root, 'src/generated/services'), { recursive: true });
  mkdirSync(join(root, 'src/generated/models'), { recursive: true });
  mkdirSync(join(root, 'microsoft365/teams'), { recursive: true });

  if (options.service !== false) {
    writeFileSync(
      join(root, 'src/generated/services/Office365OutlookService.ts'),
      options.service ?? REAL_SERVICE,
    );
  }
  if (options.model !== false) {
    writeFileSync(join(root, 'src/generated/models/Office365OutlookModel.ts'), options.model ?? 'export interface CalendarEventBackend {}\n');
  }
  if (options.index ?? true) {
    writeFileSync(
      join(root, 'src/generated/index.ts'),
      [
        "export * as Office365OutlookModel from './models/Office365OutlookModel';",
        "export * from './services/Office365OutlookService';",
      ].join('\n'),
    );
  }
  if (options.powerConfig ?? true) {
    writeFileSync(
      join(root, 'power.config.json'),
      JSON.stringify({
        connectionReferences: {
          masked: {
            id: '/providers/Microsoft.PowerApps/apis/shared_office365',
            dataSources: ['office365'],
          },
        },
      }),
    );
  } else {
    writeFileSync(join(root, 'power.config.json'), JSON.stringify({ connectionReferences: {} }));
  }
  if (options.runtime && options.runtime !== 'absent') {
    mkdirSync(join(root, '.power/schemas/appschemas'), { recursive: true });
    writeFileSync(
      join(root, '.power/schemas/appschemas/dataSourcesInfo.ts'),
      options.runtime === 'office365-connector'
        ? `export const dataSourcesInfo = { "office365": { "dataSourceType": "Connector", "apis": {} } };\n`
        : `export const dataSourcesInfo = { "loandeals": { "dataSourceType": "Dataverse", "apis": {} } };\n`,
    );
  }
  if (options.teams ?? false) {
    writeFileSync(
      join(root, 'microsoft365/teams/manifest.template.json'),
      JSON.stringify({
        id: '63858e09-3d0b-47c9-b1d2-65cef742fda4',
        staticTabs: [{
          contentUrl: 'https://apps.powerapps.com/play/e/5f2d77a5-de50-edeb-9d74-5b2400a2320d/app/63858e09-3d0b-47c9-b1d2-65cef742fda4?tenantId=e5d2be43-2e2c-4968-b5f3-c73dd825ee80',
          websiteUrl: 'https://apps.powerapps.com/play/e/5f2d77a5-de50-edeb-9d74-5b2400a2320d/app/63858e09-3d0b-47c9-b1d2-65cef742fda4?tenantId=e5d2be43-2e2c-4968-b5f3-c73dd825ee80',
        }],
        validDomains: ['apps.powerapps.com'],
        authorization: { permissions: { resourceSpecific: [] } },
        webApplicationInfo: { resource: 'https://apps.powerapps.com' },
      }),
    );
  }
  return root;
}

function run(script: string, fixture: string, extra: string[] = []) {
  const result = spawnSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-RepoRoot', fixture, ...extra],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );
  return { status: result.status ?? 0, text: `${result.stdout}\n${result.stderr}` };
}

function withFixture<T>(options: Parameters<typeof makeFixture>[0], fn: (fixture: string) => T) {
  const fixture = makeFixture(options);
  try {
    return fn(fixture);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

describe('M365-1 Outlook Calendar connector verifier', () => {
  it('missing generated service blocks', () => {
    withFixture({ service: false, runtime: 'office365-connector' }, (fixture) => {
      const result = run(CALENDAR_SCRIPT, fixture);
      expect(result.status).toBe(1);
      expect(result.text).toMatch(/CALENDAR_CONFIGURED=BLOCKED/);
      expect(result.text).toMatch(/STATUS=BLOCKED/);
    });
  });

  it('missing Outlook configuration blocks', () => {
    withFixture({ powerConfig: false, runtime: 'office365-connector' }, (fixture) => {
      const result = run(CALENDAR_SCRIPT, fixture);
      expect(result.status).toBe(1);
      expect(result.text).toMatch(/CALENDAR_CONFIGURED=BLOCKED/);
      expect(result.text).toMatch(/STATUS=BLOCKED/);
    });
  });

  it('runtime manifest present but office365 absent blocks', () => {
    withFixture({ runtime: 'missing-office365' }, (fixture) => {
      const result = run(CALENDAR_SCRIPT, fixture);
      expect(result.status).toBe(1);
      expect(result.text).toMatch(/CALENDAR_RUNTIME_BOUND=BLOCKED/);
      expect(result.text).toMatch(/office365 Connector entry is absent/);
    });
  });

  it('runtime manifest absent reports UNKNOWN', () => {
    withFixture({ runtime: 'absent' }, (fixture) => {
      const result = run(CALENDAR_SCRIPT, fixture);
      expect(result.status).toBe(0);
      expect(result.text).toMatch(/CALENDAR_RUNTIME_BOUND=UNKNOWN/);
      expect(result.text).toMatch(/STATUS=UNKNOWN/);
    });
  });

  it('required calendar read operations are identified from fixtures', () => {
    withFixture({
      service: minimalService(['CalendarGetTables', 'CalendarGetItems', 'CalendarGetItem', 'GetEventsCalendarView', 'FindMeetingTimes']),
      runtime: 'office365-connector',
    }, (fixture) => {
      const result = run(CALENDAR_SCRIPT, fixture);
      expect(result.text).toMatch(/CALENDAR_READ_OPERATIONS=PASS/);
      expect(result.text).toMatch(/CALENDAR_WRITE_OPERATIONS=UNKNOWN/);
    });
  });

  it('no operation is invented: missing FindMeetingTimes keeps read operations blocked', () => {
    withFixture({
      service: minimalService(['CalendarGetTables', 'CalendarGetItems', 'CalendarGetItem', 'GetEventsCalendarView']),
      runtime: 'office365-connector',
    }, (fixture) => {
      const result = run(CALENDAR_SCRIPT, fixture);
      expect(result.status).toBe(1);
      expect(result.text).toMatch(/CALENDAR_READ_OPERATIONS=BLOCKED/);
      expect(result.text).not.toMatch(/FindMeetingTimes_V9/);
    });
  });

  it('real generated service reports calendar read and write operations present', () => {
    withFixture({ runtime: 'office365-connector' }, (fixture) => {
      const result = run(CALENDAR_SCRIPT, fixture);
      expect(result.status).toBe(0);
      expect(result.text).toMatch(/CALENDAR_READ_OPERATIONS=PASS/);
      expect(result.text).toMatch(/CALENDAR_WRITE_OPERATIONS=PASS/);
    });
  });

  it('Microsoft 365 verifier can require calendar runtime binding', () => {
    withFixture({ runtime: 'office365-connector', teams: true }, (fixture) => {
      const result = run(M365_SCRIPT, fixture, ['-RequireOutlookRuntimeBinding', '-RequireCalendarRuntimeBinding']);
      expect(result.status).toBe(0);
      expect(result.text).toMatch(/CALENDAR_RUNTIME_BOUND=PASS/);
      expect(result.text).toMatch(/STATUS=PASS/);
    });
  });

  it('calendar verifier contains no deployment or live-write commands', () => {
    const text = readFileSync(CALENDAR_SCRIPT, 'utf8');
    expect(text).not.toMatch(/\bpac code push\b/i);
    expect(text).not.toMatch(/\bpac code add-data-source\b/i);
    expect(text).not.toMatch(/\bInvoke-RestMethod\b|\bInvoke-WebRequest\b/i);
    expect(text).not.toMatch(/\bSendEmailV2\b/i);
    expect(text).not.toMatch(/\bSet-Content\b|\bAdd-Content\b|\bOut-File\b|\bNew-Item\b|\bRemove-Item\b|\bMove-Item\b/i);
  });
});
