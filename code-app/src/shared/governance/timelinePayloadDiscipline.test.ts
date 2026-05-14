import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GOVERNED_WRITES } from './platformInventory';
import { TIMELINE_VISIBILITY_BANKER_AND_MANAGER } from './timelineEnums';

/**
 * Phase 50: Timeline Payload Schema Discipline Regression Sweep.
 *
 * Closes the governed-write event contract end-to-end:
 *   - Phase 46: correlation-id discipline
 *   - Phase 47: outcome union shape
 *   - Phase 49: audit payload schema
 *   - Phase 50 (this): timeline payload schema
 *
 * After this phase the full chain — generate id → write → audit row
 * → timeline row → outcome — is regression-pinned at the import,
 * type, and schema-field level. A future governed write that skips
 * any link fails CI.
 */

// ---------------------------------------------------------------------------
// Inventory mapping
//
// Only the three deal-domain writes emit timeline events. Admin
// writes (alert-resolve, alert-dismiss, data-quality-flag-resolve)
// deliberately do NOT — confirmed in Phase 46/47/49 and pinned again
// here at the import-graph level.
// ---------------------------------------------------------------------------

interface TimelineMapping {
  file: string;
  eventTypeConst: string;
  eventTypeValue: number;
  /** True when the subtype is prefixed with a domain identifier
   *  before `|correlation:<id>`. The credit-memo write uses this
   *  pattern (`creditmemo:draft-saved|correlation:<id>`); the task
   *  and document writes use the bare `correlation:<id>`. */
  subtypeHasDomainPrefix: boolean;
}

const TIMELINE_BY_WRITE_ID: Readonly<Record<string, TimelineMapping>> =
  Object.freeze({
    'deal-task-complete': {
      file: 'src/deals/dealTaskActions.ts',
      eventTypeConst: 'TIMELINE_EVENT_TYPE_TASK_COMPLETED',
      eventTypeValue: 788190005,
      subtypeHasDomainPrefix: false,
    },
    'deal-document-request': {
      file: 'src/deals/documentActions.ts',
      eventTypeConst: 'TIMELINE_EVENT_TYPE_DOCUMENT_REQUESTED',
      eventTypeValue: 788190009,
      subtypeHasDomainPrefix: false,
    },
    'deal-document-receive': {
      file: 'src/deals/documentActions.ts',
      eventTypeConst: 'TIMELINE_EVENT_TYPE_DOCUMENT_UPLOADED',
      eventTypeValue: 788190010,
      subtypeHasDomainPrefix: false,
    },
    'credit-memo-draft-save': {
      file: 'src/deals/creditMemoActions.ts',
      eventTypeConst: 'TIMELINE_EVENT_TYPE_NOTE_LOGGED',
      eventTypeValue: 788190002,
      subtypeHasDomainPrefix: true,
    },
  });

const ADMIN_FILES: readonly string[] = [
  'src/admin/alertActions.ts',
  'src/admin/dataQualityActions.ts',
];

// 11 required timeline payload fields. Matches the schema as the
// code has emitted these since Phases 21 / 22 / 25.
const REQUIRED_TIMELINE_FIELDS: readonly string[] = [
  'cr664_eventtype',
  'cr664_title',
  'cr664_summary',
  'cr664_eventat',
  'cr664_visibilityscope',
  'cr664_issystemgenerated',
  'cr664_relatedentitytype',
  'cr664_relatedentityid',
  'cr664_Deal@odata.bind',
  'cr664_EventBy@odata.bind',
  'cr664_eventsubtype',
];

