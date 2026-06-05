import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

import {
  FDIC_REMEDIATION_CONTROLS,
  FDIC_CONTROL_STATUSES,
  FDIC_PROHIBITED_STATUS_CLAIMS,
  isHonestFdicStatus,
} from '../fdic/fdicRemediationOperatingModel';
import { deriveFdicRemediationArchitectureSnapshot } from '../fdic/fdicRemediationArchitectureSnapshot';
import { getCopilotConnector } from '../../copilot/copilotConnector';

/**
 * Phase 140A — FDIC Remediation Operating Model governance.
 *
 * Pins the platform-wide guardrails for the FDIC remediation foundation:
 *   - the model files + docs exist;
 *   - only the four honest statuses are ever used (no fake compliance);
 *   - the FDIC docs never make an affirmative regulatory self-claim —
 *     prohibited vocabulary appears only inside an explicit negation /
 *     no-fake-compliance statement;
 *   - the FDIC source carries no Dataverse schema, write path, route, or
 *     entitlement change, and does not touch Copilot;
 *   - Copilot remains not_configured by default.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function readFile(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

function relForward(abs: string): string {
  return relative(REPO_ROOT, abs).split(sep).join('/');
}

const MODEL_FILES = [
  'src/shared/fdic/fdicRemediationOperatingModel.ts',
  'src/shared/fdic/fdicWorkspaceResponsibilityMap.ts',
  'src/shared/fdic/fdicEvidenceArchitecture.ts',
  'src/shared/fdic/fdicRemediationArchitectureSnapshot.ts',
  'src/shared/fdic/fdicRemediationRoadmap.ts',
] as const;

const DOCS = [
  'docs/PHASE_140A_FDIC_REMEDIATION_OPERATING_MODEL.md',
  'docs/FDIC_REMEDIATION_PLATFORM_BLUEPRINT.md',
] as const;

// ---------------------------------------------------------------------------
// 1. Files + docs exist
// ---------------------------------------------------------------------------

describe('Phase 140A — model files and docs exist', () => {
  for (const rel of MODEL_FILES) {
    it(`${rel} exists on disk`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
  for (const rel of DOCS) {
    it(`${rel} exists on disk`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. No fake-compliance terms are used as statuses
// ---------------------------------------------------------------------------

describe('Phase 140A — only honest statuses exist (no fake compliance as a status)', () => {
  it('the status enum is exactly the four honest statuses', () => {
    expect([...FDIC_CONTROL_STATUSES]).toEqual([
      'mapped_not_wired',
      'evidence_gap',
      'partially_wired',
      'wired_with_evidence',
    ]);
  });

  it('no honest status is a prohibited regulatory-conclusion word', () => {
    for (const s of FDIC_CONTROL_STATUSES) {
      expect(FDIC_PROHIBITED_STATUS_CLAIMS).not.toContain(s);
    }
  });

  it('no control uses a prohibited term as a status', () => {
    for (const c of FDIC_REMEDIATION_CONTROLS) {
      expect(isHonestFdicStatus(c.currentStatus)).toBe(true);
    }
  });

  it('the snapshot only ever emits honest statuses and never claims wiring it cannot back', () => {
    const snap = deriveFdicRemediationArchitectureSnapshot();
    expect(snap.wiredWithEvidenceCount).toBe(0);
    for (const row of snap.workspaceRows) {
      // counts are non-negative and bucketed only into honest statuses
      expect(row.wiredWithEvidenceCount).toBe(0);
    }
    for (const gap of snap.topEvidenceGaps) {
      expect(isHonestFdicStatus(gap.effectiveStatus)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. No affirmative regulatory self-claims in the FDIC docs
// ---------------------------------------------------------------------------

describe('Phase 140A — FDIC docs make no affirmative compliance claim', () => {
  // Prohibited regulatory-conclusion vocabulary. Each may appear ONLY on a
  // line that also negates / prohibits it.
  const CLAIM_TERMS: readonly RegExp[] = [
    /\bcompliant\b/i,
    /\bremediated\b/i,
    /\bFDIC[\s-]approved\b/i,
    /\bexaminer[\s-]ready\b/i,
  ];
  // Negation / prohibition context tokens that make a claim line honest.
  const NEGATION = /\b(never|not|no|without|prohibit|prohibited|cannot|unless|refuse|presence|input|does not|n't)\b/i;

  for (const rel of DOCS) {
    it(`${rel} only mentions claim vocabulary inside a negation/prohibition`, () => {
      const lines = readFile(rel).split(/\r?\n/);
      const offenders: string[] = [];
      lines.forEach((line, i) => {
        const hasClaim = CLAIM_TERMS.some((re) => re.test(line));
        if (hasClaim && !NEGATION.test(line)) {
          offenders.push(`${rel}:${i + 1} — ${line.trim().slice(0, 120)}`);
        }
      });
      expect(
        offenders,
        `Affirmative compliance claim(s) found:\n${offenders.join('\n')}\n` +
          'Reword as a negation or move into the No-fake-compliance section.',
      ).toEqual([]);
    });

    it(`${rel} states the no-fake-compliance rule`, () => {
      const doc = readFile(rel);
      expect(doc).toMatch(/no fake compliance/i);
      expect(doc).toMatch(/evidence is not (?:automatically )?compliance|does not equal remediation/i);
    });
  }
});

// ---------------------------------------------------------------------------
// 4. No Dataverse schema / write / route / entitlement / Copilot changes in FDIC source
// ---------------------------------------------------------------------------

function fdicSourceFiles(): string[] {
  const dir = resolve(REPO_ROOT, 'src/shared/fdic');
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = resolve(dir, entry);
    if (!statSync(abs).isFile()) continue;
    if (!entry.endsWith('.ts')) continue;
    if (entry.endsWith('.test.ts')) continue;
    out.push(abs);
  }
  return out;
}

describe('Phase 140A — FDIC source is a pure static model (no schema/write/route/copilot)', () => {
  const FORBIDDEN: readonly { id: string; pattern: RegExp }[] = [
    { id: 'dataverse-write', pattern: /\b(createRecord|updateRecord|deleteRecord|saveRecord)\b/ },
    { id: 'network', pattern: /\b(fetch|XMLHttpRequest)\s*\(/ },
    { id: 'dataset-write', pattern: /\.save\s*\(|\bopenDatasetItem\b/ },
    { id: 'migration-schema', pattern: /\b(apply_migration|EntityMetadata|AttributeMetadata|addColumn|alterTable)\b/ },
    { id: 'router', pattern: /\b(useNavigate|react-router|createBrowserRouter)\b/ },
    { id: 'entitlement', pattern: /\b(entitlement|Entitlement|AuthGate|grantAccess)\b/ },
    { id: 'copilot', pattern: /\bcopilot\b/i },
  ];

  const files = fdicSourceFiles();

  it('discovers the five FDIC model source files', () => {
    expect(files.length).toBe(5);
  });

  for (const rule of FORBIDDEN) {
    it(`[${rule.id}] no FDIC source file matches`, () => {
      const hits: string[] = [];
      for (const abs of files) {
        const src = readFileSync(abs, 'utf8');
        if (rule.pattern.test(src)) hits.push(relForward(abs));
      }
      expect(hits, `rule [${rule.id}] matched: ${hits.join(', ')}`).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// 5. Copilot remains not_configured (untouched by 140A)
// ---------------------------------------------------------------------------

describe('Phase 140A — Copilot remains not_configured', () => {
  it('the default connector mode is not_configured', () => {
    expect(getCopilotConnector().status().mode).toBe('not_configured');
  });
});
