import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const PACKAGE_SCRIPT = resolve(REPO_ROOT, 'scripts/microsoft365/build-teams-package.ps1');
const M365_SCRIPT = resolve(REPO_ROOT, 'scripts/activation/verify-microsoft365-integration.ps1');

function run(script: string, fixture: string, extra: string[] = []) {
  const result = spawnSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-RepoRoot', fixture, ...extra],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );
  return { status: result.status ?? 0, text: `${result.stdout}\n${result.stderr}` };
}

function copyFixture(mutator?: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'los-teams-package-'));
  mkdirSync(join(root, 'microsoft365/teams'), { recursive: true });
  mkdirSync(join(root, 'scripts/microsoft365'), { recursive: true });
  mkdirSync(join(root, 'scripts/activation'), { recursive: true });
  mkdirSync(join(root, 'src/generated/services'), { recursive: true });
  mkdirSync(join(root, 'src/generated/models'), { recursive: true });
  mkdirSync(join(root, '.power/schemas/appschemas'), { recursive: true });
  writeFileSync(join(root, 'microsoft365/teams/manifest.template.json'), readFileSync(resolve(REPO_ROOT, 'microsoft365/teams/manifest.template.json')));
  writeFileSync(join(root, 'microsoft365/teams/outline.png'), readFileSync(resolve(REPO_ROOT, 'microsoft365/teams/outline.png')));
  writeFileSync(join(root, 'microsoft365/teams/color.png'), readFileSync(resolve(REPO_ROOT, 'microsoft365/teams/color.png')));
  writeFileSync(join(root, 'scripts/microsoft365/build-teams-package.ps1'), readFileSync(PACKAGE_SCRIPT));
  writeFileSync(join(root, 'scripts/activation/verify-microsoft365-integration.ps1'), readFileSync(M365_SCRIPT));
  writeFileSync(join(root, 'scripts/activation/verify-outlook-connector.ps1'), readFileSync(resolve(REPO_ROOT, 'scripts/activation/verify-outlook-connector.ps1')));
  writeFileSync(join(root, 'scripts/activation/verify-outlook-calendar-connector.ps1'), readFileSync(resolve(REPO_ROOT, 'scripts/activation/verify-outlook-calendar-connector.ps1')));
  writeFileSync(join(root, 'src/generated/services/Office365OutlookService.ts'), readFileSync(resolve(REPO_ROOT, 'src/generated/services/Office365OutlookService.ts')));
  writeFileSync(join(root, 'src/generated/models/Office365OutlookModel.ts'), readFileSync(resolve(REPO_ROOT, 'src/generated/models/Office365OutlookModel.ts')));
  writeFileSync(join(root, 'src/generated/index.ts'), "export * as Office365OutlookModel from './models/Office365OutlookModel';\nexport * from './services/Office365OutlookService';\n");
  writeFileSync(join(root, 'power.config.json'), JSON.stringify({ connectionReferences: { masked: { id: '/providers/Microsoft.PowerApps/apis/shared_office365', dataSources: ['office365'] } } }));
  writeFileSync(join(root, '.power/schemas/appschemas/dataSourcesInfo.ts'), 'export const dataSourcesInfo = { "office365": { "dataSourceType": "Connector", "apis": {} } };\n');
  mutator?.(root);
  return root;
}

describe('M365-4 Teams package validation', () => {
  it('valid package inputs pass ValidateOnly and create no zip', () => {
    const root = copyFixture();
    try {
      const result = run(PACKAGE_SCRIPT, root, ['-ValidateOnly']);
      expect(result.status).toBe(0);
      expect(result.text).toMatch(/STATUS=PASS/);
      expect(existsSync(join(root, 'dist/microsoft365/teams/commercial-los-teams-app.zip'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('bad icon dimensions fail validation', () => {
    const root = copyFixture((fixture) => {
      writeFileSync(join(fixture, 'microsoft365/teams/outline.png'), readFileSync(resolve(REPO_ROOT, 'microsoft365/teams/color.png')));
    });
    try {
      const result = run(PACKAGE_SCRIPT, root, ['-ValidateOnly']);
      expect(result.status).toBe(1);
      expect(result.text).toMatch(/outline width\s+expected 32/i);
      expect(result.text).toMatch(/STATUS=BLOCKED/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('build writes a zip under dist with exactly the intended root files', () => {
    const root = copyFixture();
    try {
      const result = run(PACKAGE_SCRIPT, root);
      expect(result.status).toBe(0);
      expect(result.text).toMatch(/entries=color.png,manifest.json,outline.png/);
      expect(result.text).toMatch(/PACKAGE_SHA256=[A-F0-9]{64}/);
      expect(existsSync(join(root, 'dist/microsoft365/teams/commercial-los-teams-app.zip'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('Microsoft 365 verifier can require Teams package readiness without upload', () => {
    const root = copyFixture();
    try {
      const result = run(M365_SCRIPT, root, ['-RequireOutlookRuntimeBinding', '-RequireCalendarRuntimeBinding', '-RequireTeamsPackage']);
      expect(result.status).toBe(0);
      expect(result.text).toMatch(/teamsPackage=PASS/);
      expect(result.text).toMatch(/validateOnly=True/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('package script never uploads or calls tenant APIs', () => {
    const src = readFileSync(PACKAGE_SCRIPT, 'utf8');
    expect(src).not.toMatch(/teams app upload|graph\.microsoft|Invoke-RestMethod|Invoke-WebRequest|pac code push/i);
    expect(src).toMatch(/Compress-Archive/);
    expect(src).toMatch(/Get-FileHash/);
    expect(src).toMatch(/dist\\microsoft365\\teams/);
  });

  it('documents tenant activation, assignment, hash evidence, and rollback', () => {
    const doc = readFileSync(resolve(REPO_ROOT, 'docs/governance/M365_A5_TEAMS_APP_ACTIVATION_PACKAGE_2026-07-28.md'), 'utf8');
    expect(doc).toMatch(/PACKAGE_SHA256/);
    expect(doc).toMatch(/Tenant upload checklist/);
    expect(doc).toMatch(/Rollback/);
  });
});
