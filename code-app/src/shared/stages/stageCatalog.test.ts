import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  STAGE_CATALOG,
  canTransitionStage,
  getLifecycleGroup,
  getLifecycleGroupByName,
  getNextStage,
  getOrderedStages,
  getStageById,
  isTerminalStage,
  stageNameGatesMemo,
  type LifecycleGroup,
  type StageDefinition,
  type StageId,
} from './stageCatalog';
import { REFERENCE_DATA_GOVERNED } from '../governance/platformInventory';

const ALL_IDS = STAGE_CATALOG.map((s) => s.id);

// ---------------------------------------------------------------------------
// Catalog integrity
// ---------------------------------------------------------------------------

describe('STAGE_CATALOG — integrity', () => {
  it('stage ids are unique', () => {
    const ids = new Set(STAGE_CATALOG.map((s) => s.id));
    expect(ids.size).toBe(STAGE_CATALOG.length);
  });

  it('stage ordinals are unique', () => {
    const ords = new Set(STAGE_CATALOG.map((s) => s.ordinal));
    expect(ords.size).toBe(STAGE_CATALOG.length);
  });

  it('stage labels are unique', () => {
    const labels = new Set(STAGE_CATALOG.map((s) => s.label));
    expect(labels.size).toBe(STAGE_CATALOG.length);
  });

  it('catalog is sorted by ordinal ascending', () => {
    for (let i = 1; i < STAGE_CATALOG.length; i++) {
      expect(STAGE_CATALOG[i]!.ordinal).toBeGreaterThan(
        STAGE_CATALOG[i - 1]!.ordinal,
      );
    }
  });

  it('every allowedForwardTransitions target is a real catalog id', () => {
    const valid = new Set(ALL_IDS);
    for (const stage of STAGE_CATALOG) {
      for (const target of stage.allowedForwardTransitions) {
        expect(valid.has(target)).toBe(true);
      }
    }
  });

  it('terminal stages have empty allowedForwardTransitions', () => {
    for (const stage of STAGE_CATALOG) {
      if (stage.isTerminal) {
        expect(stage.allowedForwardTransitions).toEqual([]);
      }
    }
  });

  it('every terminal stage is in the terminal lifecycle group', () => {
    for (const stage of STAGE_CATALOG) {
      if (stage.isTerminal) {
        expect(stage.lifecycleGroup).toBe('terminal');
      }
    }
  });

  it('catalog is frozen (Object.isFrozen) so consumers cannot mutate it at runtime', () => {
    expect(Object.isFrozen(STAGE_CATALOG)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Transition safety (the brief's hardest invariants)
// ---------------------------------------------------------------------------

describe('STAGE_CATALOG — transition safety', () => {
  it('no stage allows a self-transition', () => {
    for (const stage of STAGE_CATALOG) {
      expect(stage.allowedForwardTransitions).not.toContain(stage.id);
    }
    // The public predicate must reject self-transitions too.
    for (const stage of STAGE_CATALOG) {
      expect(canTransitionStage(stage.id, stage.id)).toBe(false);
    }
  });

  it('no transition targets a stage with a strictly lower ordinal (no backward transitions)', () => {
    const ordinalById = new Map(STAGE_CATALOG.map((s) => [s.id, s.ordinal]));
    for (const stage of STAGE_CATALOG) {
      for (const target of stage.allowedForwardTransitions) {
        const fromOrd = stage.ordinal;
        const toOrd = ordinalById.get(target)!;
        expect(toOrd).toBeGreaterThan(fromOrd);
      }
    }
  });

  it('forward-transition graph contains no cycles', () => {
    // The earlier no-backward-transitions test implies no cycles
    // (strictly increasing ordinal on every forward edge), but we
    // verify directly by walking the graph from every node and
    // ensuring no node is visited twice in any walk.
    function walk(start: StageId): void {
      const seen = new Set<StageId>();
      const stack: StageId[] = [start];
      while (stack.length > 0) {
        const id = stack.pop()!;
        if (seen.has(id)) {
          throw new Error(`Cycle detected via ${id}`);
        }
        seen.add(id);
        const stage = getStageById(id);
        if (!stage) continue;
        for (const next of stage.allowedForwardTransitions) {
          stack.push(next);
        }
      }
    }
    for (const stage of STAGE_CATALOG) {
      expect(() => walk(stage.id)).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// Governance constraints (this catalog is metadata, NOT a write surface)
// ---------------------------------------------------------------------------

describe('STAGE_CATALOG — governance constraints', () => {
  it('REFERENCE_DATA_GOVERNED.stageCatalog reports progressionEnabled = false', () => {
    expect(REFERENCE_DATA_GOVERNED.stageCatalog.progressionEnabled).toBe(false);
  });

  it('REFERENCE_DATA_GOVERNED.stageCatalog reports canonical = true', () => {
    expect(REFERENCE_DATA_GOVERNED.stageCatalog.canonical).toBe(true);
  });

  it('progressionBlockedReason references the Phase 28 schema gap', () => {
    const reason = REFERENCE_DATA_GOVERNED.stageCatalog.progressionBlockedReason;
    expect(reason).toMatch(/Phase 28|stagereferences|schema gap/i);
  });

  it('stageCatalog source contains no imports from Power Apps service modules (read-only metadata)', () => {
    // Static-source assertion: stageCatalog.ts must not pull a
    // Cr664_*Service or @microsoft/power-apps subpath. If it did,
    // the module would no longer be a pure metadata file.
    const source = readFileSync(
      resolve(__dirname, './stageCatalog.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/from\s+['"](\.\.\/)+generated\/services/);
    expect(source).not.toMatch(/from\s+['"]@microsoft\/power-apps/);
  });

  it('stageCatalog source does not import any workflow / automation surface', () => {
    const source = readFileSync(
      resolve(__dirname, './stageCatalog.ts'),
      'utf8',
    );
    // Match imports specifically, not English prose in comments that
    // explicitly say "no workflow trigger" (that prose is required).
    expect(source).not.toMatch(/from\s+['"][^'"]*power[-_ ]?automate/i);
    expect(source).not.toMatch(/from\s+['"][^'"]*workflow/i);
    expect(source).not.toMatch(/from\s+['"]\.\.\/banker\//);
    expect(source).not.toMatch(/from\s+['"]\.\.\/manager\//);
    expect(source).not.toMatch(/from\s+['"]\.\.\/team\//);
    expect(source).not.toMatch(/from\s+['"]\.\.\/executive\//);
    expect(source).not.toMatch(/from\s+['"]\.\.\/admin\//);
    expect(source).not.toMatch(/from\s+['"]\.\.\/deals\//);
  });
});

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

describe('selectors — getStageById', () => {
  it('returns the entry for a known stage id', () => {
    expect(getStageById('underwriting')?.label).toBe('Underwriting');
  });

  it('returns undefined for an unknown id', () => {
    expect(getStageById('nope')).toBeUndefined();
  });

  it('returns undefined for empty / undefined input', () => {
    expect(getStageById(undefined)).toBeUndefined();
    expect(getStageById('')).toBeUndefined();
  });
});

describe('selectors — getOrderedStages', () => {
  it('returns the catalog in ascending ordinal order', () => {
    const ords = getOrderedStages().map((s) => s.ordinal);
    const sorted = [...ords].sort((a, b) => a - b);
    expect(ords).toEqual(sorted);
  });
});

describe('selectors — getNextStage', () => {
  it('returns the canonical next stage along the happy path', () => {
    expect(getNextStage('underwriting')?.id).toBe('committee');
    expect(getNextStage('committee')?.id).toBe('documentation');
    expect(getNextStage('closing')?.id).toBe('funded');
  });

  it('returns undefined for terminal stages', () => {
    expect(getNextStage('closed-won')).toBeUndefined();
    expect(getNextStage('closed-lost')).toBeUndefined();
    expect(getNextStage('cancelled')).toBeUndefined();
  });

  it('returns undefined for unknown / empty input', () => {
    expect(getNextStage('nope')).toBeUndefined();
    expect(getNextStage(undefined)).toBeUndefined();
  });
});

describe('selectors — isTerminalStage / getLifecycleGroup', () => {
  it('isTerminalStage matches the catalog flag', () => {
    expect(isTerminalStage('closed-won')).toBe(true);
    expect(isTerminalStage('cancelled')).toBe(true);
    expect(isTerminalStage('underwriting')).toBe(false);
    expect(isTerminalStage('nope')).toBe(false);
  });

  it('getLifecycleGroup returns the catalog group', () => {
    expect(getLifecycleGroup('origination')).toBe('preflight');
    expect(getLifecycleGroup('underwriting')).toBe('underwriting');
    expect(getLifecycleGroup('committee')).toBe('underwriting');
    expect(getLifecycleGroup('closing')).toBe('closing');
    expect(getLifecycleGroup('closed-won')).toBe('terminal');
  });
});

describe('selectors — canTransitionStage', () => {
  it('accepts a legal forward transition', () => {
    expect(canTransitionStage('underwriting', 'committee')).toBe(true);
  });

  it('rejects a backward transition', () => {
    expect(canTransitionStage('committee', 'underwriting')).toBe(false);
  });

  it('rejects a self-transition for every stage', () => {
    for (const stage of STAGE_CATALOG) {
      expect(canTransitionStage(stage.id, stage.id)).toBe(false);
    }
  });

  it('rejects an undefined / empty from or to', () => {
    expect(canTransitionStage(undefined, 'committee')).toBe(false);
    expect(canTransitionStage('underwriting', undefined)).toBe(false);
    expect(canTransitionStage('', 'committee')).toBe(false);
    expect(canTransitionStage('underwriting', '')).toBe(false);
  });

  it('rejects a transition from an unknown stage id', () => {
    expect(canTransitionStage('not-a-stage', 'committee')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Soft name classifier (preserves Phase 27 memo-gating regex behavior)
// ---------------------------------------------------------------------------

describe('soft name classifier — getLifecycleGroupByName', () => {
  it('returns the canonical group for an exact id or label match', () => {
    expect(getLifecycleGroupByName('underwriting')).toBe('underwriting');
    expect(getLifecycleGroupByName('Underwriting')).toBe('underwriting');
    expect(getLifecycleGroupByName('committee')).toBe('underwriting');
    expect(getLifecycleGroupByName('Closing')).toBe('closing');
  });

  it('falls back to the regex set when the name is not in the catalog', () => {
    // The Phase 27 originals: /underwrit/i and /committee/i must
    // both classify as the underwriting group. These names are NOT
    // in the catalog verbatim.
    expect(getLifecycleGroupByName('Underwriting Review')).toBe('underwriting');
    expect(getLifecycleGroupByName('Senior Loan Committee')).toBe('underwriting');
  });

  it('does NOT widen the Phase 27 memo-gating regex beyond /underwrit/i and /committee/i', () => {
    // Phase 27 originally did NOT match the word "approval" to the
    // underwriting group. The Phase 41 refactor must preserve that.
    expect(getLifecycleGroupByName('Approval Pending')).not.toBe('underwriting');
  });

  it('returns undefined for unknown names with no pattern match', () => {
    expect(getLifecycleGroupByName('Sourcing')).toBeUndefined();
    expect(getLifecycleGroupByName(undefined)).toBeUndefined();
    expect(getLifecycleGroupByName('')).toBeUndefined();
    expect(getLifecycleGroupByName('   ')).toBeUndefined();
  });
});

describe('soft name classifier — stageNameGatesMemo (Phase 27 behavior preservation)', () => {
  it('returns true for any stage name in the underwriting group', () => {
    // These are the literal regex-set inputs the Phase 27 test fixture
    // exercised — see src/deals/stageProgressionGuard.test.ts. The
    // catalog refactor MUST keep them green.
    expect(stageNameGatesMemo('Underwriting')).toBe(true);
    expect(stageNameGatesMemo('Underwriting Review')).toBe(true);
    expect(stageNameGatesMemo('Senior Loan Committee')).toBe(true);
    expect(stageNameGatesMemo('committee')).toBe(true);
  });

  it('returns false for stages outside the underwriting group', () => {
    expect(stageNameGatesMemo('Origination')).toBe(false);
    expect(stageNameGatesMemo('Closing')).toBe(false);
    expect(stageNameGatesMemo('Funded')).toBe(false);
    expect(stageNameGatesMemo(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Ordering / regression protection
// ---------------------------------------------------------------------------

describe('ordering consistency — no duplicated stage-order arrays survive', () => {
  it('grep-like sweep: no governed module re-declares the canonical stage list', () => {
    // The forbidden literal lists below would each be a duplicate of
    // the catalog. If a future edit reintroduces one, this test
    // catches it by reading the source files directly.
    const filesToSweep = [
      'src/shared/governance/platformInventory.ts',
      'src/shared/governance/stageProgressionAvailability.ts',
      'src/shared/governance/releaseReadiness.ts',
      'src/deals/stageProgressionGuard.ts',
      'src/admin/ReleaseReadinessGate.tsx',
    ];
    const cwd = resolve(__dirname, '..', '..', '..'); // project root
    const forbiddenPatterns = [
      // Inline lifecycle ordering — must derive from the catalog.
      /\borigination\s*,\s*screening/i,
      /\bapplication\s*,\s*pricing\s*,\s*underwriting/i,
      /\bunderwriting\s*,\s*committee\s*,\s*closing/i,
      // Inline ordinal/order arrays for stages.
      /STAGE_ORDER\s*=/,
      /stageOrder\s*=/,
    ];
    for (const rel of filesToSweep) {
      let src = '';
      try {
        src = readFileSync(resolve(cwd, rel), 'utf8');
      } catch {
        continue; // file may not exist; that's fine
      }
      for (const pattern of forbiddenPatterns) {
        expect(
          pattern.test(src),
          `${rel} contains an inline stage-order pattern (${pattern}) that should derive from STAGE_CATALOG`,
        ).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Type-level + structural assertions (kept light — TS catches most of these)
// ---------------------------------------------------------------------------

describe('catalog structure exports', () => {
  it('every StageDefinition entry has all required fields', () => {
    for (const s of STAGE_CATALOG) {
      const def: StageDefinition = s;
      expect(typeof def.id).toBe('string');
      expect(typeof def.label).toBe('string');
      expect(typeof def.ordinal).toBe('number');
      expect(typeof def.isTerminal).toBe('boolean');
      expect(Array.isArray(def.allowedForwardTransitions)).toBe(true);
      const validGroups: LifecycleGroup[] = [
        'preflight',
        'pipeline',
        'underwriting',
        'closing',
        'postClosing',
        'terminal',
      ];
      expect(validGroups).toContain(def.lifecycleGroup);
    }
  });

  it('canTransitionStage matches the catalog graph exactly', () => {
    // For every (from, to) pair, canTransitionStage agrees with the
    // catalog's allowedForwardTransitions.
    for (const from of STAGE_CATALOG) {
      for (const to of STAGE_CATALOG) {
        const expected =
          from.id !== to.id &&
          from.allowedForwardTransitions.includes(to.id as StageId);
        expect(canTransitionStage(from.id, to.id)).toBe(expected);
      }
    }
  });
});
