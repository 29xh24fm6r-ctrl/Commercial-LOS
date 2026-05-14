import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DELIBERATELY_BLOCKED,
  EXEC_TRANSITIONAL_FALLBACK_FEATURES,
  GOVERNED_WRITES,
  LOCAL_ONLY_FLOWS,
  NOT_WIRED,
  PERMISSION_BEFORE_QUERY_VERIFIED,
  REFERENCE_DATA_GOVERNED,
  WORKSPACE_DEAL_ACCESS,
  WORKSPACE_ISOLATION_VERIFIED,
} from './platformInventory';

/**
 * Phase 40: pin the static metadata so a future edit cannot silently
 * move a known blocker into "shipped" or accidentally drop a guard
 * row. The Release Readiness Gate and the Phase-40 docs both read
 * this module — drift here would mislead both.
 */

describe('platformInventory — governed writes', () => {
  it('contains the eight shipped governed writes (Phases 18, 19, 21, 22, 25, 51, 55)', () => {
    const ids = GOVERNED_WRITES.map((w) => w.id).sort();
    expect(ids).toEqual(
      [
        'alert-dismiss',
        'alert-resolve',
        'credit-memo-draft-save',
        'data-quality-flag-resolve',
        'deal-document-receive',
        'deal-document-request',
        'deal-document-review',
        'deal-task-complete',
      ].sort(),
    );
  });

  it('every governed write emits audit; deal-domain writes also emit a timeline event', () => {
    for (const w of GOVERNED_WRITES) {
      expect(w.emitsAudit).toBe(true);
    }
    const dealWrites = GOVERNED_WRITES.filter((w) =>
      [
        'deal-task-complete',
        'deal-document-request',
        'deal-document-receive',
        'deal-document-review',
        'credit-memo-draft-save',
      ].includes(w.id),
    );
    for (const w of dealWrites) {
      expect(w.emitsTimeline).toBe(true);
    }
  });

  it('does NOT list any unbuilt write surface as a shipped governed write', () => {
    // These are explicitly deferred per the brief — they MUST NOT
    // appear under shipped governed writes. Note that
    // `document-upload` (binary file upload) remains here even
    // though Phase 51 shipped `deal-document-receive` — receive is
    // a metadata-only write, not a binary upload.
    const forbidden = [
      'stage-progression-advance',
      'credit-memo-finalize',
      'borrower-email-send',
      'document-upload',
      'ai-generation',
    ];
    const ids = new Set(GOVERNED_WRITES.map((w) => w.id));
    for (const id of forbidden) expect(ids.has(id)).toBe(false);
  });
});

describe('platformInventory — deliberately blocked', () => {
  it('lists stage-progression-advance as Blocked with the schema reason', () => {
    const entry = DELIBERATELY_BLOCKED.find(
      (b) => b.id === 'stage-progression-advance',
    );
    expect(entry).toBeDefined();
    expect(entry!.reason).toMatch(/stagereferences|stage reference/i);
    expect(entry!.reason).toMatch(/ordering|sequence/i);
  });
});

describe('platformInventory — not wired', () => {
  it('lists every brief-mandated capability that is not built', () => {
    const ids = new Set(NOT_WIRED.map((n) => n.id));
    expect(ids.has('email-delivery')).toBe(true);
    expect(ids.has('document-upload')).toBe(true);
    expect(ids.has('ai-generation')).toBe(true);
    expect(ids.has('test-coverage-build-verification')).toBe(true);
    expect(ids.has('stage-reference-data-source')).toBe(true);
    expect(ids.has('stage-ordering-contract')).toBe(true);
    expect(ids.has('executive-deal-drillthrough')).toBe(true);
    expect(ids.has('admin-deal-drillthrough')).toBe(true);
  });

  it('every not-wired entry has a concrete reason (not a vague "coming soon")', () => {
    for (const n of NOT_WIRED) {
      expect(n.reason.length).toBeGreaterThan(40);
      expect(/\bcoming soon\b/i.test(n.reason)).toBe(false);
      expect(/\btbd\b/i.test(n.reason)).toBe(false);
    }
  });

  it('email-delivery reason explicitly mentions no Outlook / no Graph and the Phase-23 local-only stance', () => {
    const email = NOT_WIRED.find((n) => n.id === 'email-delivery')!;
    expect(email.reason).toMatch(/outlook|graph/i);
    expect(email.reason).toMatch(/local-only|copy-to-clipboard/i);
    expect(email.reason).toMatch(/BorrowerUpdateSent/);
  });

  it('test-coverage-build-verification reason explicitly says no in-process signal', () => {
    const tcv = NOT_WIRED.find(
      (n) => n.id === 'test-coverage-build-verification',
    )!;
    expect(tcv.reason).toMatch(/no runtime signal|in-process signal/i);
  });
});

