import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GOVERNED_WRITES } from './platformInventory';
import {
  AUDIT_OUTCOME_FAILED,
  AUDIT_OUTCOME_SUCCEEDED,
} from './auditEnums';

/**
 * Phase 49: Audit Payload Schema Discipline Regression Sweep.
 *
 * Closes the audit-trail contract end-to-end:
 *   - Phase 46: correlation-id generation and propagation
 *   - Phase 47: governed-write outcome union shape
 *   - Phase 49 (this): audit-payload schema discipline
 *
 * Every governed write emits exactly one audit row per attempt
 * (success or failure). Phase 49 pins the schema fields that row
 * always carries.
 *
 * Note on field-name discrepancy with the Phase 49 brief:
 *   The brief listed `cr664_category`, `cr664_recordid`, and
 *   `cr664_outcome`. The actual Dataverse columns are
 *   `cr664_eventcategory`, `cr664_entityid`, and
 *   `cr664_outcomestatus`. The brief explicitly forbids schema work,
 *   so this test pins the schema field names the code already emits
 *   (and has emitted since Phase 18). The Phase 49 AAR records this
 *   discrepancy.
 */

// ---------------------------------------------------------------------------
// Inventory mapping
//
// Each governed-write id maps to its action source file and, for the
// audit-payload-specific properties we want to pin, the expected
// values:
//   - eventName: the cr664_auditeventname string literal
//   - linksToDeal: true when the audit payload includes a
//                  `cr664_LoanDeal@odata.bind` field. Deal-domain
//                  writes do; admin/configuration-domain writes
//                  don't (and must NOT — adding it would invent a
//                  spurious deal link).
// ---------------------------------------------------------------------------

interface AuditMapping {
  file: string;
  eventName: string;
  linksToDeal: boolean;
}

const AUDIT_BY_WRITE_ID: Readonly<Record<string, AuditMapping>> = Object.freeze({
  'deal-task-complete': {
    file: 'src/deals/dealTaskActions.ts',
    eventName: 'DealTask Completed',
    linksToDeal: true,
  },
  'deal-document-request': {
    file: 'src/deals/documentActions.ts',
    eventName: 'DocumentChecklist Requested',
    linksToDeal: true,
  },
  'deal-document-receive': {
    file: 'src/deals/documentActions.ts',
    eventName: 'DocumentChecklist Received',
    linksToDeal: true,
  },
  'deal-document-review': {
    file: 'src/deals/documentActions.ts',
    eventName: 'DocumentChecklist Reviewed',
    linksToDeal: true,
  },
  'deal-document-request-email': {
    file: 'src/deals/sendDocumentRequestEmail.ts',
    eventName: 'DocumentRequest Outlook Send',
    linksToDeal: true,
  },
  'deal-document-request-handoff': {
    file: 'src/deals/prepareDocumentRequestHandoff.ts',
    eventName: 'DocumentRequest Outlook Handoff',
    linksToDeal: true,
  },
  'deal-document-review-task-create': {
    file: 'src/deals/dealTaskActions.ts',
    eventName: 'DealTask Created',
    linksToDeal: true,
  },
  'credit-memo-draft-save': {
    file: 'src/deals/creditMemoActions.ts',
    eventName: 'CreditMemo Draft Saved',
    linksToDeal: true,
  },
  'alert-resolve': {
    file: 'src/admin/alertActions.ts',
    // Resolve and dismiss share an emitter that templates the event
    // name from RemediationParams; the file contains BOTH literal
    // strings.
    eventName: 'AlertQueue Resolved',
    linksToDeal: false,
  },
  'alert-dismiss': {
    file: 'src/admin/alertActions.ts',
    eventName: 'AlertQueue Dismissed',
    linksToDeal: false,
  },
  'data-quality-flag-resolve': {
    file: 'src/admin/dataQualityActions.ts',
    eventName: 'DataQualityFlag Resolved',
    linksToDeal: false,
  },
});

// The 10 required audit payload fields. Names match the schema as
// the code has emitted them since Phase 18 (not the slightly-off
// names in the Phase 49 brief — see file header).
const REQUIRED_AUDIT_FIELDS: readonly string[] = [
  'cr664_auditeventname',
  'cr664_eventcategory',
  'cr664_eventtype',
  'cr664_entitytype',
  'cr664_entityid',
  'cr664_outcomestatus',
  'cr664_correlationid',
  'cr664_beforestate',
  'cr664_afterstate',
  'cr664_ChangedBy@odata.bind',
];

