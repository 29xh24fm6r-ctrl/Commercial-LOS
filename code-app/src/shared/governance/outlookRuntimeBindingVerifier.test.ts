import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const OUTLOOK_SCRIPT = resolve(REPO_ROOT, 'scripts/activation/verify-outlook-connector.ps1');
const M365_SCRIPT = resolve(REPO_ROOT, 'scripts/activation/verify-microsoft365-integration.ps1');

function makeFixture(options: {
  service?: boolean;
  powerConfig?: boolean;
  runtime?: 'absent' | 'missing-office365' | 'office365-connector';
  teams?: boolean;
}) {
  const root = mkdtempSync(join(tmpdir(), 'los-outlook-verifier-'));
  mkdirSync(join(root, 'src/generated/services'), { recursive: true });
  mkdirSync(join(root, 'microsoft365/teams'), { recursive: true });

  if (options.service ?? true) {
    writeFileSync(join(root, 'src/generated/services/Office365OutlookService.ts'), 'export const Office365OutlookService = {};\n');
  }

  if (options.powerConfig ?? true) {
    writeFileSync(
      join(root, 'power.config.json'),
      JSON.stringify(
        {
          connectionReferences: {
            'masked-reference-id': {
              id: '/providers/Microsoft.PowerApps/apis/shared_office365',
              displayName: 'Office 365 Outlook',
              dataSources: ['office365'],
            },
          },
        },
        null,
        2,
      ),
    );
  } else {
    writeFileSync(join(root, 'power.config.json'), JSON.stringify({ connectionReferences: {} }, null, 2));
  }

  if (options.runtime && options.runtime !== 'absent') {
    mkdirSync(join(root, '.power/schemas/appschemas'), { recursive: true });
    const runtimeText =
      options.runtime === 'office365-connector'
        ? `export const dataSourcesInfo = {
  "office365": {
    "tableId": "",
    "version": "",
    "primaryKey": "",
    "dataSourceType": "Connector",
    "apis": {}
  }
};\n`
        : `export const dataSourcesInfo = {
  "loandeals": {
    "dataSourceType": "Dataverse",
    "apis": {}
  }
};\n`;
    writeFileSync(join(root, '.power/schemas/appschemas/dataSourcesInfo.ts'), runtimeText);
  }

  if (options.teams ?? false) {
    writeFileSync(
      join(root, 'microsoft365/teams/manifest.template.json'),
      JSON.stringify(
        {
          id: '63858e09-3d0b-47c9-b1d2-65cef742fda4',
          staticTabs: [
            {
              contentUrl:
                'https://apps.powerapps.com/play/e/5f2d77a5-de50-edeb-9d74-5b2400a2320d/app/63858e09-3d0b-47c9-b1d2-65cef742fda4?tenantId=e5d2be43-2e2c-4968-b5f3-c73dd825ee80',
              websiteUrl:
                'https://apps.powerapps.com/play/e/5f2d77a5-de50-edeb-9d74-5b2400a2320d/app/63858e09-3d0b-47c9-b1d2-65cef742fda4?tenantId=e5d2be43-2e2c-4968-b5f3-c73dd825ee80',
            },
          ],
          validDomains: ['apps.powerapps.com'],
          authorization: { permissions: { resourceSpecific: [] } },
          webApplicationInfo: { resource: 'https://apps.powerapps.com' },
        },
        null,
        2,
      ),
    );
  }

  return root;
}

function runPowerShell(script: string, args: string[], fixture: string) {
  const result = spawnSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-RepoRoot', fixture, ...args],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );
  return {
    status: result.status ?? 0,
    stdout: result.stdout,
    stderr: result.stderr,
    combined: `${result.stdout}\n${result.stderr}`,
  };
}

