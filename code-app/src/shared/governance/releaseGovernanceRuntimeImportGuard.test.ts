import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

/**
 * Factory Arc Phase 2 — release-governance/runtime-state isolation guard.
 *
 * Banker- and manager-facing models may consume ONLY `OperationalCapabilityState`
 * (src/shared/governance/operationalCapabilityState.ts). They must never import a
 * release-governance / launch-readiness model directly — those answer "is this
 * certified for release," a question only Admin / Platform Operations should be
 * able to ask. This test enforces that boundary at the import-graph level, not
 * just the rendered-copy level bankerFacingLaunchLanguageGuard.test.ts checks.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
// Factory Arc Phase 5 added src/portfolio (the manager/executive-facing portfolio
// analytics workspace — distinct from src/portfolioBoarding, the loan boarding
// workflow, already scanned) per that phase's explicit proof requirement.
// Factory Arc Phase 12 added src/crm and src/team — both are banker/team-reachable
// workspaces (Finding B) that were never in scope, which is precisely how a
// release-evidence import (crmCertificationAttribution.ts, since relocated to
// src/access/ where only Admin/Platform Operations code may live) went undetected.
// Factory Arc Phase 15 added src/executive — the executive dashboard is a real
// business-executive surface (distinct from Admin/Platform Operations), and this
// directory was never in scope for this guard even though
// executiveRestartReadinessModel.ts is a first-class tracked panel in
// crossPanelLaunchCoherence.test.ts. No live violation exists today (the file
// only imports feature-flag constants), but the gap was dormant, not provably
// safe, and matches the exact shape of the Phase 12 Finding B gap.
const SCAN_ROOTS = ['src/banker', 'src/manager', 'src/deals', 'src/portfolioBoarding', 'src/portfolio', 'src/crm', 'src/team', 'src/executive'];

const FORBIDDEN_IMPORT_PATTERNS: readonly RegExp[] = [
  // Factory Arc Phase 5 renamed fullSystemLaunchReadinessModel.ts to
  // releaseGovernanceSnapshot.ts; forbid both the retired and the current name.
  /fullSystemLaunchReadinessModel/,
  /releaseGovernanceSnapshot/,
  /fullActivationLaunchCertificationModel/,
  /v1GoLiveReleaseCertificationModel/,
  /operatorSmokeEvidenceRegistry/,
  /operatorLaunchConsoleModel/,
  /finalLaunchSmokeEvidence/,
  /finalV1ReleaseDecisionModel/,
  /launchReadiness/i,
  /finalLaunch/i,
];

/**
 * node:path's `relative`/`join` use the platform separator — backslashes on
 * Windows. SCAN_ROOTS and the sanity-check assertion below are written in
 * repo-relative POSIX form, so unnormalized paths break that assertion on
 * Windows and make every failure message inconsistent with the rest of this
 * codebase's path conventions. Normalizing at construction (inside
 * listSourceFiles, before any filtering/assertion/message use) avoids that
 * regardless of platform.
 *
 * Deliberately duplicated (not imported) from the identical helper in
 * bankerFacingLaunchLanguageGuard.test.ts: it's a one-line, dependency-free
 * function, and these two governance-guard test files are intentionally
 * self-contained (each owns its own SCAN_ROOTS/patterns/doc comments) —
 * sharing a module for one line would couple two independently-evolving
 * guards for no real benefit.
 */
function normalizeRepoPath(path: string): string {
  return path.replaceAll('\\', '/');
}

function listSourceFiles(dir: string): string[] {
  const abs = resolve(REPO_ROOT, dir);
  let entries: string[];
  try {
    entries = readdirSync(abs);
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const entryAbs = join(abs, entry);
    const stat = statSync(entryAbs);
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(normalizeRepoPath(relative(REPO_ROOT, entryAbs))));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry)) continue;
    files.push(normalizeRepoPath(relative(REPO_ROOT, entryAbs)));
  }
  return files;
}

function importSpecifiers(src: string): string[] {
  return (src.match(/from ['"]([^'"]+)['"]/g) ?? []).map((m) => m.replace(/^from ['"]|['"]$/g, ''));
}

describe('Release governance / runtime-state isolation (Factory Arc Phase 2)', () => {
  const files = SCAN_ROOTS.flatMap(listSourceFiles);

  it('scanned at least one known banker-facing file (sanity check the scan itself works)', () => {
    expect(files).toEqual(expect.arrayContaining(['src/banker/bankerOperatingCommandCenterModel.ts']));
  });

  for (const file of files) {
    it(`${file} does not import a release-governance / launch-readiness model`, () => {
      const src = readFileSync(resolve(REPO_ROOT, file), 'utf8');
      const specs = importSpecifiers(src).join('\n');
      for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
        expect(specs, `${file} imports something matching ${pattern}`).not.toMatch(pattern);
      }
    });
  }

  it('a banker-facing model may import OperationalCapabilityState (the allowed state domain)', () => {
    const src = readFileSync(resolve(REPO_ROOT, 'src/shared/governance/operationalCapabilityState.ts'), 'utf8');
    expect(src).toMatch(/export interface OperationalCapabilityState/);
    // ReleaseGovernanceState is co-located (Admin/Platform Operations only) but its mere
    // existence in this shared file is fine — the guard above is about banker/manager files
    // never importing an actual release-governance MODEL (fullSystemLaunchReadinessModel etc.),
    // not about this type declaration.
    expect(src).toMatch(/export interface ReleaseGovernanceState/);
  });
});
