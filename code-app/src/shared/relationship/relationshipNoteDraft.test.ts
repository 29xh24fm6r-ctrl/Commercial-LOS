import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  buildRelationshipNoteText,
  LOCAL_DRAFT_FOOTER,
  type RelationshipNoteDraftInput,
} from './relationshipNoteDraft';

/**
 * Phase 78 — pure formatter tests for the banker relationship-note
 * draft. Pins:
 *   - heading + prepared-by line rendering;
 *   - active-deal pills rendered when present, omitted when empty;
 *   - note body always rendered (placeholder when blank);
 *   - follow-up + open-asks blocks rendered only when non-blank;
 *   - whitespace trimming on each user-typed block;
 *   - deterministic generatedAt formatting (ISO day, UTC);
 *   - LOCAL_DRAFT_FOOTER appended verbatim and exported as the
 *     authoritative disclaimer;
 *   - module hygiene: no SDK / generated / role imports; conservative
 *     copy discipline (no "saved", "logged", "recorded", "persisted",
 *     "synced", "AI-generated", "official record" tokens).
 */

const GENERATED_AT = new Date('2026-05-16T15:34:00Z');

function input(o: Partial<RelationshipNoteDraftInput> = {}): RelationshipNoteDraftInput {
  return {
    clientName: 'Acme Manufacturing',
    bankerName: 'M. Paller',
    noteText: 'Discussed quarterly results.',
    deals: [],
    generatedAt: GENERATED_AT,
    ...o,
  };
}

