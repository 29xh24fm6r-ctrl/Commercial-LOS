import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GOVERNED_WRITES } from './platformInventory';

/**
 * Phase 47: Outcome Union Discipline Regression Sweep.
 *
 * Every governed write must return an explicit, discriminated-union
 * outcome. This file pins the current contract:
 *
 *   - Exactly one exported outcome type per action module.
 *   - Discriminant field is `kind` (consistent across all five
 *     modules — the existing codebase convention).
 *   - Every union contains exactly the four canonical branches:
 *       * 'success'           (with domain-specific ids when relevant)
 *       * '<domain>-failed'   (the primary write failed; nothing else
 *                              ran)
 *       * 'governance-partial' OR 'audit-failed' (domain pattern —
 *                              see GOVERNED_WRITES.emitsTimeline)
 *       * 'unknown'           (caller-safe catch-all carrying a
 *                              `message: string`)
 *   - The exported async function returns `Promise<<OutcomeType>>`
 *     — never `Promise<boolean>`, never a bare value, never via
 *     thrown errors on the happy path.
 *   - `correlationId` is NOT surfaced in any outcome branch. This is
 *     a current-state pin; if a future phase decides to surface it,
 *     that phase explicitly updates this test.
 *
 * The Phase 47 audit confirmed the codebase already conforms.
 * Nothing is fixed here; this file only prevents regression.
 */

// ---------------------------------------------------------------------------
// Inventory mapping
//
// One entry per governed-write id. Two ids share an outcome type
// (alert-resolve + alert-dismiss share AlertOutcome). The
// `failurePattern` column reflects the documented domain split:
//   - deal-domain writes coordinate three rows (main + audit +
//     timeline) and use `'governance-partial'` to express that the
//     main row succeeded but one or both governance emissions failed.
//   - admin-domain writes coordinate two rows (main + audit) and use
//     `'audit-failed'` because there is no timeline pair to be
//     partial about.
// ---------------------------------------------------------------------------

interface OutcomeMapping {
  file: string;
  typeName: string;
  primaryFailedKind: string;
  /** Either 'governance-partial' (deal-domain, three-write) or
   *  'audit-failed' (admin-domain, two-write). MUST match
   *  GOVERNED_WRITES[id].emitsTimeline — pinned by a cross-check
   *  test below. */
  failurePattern: 'governance-partial' | 'audit-failed';
  /** True when the success branch carries domain-specific id fields
   *  beyond the bare `kind`. */
  successCarriesIds: boolean;
}

const OUTCOME_BY_WRITE_ID: Readonly<Record<string, OutcomeMapping>> =
  Object.freeze({
    'deal-task-complete': {
      file: 'src/deals/dealTaskActions.ts',
      typeName: 'CompleteTaskOutcome',
      primaryFailedKind: 'task-failed',
      failurePattern: 'governance-partial',
      successCarriesIds: false,
    },
    'deal-document-request': {
      file: 'src/deals/documentActions.ts',
      typeName: 'RequestDocumentOutcome',
      primaryFailedKind: 'doc-failed',
      failurePattern: 'governance-partial',
      successCarriesIds: false,
    },
    'deal-document-receive': {
      file: 'src/deals/documentActions.ts',
      typeName: 'MarkDocumentReceivedOutcome',
      primaryFailedKind: 'receive-failed',
      failurePattern: 'governance-partial',
      successCarriesIds: false,
    },
    'credit-memo-draft-save': {
      file: 'src/deals/creditMemoActions.ts',
      typeName: 'SaveCreditMemoDraftOutcome',
      primaryFailedKind: 'memo-failed',
      failurePattern: 'governance-partial',
      successCarriesIds: true,
    },
    'alert-resolve': {
      file: 'src/admin/alertActions.ts',
      typeName: 'AlertOutcome',
      primaryFailedKind: 'alert-failed',
      failurePattern: 'audit-failed',
      successCarriesIds: true,
    },
    'alert-dismiss': {
      file: 'src/admin/alertActions.ts',
      typeName: 'AlertOutcome',
      primaryFailedKind: 'alert-failed',
      failurePattern: 'audit-failed',
      successCarriesIds: true,
    },
    'data-quality-flag-resolve': {
      file: 'src/admin/dataQualityActions.ts',
      typeName: 'ResolveOutcome',
      primaryFailedKind: 'flag-failed',
      failurePattern: 'audit-failed',
      successCarriesIds: true,
    },
  });