describe('platformInventory — executive transitional fallback', () => {
  it('lists the two Phase-15 transitional surfaces', () => {
    expect([...EXEC_TRANSITIONAL_FALLBACK_FEATURES].sort()).toEqual(
      ['MonthlyClosingForecast', 'PipelineByStage'].sort(),
    );
  });
});

describe('platformInventory — local-only flows', () => {
  it('lists borrower update draft and credit memo local preview', () => {
    const ids = new Set(LOCAL_ONLY_FLOWS.map((f) => f.id));
    expect(ids.has('borrower-update-draft')).toBe(true);
    expect(ids.has('credit-memo-local-preview')).toBe(true);
  });

  it('every local-only flow note explicitly states no Dataverse write', () => {
    for (const f of LOCAL_ONLY_FLOWS) {
      expect(f.note.toLowerCase()).toMatch(/no dataverse write|no.*write/);
    }
  });
});

describe('platformInventory — workspace deal access matrix', () => {
  it('banker is read-write; manager and team are read-only; executive and admin are denied', () => {
    const byRole = new Map(WORKSPACE_DEAL_ACCESS.map((w) => [w.role, w]));
    expect(byRole.get('banker')?.dealAccess).toBe('read-write');
    expect(byRole.get('manager')?.dealAccess).toBe('read-only');
    expect(byRole.get('team')?.dealAccess).toBe('read-only');
    expect(byRole.get('executive')?.dealAccess).toBe('denied');
    expect(byRole.get('admin')?.dealAccess).toBe('denied');
  });

  it('every non-denied workspace names its authorization function', () => {
    for (const w of WORKSPACE_DEAL_ACCESS) {
      if (w.dealAccess === 'denied') {
        expect(w.authFunction).toBeNull();
      } else {
        expect(w.authFunction).toMatch(/^loadDealFor/);
      }
    }
  });
});

describe('platformInventory — architectural invariants', () => {
  it('workspace isolation and permission-before-query are currently verified true', () => {
    expect(WORKSPACE_ISOLATION_VERIFIED).toBe(true);
    expect(PERMISSION_BEFORE_QUERY_VERIFIED).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase 43 — Stage Progression Enablement Map cross-reference
//
// Pins the standing invariant that the enablement map exists and that
// stage progression remains blocked. The enablement map plans the
// unblock; it must NOT change the blocked status.
// ---------------------------------------------------------------------------

describe('platformInventory — Phase 43 stage progression enablement', () => {
  it('REFERENCE_DATA_GOVERNED.stageCatalog.progressionEnabled is still false', () => {
    expect(REFERENCE_DATA_GOVERNED.stageCatalog.progressionEnabled).toBe(false);
  });

  it('stage-progression-advance is still in DELIBERATELY_BLOCKED', () => {
    const entry = DELIBERATELY_BLOCKED.find(
      (b) => b.id === 'stage-progression-advance',
    );
    expect(entry).toBeDefined();
  });

  it('stage-progression-advance is NOT in GOVERNED_WRITES', () => {
    const writeIds = new Set(GOVERNED_WRITES.map((w) => w.id));
    expect(writeIds.has('stage-progression-advance')).toBe(false);
  });

  it('blocked reason still cites the Phase 28 schema gap', () => {
    const entry = DELIBERATELY_BLOCKED.find(
      (b) => b.id === 'stage-progression-advance',
    )!;
    expect(entry.reason).toMatch(/Cr664_stagereferences|sequence|stage reference/i);
  });

  it('stage-progression-advance carries an enablementMapPath pointing at the planning doc', () => {
    const entry = DELIBERATELY_BLOCKED.find(
      (b) => b.id === 'stage-progression-advance',
    )!;
    expect(entry.enablementMapPath).toBe(
      'docs/STAGE_PROGRESSION_ENABLEMENT_MAP.md',
    );
  });

  it('the enablement map file actually exists on disk', () => {
    // Repo root from this test file: src/shared/governance/ → up 3.
    const repoRoot = resolve(__dirname, '..', '..', '..');
    const mapPath = resolve(repoRoot, 'docs/STAGE_PROGRESSION_ENABLEMENT_MAP.md');
    expect(existsSync(mapPath)).toBe(true);
  });
});
