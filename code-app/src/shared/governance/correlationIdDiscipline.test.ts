import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { newCorrelationId } from './correlationId';
import { GOVERNED_WRITES } from './platformInventory';

/**
 * Phase 46: Correlation-ID Discipline Regression Sweep.
 *
 * Every governed write must:
 *   1. derive its correlation id from the shared helper in
 *      src/shared/governance/correlationId.ts (no local duplicates);
 *   2. generate the id exactly once near the top of the action,
 *      using a stable short prefix;
 *   3. stamp the SAME correlation id onto the audit emission;
 *   4. (deal-domain writes) stamp the SAME correlation id onto the
 *      timeline emission;
 *   5. consistently name the variable `correlationId`.
 *
 * The audit pattern is `cr664_correlationid: ...correlationId`.
 * The timeline pattern is `correlation:${...correlationId}` embedded
 * in the `cr664_eventsubtype` template literal.
 *
 * These tests are inventory-driven: they derive the action file for
 * each governed write from GOVERNED_WRITES (via a small map in this
 * file) and assert the discipline. Adding a future governed write to
 * GOVERNED_WRITES without adding it to ACTION_BY_WRITE_ID is a test
 * failure on its own — a deliberate "you forgot to extend this map"
 * signal.
 */

// ---------------------------------------------------------------------------
// Inventory mapping
//
// Each id in GOVERNED_WRITES maps to its action source file plus the
// short prefix the action passes to newCorrelationId(). Two ids
// (alert-resolve, alert-dismiss) share the same action file because
// they are two outcomes of the same coordinator.
// ---------------------------------------------------------------------------

interface ActionMapping {
  file: string;
  prefix: string;
}