// ---------------------------------------------------------------------------
// File-system helpers
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function readSource(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

function timelineFiles(): readonly string[] {
  return Object.values(TIMELINE_BY_WRITE_ID).map((m) => m.file);
}

// ---------------------------------------------------------------------------
// 1. Inventory completeness
// ---------------------------------------------------------------------------

describe('Phase 50 — inventory completeness', () => {
  it('TIMELINE_BY_WRITE_ID covers exactly the GOVERNED_WRITES entries with emitsTimeline=true', () => {
    const shippedWithTimeline = new Set(
      GOVERNED_WRITES.filter((w) => w.emitsTimeline).map((w) => w.id),
    );
    const mapped = new Set(Object.keys(TIMELINE_BY_WRITE_ID));
    expect([...mapped].sort()).toEqual([...shippedWithTimeline].sort());
  });

  it('every mapped action file exists on disk', () => {
    for (const m of Object.values(TIMELINE_BY_WRITE_ID)) {
      const src = readSource(m.file);
      expect(src.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Required timeline fields are present in every deal-domain file
// ---------------------------------------------------------------------------

describe('Phase 50 — every timeline emission includes the 11 required fields', () => {
  for (const m of Object.values(TIMELINE_BY_WRITE_ID)) {
    it(`${m.file} contains every required cr664_* timeline field`, () => {
      const src = readSource(m.file);
      const missing: string[] = [];
      for (const field of REQUIRED_TIMELINE_FIELDS) {
        const escaped = field.replace(/[.@]/g, '\\$&');
        // Match the property key either bare or quoted (quoted is
        // required when the name contains `@`).
        const re = new RegExp(`(?:['"])?${escaped}(?:['"])?\\s*:`);
        if (!re.test(src)) missing.push(field);
      }
      expect(
        missing,
        `${m.file} is missing timeline field(s): ${missing.join(', ')}`,
      ).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Visibility comes from the shared module
// ---------------------------------------------------------------------------

describe('Phase 50 — visibility constant is imported from the shared helper', () => {
  it('shared module exports TIMELINE_VISIBILITY_BANKER_AND_MANAGER = 788190000', () => {
    expect(TIMELINE_VISIBILITY_BANKER_AND_MANAGER).toBe(788190000);
  });

  for (const file of timelineFiles()) {
    it(`${file} imports TIMELINE_VISIBILITY_BANKER_AND_MANAGER from shared/governance/timelineEnums`, () => {
      const src = readSource(file);
      expect(src).toMatch(
        /import\s*\{[^}]*\bTIMELINE_VISIBILITY_BANKER_AND_MANAGER\b[^}]*\}\s*from\s+['"]\.\.\/shared\/governance\/timelineEnums['"]/,
      );
    });

    it(`${file} does NOT redeclare TIMELINE_VISIBILITY_BANKER_AND_MANAGER locally`, () => {
      const src = readSource(file);
      expect(src).not.toMatch(
        /\bconst\s+TIMELINE_VISIBILITY_BANKER_AND_MANAGER\s*=/,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// 4. Event-type constants — declared inline with the documented value
// ---------------------------------------------------------------------------

describe('Phase 50 — per-write timeline event-type constants are pinned', () => {
  for (const m of Object.values(TIMELINE_BY_WRITE_ID)) {
    it(`${m.file} declares ${m.eventTypeConst} = ${m.eventTypeValue}`, () => {
      const src = readSource(m.file);
      const re = new RegExp(
        `\\bconst\\s+${m.eventTypeConst}\\s*=\\s*${m.eventTypeValue}\\b`,
      );
      expect(re.test(src)).toBe(true);
    });

    it(`${m.file} uses its event-type constant in cr664_eventtype (not a bare numeric literal)`, () => {
      const src = readSource(m.file);
      // `cr664_eventtype: TIMELINE_EVENT_TYPE_TASK_COMPLETED` (or
      // similar). Not `cr664_eventtype: 788190005`.
      const re = new RegExp(
        `cr664_eventtype\\s*:\\s*${m.eventTypeConst}\\b`,
      );
      expect(re.test(src)).toBe(true);
      // The literal numeric value must not appear as a direct RHS of
      // cr664_eventtype.
      const bareRe = new RegExp(
        `cr664_eventtype\\s*:\\s*${m.eventTypeValue}\\b`,
      );
      expect(bareRe.test(src)).toBe(false);
    });
  }

  it('the three event-type numeric values are distinct', () => {
    const values = Object.values(TIMELINE_BY_WRITE_ID).map(
      (m) => m.eventTypeValue,
    );
    expect(new Set(values).size).toBe(values.length);
  });
});

// ---------------------------------------------------------------------------
// 5. Correlation embedding in cr664_eventsubtype
// ---------------------------------------------------------------------------

describe('Phase 50 — every timeline emission embeds correlation:${correlationId} in cr664_eventsubtype', () => {
  for (const m of Object.values(TIMELINE_BY_WRITE_ID)) {
    it(`${m.file} embeds correlation:\${...correlationId} in the eventsubtype template`, () => {
      const src = readSource(m.file);
      // Same shape Phase 46 pinned. Allow `opts.correlationId` or
      // bare `correlationId`.
      expect(src).toMatch(
        /correlation:\$\{\s*(?:opts\.)?correlationId\s*\}/,
      );
    });

    if (m.subtypeHasDomainPrefix) {
      it(`${m.file} prefixes the subtype with a domain identifier before |correlation:`, () => {
        const src = readSource(m.file);
        // Match `<prefix>|correlation:${correlationId}` somewhere in
        // a cr664_eventsubtype template. Conservative — we only
        // assert the `|correlation:${...}` shape exists.
        expect(src).toMatch(
          /\|correlation:\$\{\s*(?:opts\.)?correlationId\s*\}/,
        );
      });
    } else {
      it(`${m.file} uses the bare correlation:\${...} eventsubtype (no domain prefix)`, () => {
        const src = readSource(m.file);
        // The cr664_eventsubtype line must be exactly the
        // `correlation:${...}` template literal, no pipe before it.
        // We assert the line containing cr664_eventsubtype does NOT
        // contain a `|correlation:` pattern.
        const lines = src.split(/\r?\n/);
        const subtypeLine = lines.find((l) =>
          /cr664_eventsubtype\s*:/.test(l),
        );
        expect(subtypeLine).toBeDefined();
        expect(subtypeLine!).not.toMatch(/\|correlation:/);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 6. Title and summary discipline
// ---------------------------------------------------------------------------

describe('Phase 50 — cr664_title and cr664_summary are populated', () => {
  for (const m of Object.values(TIMELINE_BY_WRITE_ID)) {
    it(`${m.file} populates cr664_title (literal or templated, never empty)`, () => {
      const src = readSource(m.file);
      // Forbid `cr664_title: ''` / `""` / `` `` ``.
      expect(src).not.toMatch(/cr664_title\s*:\s*(?:''|""|``)\s*[,}]/);
    });

    it(`${m.file} populates cr664_summary (literal, templated, or user-supplied note)`, () => {
      const src = readSource(m.file);
      expect(src).not.toMatch(/cr664_summary\s*:\s*(?:''|""|``)\s*[,}]/);
    });
  }
});

describe('Phase 50 — timeline summaries use conservative, action-oriented wording', () => {
  // Generic system-string summaries are forbidden. User-supplied
  // notes are fine (the deal-task / document / credit-memo writes
  // bind cr664_summary to opts.input.<X>Note). What we want to catch
  // is a future regression where a literal generic string sneaks in.
  const FORBIDDEN_TIMELINE_SUMMARIES: readonly RegExp[] = [
    /cr664_summary\s*:\s*['"`]\s*(?:Updated|Changed|Record Updated)\s*['"`]/i,
    /cr664_summary\s*:\s*['"`][^'"`]*\bapproved\b[^'"`]*['"`]/i,
    /cr664_summary\s*:\s*['"`][^'"`]*\bcleared to close\b[^'"`]*['"`]/i,
    /cr664_summary\s*:\s*['"`][^'"`]*\bguaranteed\b[^'"`]*['"`]/i,
  ];

  for (const file of timelineFiles()) {
    it(`${file} uses no forbidden generic / overclaim summary literals`, () => {
      const src = readSource(file);
      for (const re of FORBIDDEN_TIMELINE_SUMMARIES) {
        expect(re.test(src), `${file} has a forbidden summary matching ${re}`).toBe(
          false,
        );
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 7. Visibility — every emission uses the shared constant directly
// ---------------------------------------------------------------------------

describe('Phase 50 — cr664_visibilityscope is the shared constant, not a magic number', () => {
  for (const file of timelineFiles()) {
    it(`${file} sets cr664_visibilityscope: TIMELINE_VISIBILITY_BANKER_AND_MANAGER`, () => {
      const src = readSource(file);
      expect(src).toMatch(
        /cr664_visibilityscope\s*:\s*TIMELINE_VISIBILITY_BANKER_AND_MANAGER\b/,
      );
      // The literal 788190000 must not be assigned to
      // cr664_visibilityscope directly.
      expect(src).not.toMatch(/cr664_visibilityscope\s*:\s*788190000\b/);
    });
  }
});

// ---------------------------------------------------------------------------
// 8. Admin/deal distinction — admin writes do NOT emit timeline
// ---------------------------------------------------------------------------

describe('Phase 50 — admin action modules do NOT import or emit timeline events', () => {
  for (const file of ADMIN_FILES) {
    it(`${file} does not import Cr664_dealtimelineeventsService`, () => {
      const src = readSource(file);
      expect(src).not.toMatch(
        /from\s+['"][^'"]*Cr664_dealtimelineeventsService['"]/,
      );
    });

    it(`${file} does not import the shared timeline visibility constant`, () => {
      const src = readSource(file);
      expect(src).not.toMatch(/TIMELINE_VISIBILITY_BANKER_AND_MANAGER/);
    });

    it(`${file} does not reference cr664_eventsubtype anywhere (timeline-only field)`, () => {
      const src = readSource(file);
      // cr664_eventsubtype is timeline-only — the audit table uses
      // cr664_eventcategory / cr664_eventtype / cr664_entitytype but
      // does NOT have an eventsubtype column. Its presence in an
      // admin action module would imply a timeline emission has been
      // introduced.
      expect(src).not.toMatch(/cr664_eventsubtype\b/);
    });

    it(`${file} does not reference cr664_visibilityscope or cr664_eventat (timeline-only fields)`, () => {
      const src = readSource(file);
      expect(src).not.toMatch(/cr664_visibilityscope\b/);
      expect(src).not.toMatch(/cr664_eventat\b/);
    });
  }
});

// ---------------------------------------------------------------------------
// 9. Shared module hygiene
// ---------------------------------------------------------------------------

describe('Phase 50 — timelineEnums.ts hygiene', () => {
  it('exports TIMELINE_VISIBILITY_BANKER_AND_MANAGER', () => {
    const src = readSource('src/shared/governance/timelineEnums.ts');
    expect(src).toMatch(
      /export\s+const\s+TIMELINE_VISIBILITY_BANKER_AND_MANAGER\s*=/,
    );
  });

  it('imports no SDK / no role module / no power-apps package', () => {
    const src = readSource('src/shared/governance/timelineEnums.ts');
    expect(src).not.toMatch(/from\s+['"][^'"]*generated\/services/);
    expect(src).not.toMatch(
      /from\s+['"][^'"]*\/(?:admin|banker|deals|manager|team|executive)\//,
    );
    expect(src).not.toMatch(/from\s+['"]@microsoft\/power-apps/);
  });
});
