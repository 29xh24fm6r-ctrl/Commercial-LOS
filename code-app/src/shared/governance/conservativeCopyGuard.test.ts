import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

/**
 * Phase 45: Conservative Banker-Facing Copy Regression Sweep.
 *
 * Static-source guard that pins a small, curated set of OVERCLAIM
 * phrases out of banker-visible source files. Each rule has a stated
 * reason and an explicit allowlist of files where the phrase is
 * permitted (governance prose, schema field renderers, the Phase 24
 * "No AI was used" truthful negation, etc.).
 *
 * The rules are intentionally PHRASE-based, not word-based, because
 * bare words like "failed" and "denied" appear legitimately in
 * outcome discriminants, audit enum values, and field names — places
 * the user never sees. Phrase-based matching captures the actual
 * overclaim patterns ("check failed", "is stale", "production-ready",
 * etc.) without producing false positives on structural code.
 *
 * Comments are stripped before scanning, so prose like "// never say
 * 'is stale'" inside a code comment does not trip the rule. Markdown
 * files are scanned as-is.
 *
 * Discipline:
 *   - This file does not change runtime behavior.
 *   - Adding a new allowlist entry requires a stated reason. A bare
 *     allowlist addition is a regression in itself.
 *   - The rule set is intentionally small. Pin the failure modes that
 *     have actually been observed; do not preemptively ban every
 *     adjacent word.
 */

// ---------------------------------------------------------------------------
// File-system helpers
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const IN_SCOPE_SOURCE_DIRS = [
  'src/banker',
  'src/manager',
  'src/team',
  'src/executive',
  'src/admin',
  'src/deals',
  'src/shared',
] as const;

const IN_SCOPE_DOC_FILES = [
  'docs/STABILIZATION_CHECKLIST.md',
  'docs/RELEASE_NOTES_PHASES_1_40.md',
  'docs/STAGE_GOVERNANCE.md',
  'docs/STAGE_PROGRESSION_ENABLEMENT_MAP.md',
] as const;

function isInScopeSource(name: string): boolean {
  if (name.endsWith('.test.ts') || name.endsWith('.test.tsx')) return false;
  return name.endsWith('.ts') || name.endsWith('.tsx');
}

function collectSourceFilesRecursive(dirAbs: string, out: string[]): void {
  for (const entry of readdirSync(dirAbs)) {
    const abs = resolve(dirAbs, entry);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      collectSourceFilesRecursive(abs, out);
    } else if (stat.isFile() && isInScopeSource(entry)) {
      out.push(abs);
    }
  }
}

function inScopeFiles(): string[] {
  const out: string[] = [];
  for (const rel of IN_SCOPE_SOURCE_DIRS) {
    collectSourceFilesRecursive(resolve(REPO_ROOT, rel), out);
  }
  for (const rel of IN_SCOPE_DOC_FILES) {
    out.push(resolve(REPO_ROOT, rel));
  }
  return out;
}

function relForward(abs: string): string {
  return relative(REPO_ROOT, abs).split(sep).join('/');
}

function readSource(absPath: string): string {
  return readFileSync(absPath, 'utf8');
}

/**
 * Strips line comments and block comments. Crude — does not try to
 * understand strings that contain comment-like text — but sufficient
 * for governance prose vs. visible-copy disambiguation. Markdown
 * files have no comment syntax and are returned as-is.
 */