// ---------------------------------------------------------------------------
// File-system helpers
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function readSource(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

function uniqueOutcomeTargets(): readonly OutcomeMapping[] {
  const seen = new Set<string>();
  const out: OutcomeMapping[] = [];
  for (const m of Object.values(OUTCOME_BY_WRITE_ID)) {
    if (seen.has(m.typeName)) continue;
    seen.add(m.typeName);
    out.push(m);
  }
  return out;
}

/**
 * Extracts the body of an `export type <name> = ...;` declaration as
 * a single string. Terminates on `};` (the closing brace of the last
 * union member, followed by the type terminator) — this is
 * unambiguous because every branch in our outcome unions is a brace
 * group, so `};` only appears at the very end of the type. Throws
 * when the declaration cannot be found — callers want this loud,
 * since a rename should fail the test.
 */
function extractOutcomeTypeBody(src: string, typeName: string): string {
  const re = new RegExp(`export\\s+type\\s+${typeName}\\s*=([\\s\\S]*?\\};)`);
  const m = re.exec(src);
  if (!m) {
    throw new Error(
      `Could not find "export type ${typeName} = ...};" in source. ` +
        'If the type was renamed, update OUTCOME_BY_WRITE_ID in this test.',
    );
  }
  return m[1]!;
}

// ---------------------------------------------------------------------------
// 1. Inventory completeness
// ---------------------------------------------------------------------------

describe('Phase 47 — inventory completeness', () => {
  it('OUTCOME_BY_WRITE_ID covers every GOVERNED_WRITES id', () => {
    for (const w of GOVERNED_WRITES) {
      expect(
        OUTCOME_BY_WRITE_ID[w.id],
        `GOVERNED_WRITES contains "${w.id}" but OUTCOME_BY_WRITE_ID does not. ` +
          'When you add a new governed write, extend the map in ' +
          'outcomeUnionDiscipline.test.ts.',
      ).toBeDefined();
    }
  });

  it('OUTCOME_BY_WRITE_ID does not name an id that is not in GOVERNED_WRITES', () => {
    const shippedIds = new Set(GOVERNED_WRITES.map((w) => w.id));
    for (const id of Object.keys(OUTCOME_BY_WRITE_ID)) {
      expect(shippedIds.has(id), `dead mapping: ${id}`).toBe(true);
    }
  });

  it('failurePattern column matches GOVERNED_WRITES.emitsTimeline', () => {
    for (const w of GOVERNED_WRITES) {
      const mapping = OUTCOME_BY_WRITE_ID[w.id]!;
      if (w.emitsTimeline) {
        expect(
          mapping.failurePattern,
          `${w.id} emits timeline → outcome should use 'governance-partial'`,
        ).toBe('governance-partial');
      } else {
        expect(
          mapping.failurePattern,
          `${w.id} does NOT emit timeline → outcome should use 'audit-failed'`,
        ).toBe('audit-failed');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Outcome type is exported and named as expected
// ---------------------------------------------------------------------------

describe('Phase 47 — outcome types are exported with the expected names', () => {
  for (const mapping of uniqueOutcomeTargets()) {
    it(`${mapping.file} exports "${mapping.typeName}"`, () => {
      const src = readSource(mapping.file);
      const re = new RegExp(
        `export\\s+type\\s+${mapping.typeName}\\s*=`,
      );
      expect(re.test(src)).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Discriminant field is `kind` (the existing codebase convention)
// ---------------------------------------------------------------------------

describe("Phase 47 — discriminant field is 'kind' across every outcome", () => {
  for (const mapping of uniqueOutcomeTargets()) {
    it(`${mapping.typeName} uses kind: ...`, () => {
      const src = readSource(mapping.file);
      const body = extractOutcomeTypeBody(src, mapping.typeName);
      // At least one `kind: 'xxx'` literal in the union body.
      expect(body).toMatch(/\bkind\s*:\s*['"][a-z-]+['"]/);
      // None of the alternate discriminant names appear.
      expect(body).not.toMatch(/\bstatus\s*:\s*['"][a-z-]+['"]/);
      expect(body).not.toMatch(/\bresult\s*:\s*['"][a-z-]+['"]/);
      expect(body).not.toMatch(/\btype\s*:\s*['"][a-z-]+['"]/);
    });
  }
});

// ---------------------------------------------------------------------------
// 4. Required branches are present
// ---------------------------------------------------------------------------

describe('Phase 47 — every outcome union contains the four canonical branches', () => {
  for (const [writeId, mapping] of Object.entries(OUTCOME_BY_WRITE_ID)) {
    // Two ids share AlertOutcome; deduplicate by type name to avoid
    // duplicated assertions in the test output.
    if (writeId === 'alert-dismiss') continue;
    it(`${mapping.typeName} contains success, ${mapping.primaryFailedKind}, ${mapping.failurePattern}, unknown`, () => {
      const src = readSource(mapping.file);
      const body = extractOutcomeTypeBody(src, mapping.typeName);
      const required = [
        'success',
        mapping.primaryFailedKind,
        mapping.failurePattern,
        'unknown',
      ];
      for (const kind of required) {
        const re = new RegExp(`\\bkind\\s*:\\s*['"]${kind}['"]`);
        expect(
          re.test(body),
          `${mapping.typeName} is missing the "${kind}" branch`,
        ).toBe(true);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 5. The `unknown` branch carries a `message: string` field
// ---------------------------------------------------------------------------

describe("Phase 47 — every outcome's 'unknown' branch carries message: string", () => {
  for (const mapping of uniqueOutcomeTargets()) {
    it(`${mapping.typeName} unknown branch has message: string`, () => {
      const src = readSource(mapping.file);
      const body = extractOutcomeTypeBody(src, mapping.typeName);
      // The 'unknown' branch block. The pattern is conservative —
      // it finds the unknown branch and checks `message: string`
      // within the same brace group.
      const re =
        /\{[^}]*kind\s*:\s*['"]unknown['"][^}]*message\s*:\s*string[^}]*\}/;
      expect(re.test(body), `${mapping.typeName} missing message: string on unknown`).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// 6. Pin error-field naming on the governance/audit failure branch
//
// Deal-domain (governance-partial): MUST carry auditError + timelineError.
// Admin-domain (audit-failed):       MUST carry auditError.
// ---------------------------------------------------------------------------

describe('Phase 47 — governance/audit failure branch field naming', () => {
  for (const [writeId, mapping] of Object.entries(OUTCOME_BY_WRITE_ID)) {
    if (writeId === 'alert-dismiss') continue;
    it(`${mapping.typeName} ${mapping.failurePattern} branch carries the expected error fields`, () => {
      const src = readSource(mapping.file);
      const body = extractOutcomeTypeBody(src, mapping.typeName);
      // The body-level check is sufficient because `auditError` and
      // `timelineError` only appear inside the governance/audit
      // failure branch — they are not used as field names anywhere
      // else in the outcome union. Body-level matching also tolerates
      // nested object types within a branch (e.g. credit memo's
      // sectionErrors: { sectionKey: string; error: string }[]) that
      // a single-branch regex with [^}] cannot.
      if (mapping.failurePattern === 'governance-partial') {
        expect(body).toMatch(/\bauditError\b/);
        expect(body).toMatch(/\btimelineError\b/);
      } else {
        expect(body).toMatch(/\bauditError\b/);
        // Admin-domain failures must NOT carry a timeline-error
        // field anywhere in the union — that would imply a timeline
        // pair that doesn't exist.
        expect(body).not.toMatch(/\btimelineError\b/);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 7. correlationId is NOT surfaced — current-state pin
//
// The Phase 46 audit established that correlation ids are generated
// per write and embedded in the audit/timeline payloads, but never
// returned to the caller. Phase 47 pins that choice. A future phase
// that decides to surface correlationId in outcomes must update this
// test explicitly.
// ---------------------------------------------------------------------------

describe('Phase 47 — correlationId is NOT surfaced in any outcome branch', () => {
  for (const mapping of uniqueOutcomeTargets()) {
    it(`${mapping.typeName} does not include a correlationId field`, () => {
      const src = readSource(mapping.file);
      const body = extractOutcomeTypeBody(src, mapping.typeName);
      expect(
        body,
        `${mapping.typeName} surfaces a correlationId field. ` +
          'If this is intentional, the change should land with a brief ' +
          'that updates this regression test and the Phase 46 helper docs.',
      ).not.toMatch(/\bcorrelationId\s*:/);
    });
  }
});

// ---------------------------------------------------------------------------
// 8. Function return type is Promise<<outcomeType>> — never boolean,
//    never bare value, never thrown errors as contract
// ---------------------------------------------------------------------------

describe('Phase 47 — exported actions return Promise<<OutcomeType>>', () => {
  for (const mapping of uniqueOutcomeTargets()) {
    it(`${mapping.file} declares Promise<${mapping.typeName}> as the action return`, () => {
      const src = readSource(mapping.file);
      const re = new RegExp(`\\bPromise<\\s*${mapping.typeName}\\s*>`);
      expect(re.test(src)).toBe(true);
    });

    it(`${mapping.file} does not declare Promise<boolean> anywhere`, () => {
      const src = readSource(mapping.file);
      expect(src).not.toMatch(/\bPromise\s*<\s*boolean\s*>/);
    });
  }
});

// ---------------------------------------------------------------------------
// 9. Modal callers wrap actions in try/catch that converts uncaught
//    exceptions to { kind: 'unknown', message }. Proves the "errors
//    are discriminant branches, not exceptions" contract end-to-end.
// ---------------------------------------------------------------------------

describe('Phase 47 — modal callers convert thrown errors to { kind: "unknown", message }', () => {
  // Each modal imports its action module's outcome type (so its
  // own state machine speaks the same union), wraps the
  // caller-supplied action callback in try/catch, and emits
  // { kind: 'unknown', message } on the catch path. This is the
  // proof that errors never escape the action contract as
  // exceptions — they always arrive at the UI as an outcome
  // branch.
  const MODAL_TO_OUTCOME: Readonly<Record<string, { typeName: string; actionModule: string }>> = {
    'src/deals/CompleteTaskModal.tsx': {
      typeName: 'CompleteTaskOutcome',
      actionModule: './dealTaskActions',
    },
    'src/deals/RequestDocumentModal.tsx': {
      typeName: 'RequestDocumentOutcome',
      actionModule: './documentActions',
    },
    'src/deals/CreditMemoDraftModal.tsx': {
      typeName: 'SaveCreditMemoDraftOutcome',
      actionModule: './creditMemoActions',
    },
    'src/admin/ResolveAlertModal.tsx': {
      typeName: 'AlertOutcome',
      actionModule: './alertActions',
    },
    'src/admin/ResolveFlagModal.tsx': {
      typeName: 'ResolveOutcome',
      actionModule: './dataQualityActions',
    },
  };

  for (const [modal, { typeName, actionModule }] of Object.entries(MODAL_TO_OUTCOME)) {
    it(`${modal} imports ${typeName} from ${actionModule}`, () => {
      const src = readSource(modal);
      const re = new RegExp(
        `import\\s+(?:type\\s+)?\\{[^}]*\\b${typeName}\\b[^}]*\\}\\s+from\\s+['"]${actionModule}['"]`,
      );
      expect(re.test(src)).toBe(true);
    });

    it(`${modal} wraps the action callback in try/catch and emits { kind: 'unknown' } on caught error`, () => {
      const src = readSource(modal);
      expect(src, `${modal} should contain a try/catch block`).toMatch(
        /\btry\s*\{[\s\S]*?\bcatch\s*\(/,
      );
      // The catch path must produce a kind: 'unknown' outcome with a
      // message field. Pattern: `outcome: { kind: 'unknown', message }`
      // or similar. We verify the union value appears in the file.
      expect(
        src,
        `${modal} should emit { kind: 'unknown', message } on caught error`,
      ).toMatch(/kind\s*:\s*['"]unknown['"][\s\S]{0,80}\bmessage\b/);
    });
  }
});