describe('Phase 78 — buildRelationshipNoteText', () => {
  it('renders the heading and prepared-by line for the happy path', () => {
    const out = buildRelationshipNoteText(input());
    expect(out).toContain('Relationship note — Acme Manufacturing');
    expect(out).toContain('Prepared 2026-05-16 by M. Paller');
  });

  it('omits the banker name from the prepared line when undefined', () => {
    const out = buildRelationshipNoteText(input({ bankerName: undefined }));
    expect(out).toContain('Prepared 2026-05-16');
    expect(out).not.toContain('by undefined');
  });

  it('omits the banker name from the prepared line when blank', () => {
    const out = buildRelationshipNoteText(input({ bankerName: '   ' }));
    expect(out).toContain('Prepared 2026-05-16');
    expect(out).not.toMatch(/by\s*$/m);
  });

  it('renders active-deal pills as a bulleted list when deals are present', () => {
    const out = buildRelationshipNoteText(
      input({
        deals: [
          { dealName: 'Acme RLOC', stage: 'Underwriting' },
          { dealName: 'Acme Term', stage: 'Closing' },
        ],
      }),
    );
    expect(out).toContain('Active deals:');
    expect(out).toContain('- Acme RLOC (Underwriting)');
    expect(out).toContain('- Acme Term (Closing)');
  });

  it('omits the stage parenthesis when stage is undefined', () => {
    const out = buildRelationshipNoteText(
      input({ deals: [{ dealName: 'Stageless Deal', stage: undefined }] }),
    );
    expect(out).toContain('- Stageless Deal');
    expect(out).not.toContain('- Stageless Deal (');
  });

  it('omits the Active deals block when deals array is empty', () => {
    const out = buildRelationshipNoteText(input({ deals: [] }));
    expect(out).not.toContain('Active deals:');
  });

  it('renders a placeholder when noteText is blank so the draft stays copy-able', () => {
    const out = buildRelationshipNoteText(input({ noteText: '   ' }));
    expect(out).toContain('Note:');
    expect(out).toContain('(banker note — fill in before copying)');
  });

  it('trims whitespace from noteText / followUpText / openAskText', () => {
    const out = buildRelationshipNoteText(
      input({
        noteText: '   discussed Q2 results.   ',
        followUpText: '\n  call after July 15  \n',
        openAskText: '   send updated PFS template   ',
      }),
    );
    expect(out).toContain('discussed Q2 results.');
    expect(out).not.toContain('   discussed Q2 results.   ');
    expect(out).toContain('call after July 15');
    expect(out).toContain('send updated PFS template');
  });

  it('omits the Follow-up block when followUpText is undefined / blank', () => {
    const outUndef = buildRelationshipNoteText(input({ followUpText: undefined }));
    expect(outUndef).not.toContain('Follow-up:');
    const outBlank = buildRelationshipNoteText(input({ followUpText: '   ' }));
    expect(outBlank).not.toContain('Follow-up:');
  });

  it('omits the Open asks block when openAskText is undefined / blank', () => {
    const outUndef = buildRelationshipNoteText(input({ openAskText: undefined }));
    expect(outUndef).not.toContain('Open asks / next steps:');
    const outBlank = buildRelationshipNoteText(input({ openAskText: '   ' }));
    expect(outBlank).not.toContain('Open asks / next steps:');
  });

  it('always appends LOCAL_DRAFT_FOOTER verbatim as the final line', () => {
    const out = buildRelationshipNoteText(input());
    const lines = out.split('\n');
    expect(lines[lines.length - 1]).toBe(LOCAL_DRAFT_FOOTER);
  });

  it('uses ISO day in UTC for the prepared date (deterministic across locales)', () => {
    // Midnight UTC on 2026-01-01 — ensure no off-by-one when the
    // generatedAt straddles a local-tz day boundary.
    const out = buildRelationshipNoteText(
      input({ generatedAt: new Date('2026-01-01T00:00:00Z') }),
    );
    expect(out).toContain('Prepared 2026-01-01');
  });

  describe('module hygiene', () => {
    const SRC = readFileSync(
      resolve(__dirname, 'relationshipNoteDraft.ts'),
      'utf8',
    );

    function stripComments(s: string): string {
      return s
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    }

    const CODE = stripComments(SRC);

    it('imports no SDK / generated service', () => {
      expect(CODE).not.toMatch(/from\s+['"][^'"]*generated\//);
      expect(CODE).not.toMatch(/Cr664_\w+Service/);
    });

    it('imports no role module (banker / manager / team / deals / executive / admin)', () => {
      const imports = SRC.match(/from\s+['"][^'"]+['"]/g) ?? [];
      for (const imp of imports) {
        expect(imp).not.toMatch(
          /\/(banker|manager|team|deals|executive|admin)\//,
        );
      }
    });

    it('does not contain affirmative persistence / sync / AI claims in code', () => {
      // The Phase 78 brief allows "Not saved to the system." in the
      // disclaimer (an explicit negation). The patterns below only
      // ban affirmative-tense claims — "is saved", "was logged",
      // "has been synced" etc. — so the negation pattern in the
      // disclaimer still passes.
      expect(CODE).not.toMatch(/\b(is|was|has been|will be)\s+saved\b/i);
      expect(CODE).not.toMatch(/\b(is|was|has been|will be)\s+logged\b/i);
      expect(CODE).not.toMatch(/\b(is|was|has been|will be)\s+recorded\b/i);
      expect(CODE).not.toMatch(/\b(is|was|has been|will be)\s+persisted\b/i);
      expect(CODE).not.toMatch(/\b(is|was|has been|will be)\s+synced\b/i);
      expect(CODE).not.toMatch(/\bAI[ -]?generated\b/i);
      expect(CODE).not.toMatch(/\bofficial\s+record\b/i);
      expect(CODE).not.toMatch(/\brelationship\s+memory\s+updated\b/i);
      // Heuristic: any contiguous phrase that asserts "<verb> to
      // Dataverse" or "<verb> to the system of record" is a positive
      // persistence claim regardless of tense.
      expect(CODE).not.toMatch(/\b(saved|logged|recorded|persisted|synced)\s+to\s+Dataverse\b/i);
    });

    it('the rendered footer is the exact phrase the brief mandates', () => {
      expect(LOCAL_DRAFT_FOOTER).toBe(
        '— Local draft. Not saved to the system. Paste into the appropriate system of record.',
      );
    });
  });
});