// ---------------------------------------------------------------------------
// File-system helpers
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function readSource(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

function uniqueFiles(): readonly string[] {
  const set = new Set<string>();
  for (const m of Object.values(AUDIT_BY_WRITE_ID)) set.add(m.file);
  return [...set];
}

// ---------------------------------------------------------------------------
// 1. Inventory completeness
// ---------------------------------------------------------------------------

describe('Phase 49 — inventory completeness', () => {
  it('AUDIT_BY_WRITE_ID covers every GOVERNED_WRITES id', () => {
    for (const w of GOVERNED_WRITES) {
      expect(AUDIT_BY_WRITE_ID[w.id], `unmapped: ${w.id}`).toBeDefined();
    }
  });

  it('AUDIT_BY_WRITE_ID does not name an id outside GOVERNED_WRITES', () => {
    const shippedIds = new Set(GOVERNED_WRITES.map((w) => w.id));
    for (const id of Object.keys(AUDIT_BY_WRITE_ID)) {
      expect(shippedIds.has(id), `dead mapping: ${id}`).toBe(true);
    }
  });

  it('linksToDeal aligns with the deal/admin domain boundary', () => {
    // The same domain split that drives Phase 47's failure-pattern
    // pin: GOVERNED_WRITES.emitsTimeline === linksToDeal.
    for (const w of GOVERNED_WRITES) {
      const m = AUDIT_BY_WRITE_ID[w.id]!;
      expect(
        m.linksToDeal,
        `${w.id}: linksToDeal should match emitsTimeline (${w.emitsTimeline})`,
      ).toBe(w.emitsTimeline);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Required audit fields are present in every action file
// ---------------------------------------------------------------------------

describe('Phase 49 — every audit emission includes the 10 required fields', () => {
  for (const file of uniqueFiles()) {
    it(`${file} contains every required cr664_* audit field`, () => {
      const src = readSource(file);
      const missing: string[] = [];
      for (const field of REQUIRED_AUDIT_FIELDS) {
        // Match `<field>:` or `'<field>':` (quoted property keys are
        // required when the key contains `@` or `.`). Escape regex
        // special chars in the field name.
        const escaped = field.replace(/[.@]/g, '\\$&');
        const re = new RegExp(`(?:['"])?${escaped}(?:['"])?\\s*:`);
        if (!re.test(src)) missing.push(field);
      }
      expect(
        missing,
        `${file} is missing audit field(s): ${missing.join(', ')}`,
      ).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Deal-domain writes include cr664_LoanDeal@odata.bind;
//    admin-domain writes do NOT.
// ---------------------------------------------------------------------------

describe('Phase 49 — cr664_LoanDeal@odata.bind matches the deal/admin domain split', () => {
  for (const [id, m] of Object.entries(AUDIT_BY_WRITE_ID)) {
    if (id === 'alert-dismiss') continue; // shared file with alert-resolve
    if (m.linksToDeal) {
      it(`${m.file} (deal-domain) DOES include cr664_LoanDeal@odata.bind`, () => {
        const src = readSource(m.file);
        expect(src).toMatch(/['"]cr664_LoanDeal@odata\.bind['"]\s*:/);
      });
    } else {
      it(`${m.file} (admin-domain) does NOT include cr664_LoanDeal@odata.bind`, () => {
        const src = readSource(m.file);
        // Match both quoted and unquoted property-key forms.
        expect(src).not.toMatch(/(?:['"])?cr664_LoanDeal@odata\.bind(?:['"])?\s*:/);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 4. Outcome enum constants come from the shared module
// ---------------------------------------------------------------------------

describe('Phase 49 — outcome enums are imported from the shared helper', () => {
  it('shared module exports the two outcome constants with the documented values', () => {
    expect(AUDIT_OUTCOME_SUCCEEDED).toBe(788190000);
    expect(AUDIT_OUTCOME_FAILED).toBe(788190001);
  });

  for (const file of uniqueFiles()) {
    it(`${file} imports AUDIT_OUTCOME_SUCCEEDED + AUDIT_OUTCOME_FAILED from shared/governance/auditEnums`, () => {
      const src = readSource(file);
      expect(src).toMatch(
        /import\s*\{[^}]*\bAUDIT_OUTCOME_SUCCEEDED\b[^}]*\}\s*from\s+['"]\.\.\/shared\/governance\/auditEnums['"]/,
      );
      expect(src).toMatch(
        /import\s*\{[^}]*\bAUDIT_OUTCOME_FAILED\b[^}]*\}\s*from\s+['"]\.\.\/shared\/governance\/auditEnums['"]/,
      );
    });

    it(`${file} does NOT redeclare AUDIT_OUTCOME_SUCCEEDED / AUDIT_OUTCOME_FAILED locally`, () => {
      const src = readSource(file);
      expect(src).not.toMatch(/\bconst\s+AUDIT_OUTCOME_SUCCEEDED\s*=/);
      expect(src).not.toMatch(/\bconst\s+AUDIT_OUTCOME_FAILED\s*=/);
      // Pre-Phase-49 admin files used the unprefixed name. Make sure
      // those didn't sneak back.
      expect(src).not.toMatch(/\bconst\s+OUTCOME_SUCCEEDED\s*=/);
      expect(src).not.toMatch(/\bconst\s+OUTCOME_FAILED\s*=/);
    });
  }
});

// ---------------------------------------------------------------------------
// 5. Event names — specific, action-oriented, stable
// ---------------------------------------------------------------------------

describe('Phase 49 — audit event names are specific and stable', () => {
  for (const [id, m] of Object.entries(AUDIT_BY_WRITE_ID)) {
    it(`${id}: event name "${m.eventName}" appears verbatim in ${m.file}`, () => {
      const src = readSource(m.file);
      // The literal string must appear in the source. For
      // alertActions, both 'AlertQueue Resolved' and 'AlertQueue
      // Dismissed' must be present (templated through
      // RemediationParams).
      expect(src.includes(`'${m.eventName}'`) || src.includes(`"${m.eventName}"`)).toBe(true);
    });
  }

  it('no event name is a generic "Record Updated" / "Updated" / "Changed" literal', () => {
    const forbidden = [
      'cr664_auditeventname: "Updated"',
      "cr664_auditeventname: 'Updated'",
      'cr664_auditeventname: "Record Updated"',
      "cr664_auditeventname: 'Record Updated'",
      'cr664_auditeventname: "Changed"',
      "cr664_auditeventname: 'Changed'",
    ];
    for (const file of uniqueFiles()) {
      const src = readSource(file);
      for (const f of forbidden) {
        expect(src, `${file} should not use a generic event name`).not.toContain(f);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 6. beforestate / afterstate — always present, never empty literals
// ---------------------------------------------------------------------------

describe('Phase 49 — beforestate and afterstate are both populated', () => {
  for (const file of uniqueFiles()) {
    it(`${file} populates cr664_beforestate (literal or templated, never empty)`, () => {
      const src = readSource(file);
      // The field exists (covered by the required-fields test above)
      // AND its RHS is not an empty string literal. We allow:
      //   - string literal:        'Open' / "Open"
      //   - template literal:      `Stage: ${...}`
      //   - function call:         beforeStateForRequest(...)
      //   - ?? expression with non-empty default: opts.x ?? 'Open'
      // We disallow only the literal empty assignment.
      expect(src).not.toMatch(/cr664_beforestate\s*:\s*(?:''|""|``)\s*[,}]/);
    });

    it(`${file} populates cr664_afterstate (literal or templated, never empty)`, () => {
      const src = readSource(file);
      expect(src).not.toMatch(/cr664_afterstate\s*:\s*(?:''|""|``)\s*[,}]/);
    });
  }
});

// ---------------------------------------------------------------------------
// 7. Outcome stamping — actions use the imported constants, not raw
//    788190000 / 788190001 literals.
// ---------------------------------------------------------------------------

describe('Phase 49 — outcome values come from the shared enum, not magic numbers', () => {
  for (const file of uniqueFiles()) {
    it(`${file} stamps outcomes via the named constants, not bare 788190000/788190001 literals`, () => {
      const src = readSource(file);
      // Detect bare literal use anywhere the outcome appears. We
      // permit the numbers to appear in OTHER constant declarations
      // (e.g. event-type values that happen to land on the same
      // numeric values), so the check is narrowed to cases where
      // 788190000 or 788190001 appears in the SAME expression as
      // the word "outcome".
      const lines = src.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (
          /\boutcome\b/i.test(line) &&
          /\b788190000\b|\b788190001\b/.test(line)
        ) {
          throw new Error(
            `${file}:${i + 1} uses a bare numeric outcome literal — should use AUDIT_OUTCOME_SUCCEEDED / AUDIT_OUTCOME_FAILED.\n  ${line.trim()}`,
          );
        }
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 8. Shared module hygiene
// ---------------------------------------------------------------------------

describe('Phase 49 — auditEnums.ts hygiene', () => {
  it('exports AUDIT_OUTCOME_SUCCEEDED and AUDIT_OUTCOME_FAILED', () => {
    const src = readSource('src/shared/governance/auditEnums.ts');
    expect(src).toMatch(/export\s+const\s+AUDIT_OUTCOME_SUCCEEDED\s*=/);
    expect(src).toMatch(/export\s+const\s+AUDIT_OUTCOME_FAILED\s*=/);
  });

  it('imports no SDK / no role module / no power-apps package', () => {
    const src = readSource('src/shared/governance/auditEnums.ts');
    expect(src).not.toMatch(/from\s+['"][^'"]*generated\/services/);
    expect(src).not.toMatch(/from\s+['"][^'"]*\/(?:admin|banker|deals|manager|team|executive)\//);
    expect(src).not.toMatch(/from\s+['"]@microsoft\/power-apps/);
  });
});