function withFixture<T>(
  options: Parameters<typeof makeFixture>[0],
  fn: (fixture: string) => T,
): T {
  const fixture = makeFixture(options);
  try {
    return fn(fixture);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

describe('Outlook runtime binding verifier', () => {
  it('generated service missing => BLOCKED', () => {
    withFixture({ service: false, powerConfig: true, runtime: 'office365-connector' }, (fixture) => {
      const result = runPowerShell(OUTLOOK_SCRIPT, [], fixture);
      expect(result.status).toBe(1);
      expect(result.combined).toMatch(/CONFIGURED=BLOCKED/);
      expect(result.combined).toMatch(/STATUS=BLOCKED/);
    });
  });

  it('power.config Outlook registration missing => BLOCKED', () => {
    withFixture({ service: true, powerConfig: false, runtime: 'office365-connector' }, (fixture) => {
      const result = runPowerShell(OUTLOOK_SCRIPT, [], fixture);
      expect(result.status).toBe(1);
      expect(result.combined).toMatch(/CONFIGURED=BLOCKED/);
      expect(result.combined).toMatch(/STATUS=BLOCKED/);
    });
  });

  it('config present + runtime manifest present + office365 missing => BLOCKED', () => {
    withFixture({ service: true, powerConfig: true, runtime: 'missing-office365' }, (fixture) => {
      const result = runPowerShell(OUTLOOK_SCRIPT, [], fixture);
      expect(result.status).toBe(1);
      expect(result.combined).toMatch(/CONFIGURED=PASS/);
      expect(result.combined).toMatch(/RUNTIME_BOUND=BLOCKED/);
      expect(result.combined).toMatch(/power\.config\.json alone is not runtime binding proof/i);
      expect(result.combined).toMatch(/STATUS=BLOCKED/);
    });
  });

  it('config present + runtime manifest present + office365 Connector => runtime PASS', () => {
    withFixture({ service: true, powerConfig: true, runtime: 'office365-connector' }, (fixture) => {
      const result = runPowerShell(OUTLOOK_SCRIPT, [], fixture);
      expect(result.status).toBe(0);
      expect(result.combined).toMatch(/CONFIGURED=PASS/);
      expect(result.combined).toMatch(/RUNTIME_BOUND=PASS/);
      expect(result.combined).toMatch(/STATUS=PASS/);
    });
  });

  it('runtime manifest absent => UNKNOWN with actionable guidance', () => {
    withFixture({ service: true, powerConfig: true, runtime: 'absent' }, (fixture) => {
      const result = runPowerShell(OUTLOOK_SCRIPT, [], fixture);
      expect(result.status).toBe(0);
      expect(result.combined).toMatch(/CONFIGURED=PASS/);
      expect(result.combined).toMatch(/RUNTIME_BOUND=UNKNOWN/);
      expect(result.combined).toMatch(/generate\/sync .*dataSourcesInfo\.ts/i);
      expect(result.combined).toMatch(/STATUS=UNKNOWN/);
    });
  });

  it('connector acceptance language never claims delivery', () => {
    withFixture({ service: true, powerConfig: true, runtime: 'office365-connector' }, (fixture) => {
      const result = runPowerShell(OUTLOOK_SCRIPT, ['-ManualConnectorAccepted'], fixture);
      expect(result.status).toBe(0);
      expect(result.combined).toMatch(/manual connector accepted evidence supplied: True/);
      expect(result.combined).toMatch(/LIVE_CERTIFIED=UNKNOWN/);
      expect(result.combined).toMatch(/delivery is NOT certified/i);
      expect(result.combined).not.toMatch(/delivered/i);
    });
  });

  it('live certification requires explicit manual inbox-receipt evidence', () => {
    withFixture({ service: true, powerConfig: true, runtime: 'office365-connector' }, (fixture) => {
      const acceptedOnly = runPowerShell(OUTLOOK_SCRIPT, ['-ManualConnectorAccepted'], fixture);
      expect(acceptedOnly.combined).toMatch(/LIVE_CERTIFIED=UNKNOWN/);

      const receiptConfirmed = runPowerShell(
        OUTLOOK_SCRIPT,
        ['-ManualConnectorAccepted', '-ManualInboxReceiptConfirmed'],
        fixture,
      );
      expect(receiptConfirmed.status).toBe(0);
      expect(receiptConfirmed.combined).toMatch(/LIVE_CERTIFIED=PASS/);
    });
  });

  it('Microsoft 365 predeployment switch blocks when runtime manifest exists without office365', () => {
    withFixture({ service: true, powerConfig: true, runtime: 'missing-office365', teams: true }, (fixture) => {
      const result = runPowerShell(M365_SCRIPT, ['-RequireOutlookRuntimeBinding'], fixture);
      expect(result.status).toBe(1);
      expect(result.combined).toMatch(/RUNTIME_BOUND=BLOCKED/);
      expect(result.combined).toMatch(/Outlook runtime binding required/);
      expect(result.combined).toMatch(/STATUS=BLOCKED/);
    });
  });

  it('Microsoft 365 predeployment switch reports UNKNOWN when runtime manifest is absent', () => {
    withFixture({ service: true, powerConfig: true, runtime: 'absent', teams: true }, (fixture) => {
      const result = runPowerShell(M365_SCRIPT, ['-RequireOutlookRuntimeBinding'], fixture);
      expect(result.status).toBe(0);
      expect(result.combined).toMatch(/RUNTIME_BOUND=UNKNOWN/);
      expect(result.combined).toMatch(/runtime manifest absent/i);
      expect(result.combined).toMatch(/STATUS=UNKNOWN/);
    });
  });

  it('verifiers remain read-only and contain no deployment, registration, send, or mutation command', () => {
    const verifierText = [
      readFileSync(OUTLOOK_SCRIPT, 'utf8'),
      readFileSync(M365_SCRIPT, 'utf8'),
    ].join('\n');

    expect(verifierText).not.toMatch(/\bpac code push\b/i);
    expect(verifierText).not.toMatch(/\bpac code add-data-source\b/i);
    expect(verifierText).not.toMatch(/\bSendEmailV2\b/i);
    expect(verifierText).not.toMatch(/\bSet-Content\b|\bAdd-Content\b|\bOut-File\b|\bNew-Item\b|\bRemove-Item\b|\bMove-Item\b/i);
    expect(verifierText).not.toMatch(/\bInvoke-RestMethod\b|\bInvoke-WebRequest\b/i);
  });
});