function stripCommentsForCode(src: string, isMarkdown: boolean): string {
  if (isMarkdown) return src;
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

// ---------------------------------------------------------------------------
// Rule set
//
// Each rule pins a banker-visible overclaim pattern. The allowedFiles
// list names every file path (repo-relative, forward-slash) where the
// pattern is permitted, with a stated reason in `allowedFileReasons`.
// ---------------------------------------------------------------------------

interface CopyRule {
  id: string;
  description: string;
  pattern: RegExp;
  allowedFiles: readonly string[];
  allowedFileReasons: Readonly<Record<string, string>>;
}

const RULES: readonly CopyRule[] = [
  {
    id: 'is-stale',
    description:
      'Phase 26 conservative discipline: never state "is stale". ' +
      'Use "may be stale" or "review recommended".',
    pattern: /\bis\s+stale\b/i,
    allowedFiles: [],
    allowedFileReasons: {},
  },
  {
    id: 'production-ready',
    description:
      'No surface may claim "production-ready" while the Release ' +
      'Readiness Gate rolls up to "not ready to promote".',
    pattern: /\bproduction[\s-]ready\b/i,
    allowedFiles: ['docs/RELEASE_NOTES_PHASES_1_40.md'],
    allowedFileReasons: {
      'docs/RELEASE_NOTES_PHASES_1_40.md':
        'Release notes explicitly state "Not production-ready" as a governance assertion.',
    },
  },
  {
    id: 'check-failed',
    description:
      '"check failed" / "validation failed" overclaim. Use "flagged ' +
      'issues" or "needs review".',
    pattern: /\b(check|validation)\s+failed\b/i,
    allowedFiles: [],
    allowedFileReasons: {},
  },
  {
    id: 'buddy-decisioning',
    description:
      'Buddy never approves / clears / denies / rejects deals. ' +
      'Credit decisioning lives outside the app.',
    pattern:
      /\bbuddy\s+(approv(ed|es)|clear(ed|s)|den(ied|ies)|reject(ed|s)|decid(ed|es))\b/i,
    allowedFiles: [],
    allowedFileReasons: {},
  },
  {
    id: 'unwired-ai-claim',
    description:
      'Phase 24 invariant: no AI / model is used anywhere in the app. ' +
      'The only allowed mentions of "AI" are the explicit "No AI was ' +
      'used" disclaimers and the NOT_WIRED governance entries.',
    pattern: /\bAI\b/,
    allowedFiles: [
      'src/deals/creditMemoDraft.ts',
      'src/deals/CreditMemoDraftModal.tsx',
      'src/deals/CreditMemo.tsx',
      'src/deals/DealAutopilotPanel.tsx',
      'src/manager/ManagerAutopilotRollup.tsx',
      'src/banker/BankerAutopilotRollup.tsx',
      'src/team/TeamAutopilotRollup.tsx',
      'src/shared/governance/platformInventory.ts',
      'docs/STABILIZATION_CHECKLIST.md',
      'docs/RELEASE_NOTES_PHASES_1_40.md',
      'docs/STAGE_GOVERNANCE.md',
    ],
    allowedFileReasons: {
      'src/deals/creditMemoDraft.ts':
        'Phase 24 truthful negation: "No AI was used to produce this draft."',
      'src/deals/CreditMemoDraftModal.tsx':
        'Phase 24 banner: "Generated locally ... No AI was used."',
      'src/deals/CreditMemo.tsx':
        'Phase 73 truthful negation: ConsistencyReviewBlock states "Not AI" as a non-capability disclaimer next to the deterministic structured-field check.',
      'src/deals/DealAutopilotPanel.tsx':
        'Phase 80 truthful negation: the autopilot disclaimer states "never ... calls AI" so the banker is told explicitly that the suggestion list is deterministic — not a Copilot output.',
      'src/manager/ManagerAutopilotRollup.tsx':
        'Phase 81 truthful negation: the manager rollup disclaimer states "No AI or automated decisions" so the manager sees the same Phase 80 non-capability declaration on the team-level surface.',
      'src/banker/BankerAutopilotRollup.tsx':
        'Phase 82 truthful negation: the banker rollup disclaimer states "No AI or automated decisions" so the banker sees the same Phase 80 non-capability declaration on the personal Command Center rollup.',
      'src/team/TeamAutopilotRollup.tsx':
        'Phase 84 truthful negation: the team rollup disclaimer states "No AI or automated decisions" so the team member sees the same Phase 80 non-capability declaration on the shared-pipeline rollup.',
      'src/shared/governance/platformInventory.ts':
        'NOT_WIRED entry "ai-generation" plus reason text describing the deliberate non-capability.',
      'docs/STABILIZATION_CHECKLIST.md':
        'Governance prose: explicit non-goal documentation.',
      'docs/RELEASE_NOTES_PHASES_1_40.md':
        'Governance prose: enumerates AI as a not-wired capability.',
      'docs/STAGE_GOVERNANCE.md':
        'Explicit non-goal: "No AI orchestration".',
    },
  },
  {
    id: 'email-delivery-claim',
    description:
      'Phase 23 invariant: borrower update is local-only Copy-to-clipboard. ' +
      'No surface may claim an email was sent or delivered.',
    pattern:
      /\b(email\s+(sent|delivered)|sent\s+(an?\s+)?email|email\s+(was|has been)\s+(sent|delivered))\b/i,
    allowedFiles: ['docs/STABILIZATION_CHECKLIST.md'],
    allowedFileReasons: {
      'docs/STABILIZATION_CHECKLIST.md':
        'Governance prose: "No email sent" is a truthful negation of capability, matching the Phase-23 NOT_WIRED stance.',
    },
  },
  {
    id: 'upload-action-claim',
    description:
      'No document-upload pipeline exists (Phase 22). Banker-visible copy ' +
      'must not imply an upload action is available.',
    pattern:
      /\b(upload\s+(the|a|your)|click\s+to\s+upload|drag\s+(and\s+)?drop|attach\s+(a|the)\s+document)\b/i,
    allowedFiles: [],
    allowedFileReasons: {},
  },
  {
    id: 'stage-progression-implied',
    description:
      'Stage progression remains DELIBERATELY_BLOCKED. No surface may ' +
      'suggest Advance Stage is available outside files that DESCRIBE ' +
      'the blocked write.',
    pattern:
      /\b(advance\s+stage|promote\s+(the|this)\s+stage|move\s+to\s+next\s+stage)\b/i,
    allowedFiles: [
      'src/shared/governance/platformInventory.ts',
      'src/shared/governance/stageProgressionAvailability.ts',
      'src/admin/StageGovernanceDiagnostics.tsx',
      'docs/STAGE_GOVERNANCE.md',
      'docs/STAGE_PROGRESSION_ENABLEMENT_MAP.md',
      'docs/RELEASE_NOTES_PHASES_1_40.md',
      'docs/STABILIZATION_CHECKLIST.md',
    ],
    allowedFileReasons: {
      'src/shared/governance/platformInventory.ts':
        'DELIBERATELY_BLOCKED entry describes the Advance Stage write.',
      'src/shared/governance/stageProgressionAvailability.ts':
        'Future-extension contract describes the blocked write.',
      'src/admin/StageGovernanceDiagnostics.tsx':
        'Admin diagnostic card surfaces the blocked write as a governance row.',
      'docs/STAGE_GOVERNANCE.md':
        'Governance rationale; non-goals + future enablement path.',
      'docs/STAGE_PROGRESSION_ENABLEMENT_MAP.md':
        'Planning doc for the future Advance Stage write.',
      'docs/RELEASE_NOTES_PHASES_1_40.md':
        'Phase 28 narrative explains why progression is blocked.',
      'docs/STABILIZATION_CHECKLIST.md':
        'Governance assertion that progression remains blocked.',
    },
  },
];

// ---------------------------------------------------------------------------
// Rule runner
// ---------------------------------------------------------------------------

interface Hit {
  filePath: string;
  line: number;
  snippet: string;
}

function findHits(rule: CopyRule, files: string[]): Hit[] {
  const hits: Hit[] = [];
  for (const abs of files) {
    const relPath = relForward(abs);
    if (rule.allowedFiles.includes(relPath)) continue;
    const isMd = relPath.endsWith('.md');
    const src = stripCommentsForCode(readSource(abs), isMd);
    if (!rule.pattern.test(src)) continue;
    const lines = src.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (rule.pattern.test(lines[i]!)) {
        hits.push({
          filePath: relPath,
          line: i + 1,
          snippet: lines[i]!.trim().slice(0, 140),
        });
      }
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Tests — one per rule, plus an allowlist-hygiene check
// ---------------------------------------------------------------------------

describe('Phase 45 — conservative banker-facing copy', () => {
  const FILES = inScopeFiles();

  it('discovers at least one in-scope file (sanity check)', () => {
    expect(FILES.length).toBeGreaterThan(40);
  });

  for (const rule of RULES) {
    it(`[${rule.id}] ${rule.description}`, () => {
      const hits = findHits(rule, FILES);
      if (hits.length > 0) {
        const report = hits
          .map((h) => `  ${h.filePath}:${h.line} — ${h.snippet}`)
          .join('\n');
        throw new Error(
          `${hits.length} disallowed hit(s) for rule [${rule.id}]:\n${report}\n` +
            'If a hit is legitimate (e.g. governance prose describing the ' +
            'non-capability), add the file to allowedFiles WITH a stated ' +
            'reason in allowedFileReasons.',
        );
      }
    });
  }
});

describe('Phase 45 — allowlist hygiene', () => {
  it('every allowlisted file has a stated reason', () => {
    for (const rule of RULES) {
      for (const f of rule.allowedFiles) {
        const reason = rule.allowedFileReasons[f];
        expect(
          reason,
          `rule [${rule.id}] allowlisted ${f} without a reason`,
        ).toBeTruthy();
        expect(reason!.length, `rule [${rule.id}] reason for ${f} is too short`).toBeGreaterThan(
          20,
        );
      }
    }
  });

  it('every allowlisted file actually contains the rule pattern (no dead allowlist entries)', () => {
    for (const rule of RULES) {
      for (const f of rule.allowedFiles) {
        const abs = resolve(REPO_ROOT, f);
        const isMd = f.endsWith('.md');
        const src = stripCommentsForCode(readSource(abs), isMd);
        expect(
          rule.pattern.test(src),
          `rule [${rule.id}] allowlists ${f} but the file no longer matches — remove the allowlist entry.`,
        ).toBe(true);
      }
    }
  });

  it('rule ids are unique', () => {
    const ids = RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