const ACTION_BY_WRITE_ID: Readonly<Record<string, ActionMapping>> = Object.freeze({
  'deal-task-complete': { file: 'src/deals/dealTaskActions.ts', prefix: 'dt' },
  'deal-document-request': { file: 'src/deals/documentActions.ts', prefix: 'dr' },
  'deal-document-receive': { file: 'src/deals/documentActions.ts', prefix: 'rd' },
  'deal-document-review': { file: 'src/deals/documentActions.ts', prefix: 'rv' },
  'credit-memo-draft-save': { file: 'src/deals/creditMemoActions.ts', prefix: 'cm' },
  'alert-resolve': { file: 'src/admin/alertActions.ts', prefix: 'al' },
  'alert-dismiss': { file: 'src/admin/alertActions.ts', prefix: 'al' },
  'data-quality-flag-resolve': {
    file: 'src/admin/dataQualityActions.ts',
    prefix: 'dq',
  },
});

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function readSource(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

function uniqueFiles(): readonly string[] {
  const set = new Set<string>();
  for (const entry of Object.values(ACTION_BY_WRITE_ID)) {
    set.add(entry.file);
  }
  return [...set];
}

// ---------------------------------------------------------------------------
// 1. Shared helper unit tests
// ---------------------------------------------------------------------------

describe('Phase 46 — newCorrelationId shared helper', () => {
  it('returns a non-empty string', () => {
    const id = newCorrelationId('dt');
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('returns a uuid-v4-shaped id when crypto.randomUUID is available', () => {
    // Vitest runs under Node 20+, so crypto.randomUUID is available.
    const id = newCorrelationId('dt');
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('falls back to a prefixed timestamp+random id when crypto.randomUUID is unavailable', () => {
    // Hide the crypto.randomUUID API and re-execute the helper.
    const original = globalThis.crypto;
    vi.stubGlobal('crypto', undefined);
    try {
      const id = newCorrelationId('dt');
      expect(id).toMatch(/^dt-[0-9a-z]+-[0-9a-z]+$/);
    } finally {
      vi.stubGlobal('crypto', original);
    }
  });

  it('preserves a different caller-supplied prefix in the fallback path', () => {
    const original = globalThis.crypto;
    vi.stubGlobal('crypto', undefined);
    try {
      expect(newCorrelationId('cm')).toMatch(/^cm-/);
      expect(newCorrelationId('al')).toMatch(/^al-/);
    } finally {
      vi.stubGlobal('crypto', original);
    }
  });

  it('produces independent ids on repeated calls', () => {
    const a = newCorrelationId('dt');
    const b = newCorrelationId('dt');
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// 2. Inventory completeness — every GOVERNED_WRITES id has a mapping
// ---------------------------------------------------------------------------

describe('Phase 46 — inventory completeness', () => {
  it('ACTION_BY_WRITE_ID covers every GOVERNED_WRITES id', () => {
    for (const w of GOVERNED_WRITES) {
      expect(
        ACTION_BY_WRITE_ID[w.id],
        `GOVERNED_WRITES contains "${w.id}" but ACTION_BY_WRITE_ID does not. ` +
          'When you add a new governed write, extend the map in ' +
          'correlationIdDiscipline.test.ts.',
      ).toBeDefined();
    }
  });

  it('ACTION_BY_WRITE_ID does not name an id that is not in GOVERNED_WRITES', () => {
    const shippedIds = new Set(GOVERNED_WRITES.map((w) => w.id));
    for (const id of Object.keys(ACTION_BY_WRITE_ID)) {
      expect(
        shippedIds.has(id),
        `ACTION_BY_WRITE_ID names "${id}" but it is not in GOVERNED_WRITES.`,
      ).toBe(true);
    }
  });

  it('every mapped action file exists on disk', () => {
    for (const file of uniqueFiles()) {
      expect(
        existsSync(resolve(REPO_ROOT, file)),
        `action file ${file} does not exist`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Static-source per-action assertions
// ---------------------------------------------------------------------------

describe('Phase 46 — every action module uses the shared helper', () => {
  for (const file of uniqueFiles()) {
    it(`${file} imports newCorrelationId from ../shared/governance/correlationId`, () => {
      const src = readSource(file);
      expect(src).toMatch(
        /import\s*\{\s*newCorrelationId\s*\}\s*from\s+['"]\.\.\/shared\/governance\/correlationId['"]/,
      );
    });

    it(`${file} does NOT define a local newCorrelationId function`, () => {
      const src = readSource(file);
      expect(src).not.toMatch(/\bfunction\s+newCorrelationId\s*\(/);
    });
  }
});

describe('Phase 46 — every action generates correlationId exactly once with its mapped prefix', () => {
  for (const [writeId, mapping] of Object.entries(ACTION_BY_WRITE_ID)) {
    // Two ids share alertActions.ts; deduplicate by file to avoid
    // double-running the same file assertions.
    if (writeId === 'alert-dismiss') continue;
    it(`${mapping.file} generates correlationId via newCorrelationId('${mapping.prefix}')`, () => {
      const src = readSource(mapping.file);
      const callRe = new RegExp(
        `const\\s+correlationId\\s*=\\s*newCorrelationId\\(\\s*['"]${mapping.prefix}['"]\\s*\\)`,
      );
      const matches = src.match(new RegExp(callRe.source, 'g')) ?? [];
      expect(
        matches.length,
        `${mapping.file} should call newCorrelationId('${mapping.prefix}') exactly once`,
      ).toBe(1);
    });
  }
});

// ---------------------------------------------------------------------------
// 4. Audit emission carries the correlation id
// ---------------------------------------------------------------------------

describe('Phase 46 — audit emission stamps cr664_correlationid', () => {
  for (const file of uniqueFiles()) {
    it(`${file} stamps cr664_correlationid on the audit payload`, () => {
      const src = readSource(file);
      // The canonical pattern is `cr664_correlationid: <something that
      // resolves to the correlationId variable>`. We allow `opts.correlationId`
      // or a direct `correlationId` reference.
      expect(src).toMatch(
        /cr664_correlationid\s*:\s*(?:opts\.)?correlationId\b/,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// 5. Timeline emission carries the correlation id (deal-domain only)
//
// Inventory truth: GOVERNED_WRITES.emitsTimeline. Files that emit
// timeline events must embed `correlation:${...correlationId}` in the
// timeline payload; files that do NOT emit timeline must not import
// Cr664_dealtimelineeventsService at all.
// ---------------------------------------------------------------------------

describe('Phase 46 — timeline emission matches GOVERNED_WRITES.emitsTimeline', () => {
  for (const w of GOVERNED_WRITES) {
    const mapping = ACTION_BY_WRITE_ID[w.id]!;
    if (w.id === 'alert-dismiss') continue; // shares alertActions.ts
    if (w.emitsTimeline) {
      it(`${w.id} (${mapping.file}) imports timeline service and embeds correlation: in eventsubtype`, () => {
        const src = readSource(mapping.file);
        expect(src).toMatch(
          /from\s+['"][^'"]*Cr664_dealtimelineeventsService['"]/,
        );
        // The eventsubtype field must exist; the file must also embed
        // `correlation:${...correlationId}` somewhere. Checked as two
        // simpler statements rather than one big regex so template
        // literals containing `${...}` substitutions don't break the
        // match.
        expect(src).toMatch(/\bcr664_eventsubtype\s*:/);
        expect(src).toMatch(/correlation:\$\{\s*(?:opts\.)?correlationId\s*\}/);
      });
    } else {
      it(`${w.id} (${mapping.file}) does NOT import the timeline service`, () => {
        const src = readSource(mapping.file);
        expect(src).not.toMatch(
          /from\s+['"][^'"]*Cr664_dealtimelineeventsService['"]/,
        );
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 6. Variable naming consistency
// ---------------------------------------------------------------------------

describe('Phase 46 — variable name is consistently `correlationId`', () => {
  for (const file of uniqueFiles()) {
    it(`${file} uses the name correlationId (not cid / corrId / etc.)`, () => {
      const src = readSource(file);
      // Forbid plausible alternate names that would silently fragment
      // the discipline.
      expect(src).not.toMatch(/\bconst\s+cid\s*=/);
      expect(src).not.toMatch(/\bconst\s+corrId\s*=/);
      expect(src).not.toMatch(/\bconst\s+correlation_id\s*=/);
      // And the canonical name appears.
      expect(src).toMatch(/\bconst\s+correlationId\s*=/);
    });
  }
});

// ---------------------------------------------------------------------------
// 7. Audit + timeline pair share ONE correlation id (no orphans)
//
// For deal-domain files, the same `correlationId` variable must be
// passed into BOTH the audit emitter call and the timeline emitter
// call. A regression here would mean two ids generated for a single
// coordinated write — breaking the only durable link between rows.
// ---------------------------------------------------------------------------

describe('Phase 46 — deal-domain pairs share the SAME correlation id', () => {
  // The original Phase-46 invariant was "exactly one `const
  // correlationId =` per file." Phase 51 introduced a second
  // governed write (deal-document-receive) in the same file as
  // deal-document-request, so the invariant is now generalized:
  // each file should have one declaration PER governed-write
  // mapping that points to it. That is still strong enough to
  // catch the original failure mode — two ids generated within
  // one coordinated write — because the entries in
  // ACTION_BY_WRITE_ID are 1:1 with action functions.
  it('every action file declares correlationId exactly once per governed-write mapping pointing at it', () => {
    const expectedByFile = new Map<string, number>();
    for (const m of Object.values(ACTION_BY_WRITE_ID)) {
      expectedByFile.set(m.file, (expectedByFile.get(m.file) ?? 0) + 1);
    }
    // Two GOVERNED_WRITES ids share alertActions.ts but use ONE
    // coordinator (applyAlertRemediation); the file declares
    // correlationId once. Subtract the duplicate so the expected
    // count matches the actual count.
    const sharedAlertCount = ['alert-resolve', 'alert-dismiss'].filter(
      (id) => ACTION_BY_WRITE_ID[id],
    ).length;
    if (sharedAlertCount > 1) {
      expectedByFile.set(
        'src/admin/alertActions.ts',
        (expectedByFile.get('src/admin/alertActions.ts') ?? 0) -
          (sharedAlertCount - 1),
      );
    }
    for (const [file, expected] of expectedByFile) {
      const src = readSource(file);
      const decls = src.match(/\bconst\s+correlationId\s*=/g) ?? [];
      expect(
        decls.length,
        `${file} declares correlationId ${decls.length} time(s); expected ${expected}`,
      ).toBe(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Helper module hygiene
// ---------------------------------------------------------------------------

describe('Phase 46 — correlationId.ts helper module hygiene', () => {
  it('exports newCorrelationId', () => {
    const src = readSource('src/shared/governance/correlationId.ts');
    expect(src).toMatch(/export\s+function\s+newCorrelationId\s*\(/);
  });

  it('imports no SDK services or role modules (pure helper)', () => {
    const src = readSource('src/shared/governance/correlationId.ts');
    expect(src).not.toMatch(/from\s+['"][^'"]*generated\/services/);
    expect(src).not.toMatch(/from\s+['"][^'"]*\/(?:admin|banker|deals|manager|team|executive)\//);
    expect(src).not.toMatch(/from\s+['"]@microsoft\/power-apps/);
  });
});
