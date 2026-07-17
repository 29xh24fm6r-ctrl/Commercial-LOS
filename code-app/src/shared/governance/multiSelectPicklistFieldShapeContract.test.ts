import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Regeneration guard for the only two genuine MultiSelectPicklist fields in the
 * generated SDK today. PAC has previously regenerated MultiSelectPicklist
 * fields incorrectly as scalars for other Power Platform projects — this repo
 * had NO test pinning these two fields' array shape before this file, meaning a
 * bad regen could silently flatten `cr664_relationshipexpansionopportunitytags`
 * or `cr664_assignmenthierarchy`/`cr664_assignmenthistory` from `X[]` to `X`
 * with nothing failing until a live symptom (a picklist that stopped saving
 * more than one selected tag).
 *
 * Run this BEFORE and AFTER any `pac code add-data-source` regeneration that
 * touches `cr664_loandeals` or `cr664_alertqueues` — a regen that fails this
 * test must be rejected (per the Dataverse remediation AAR's item E) and
 * re-diffed against live EntityDefinitions metadata before being accepted.
 */

const MODELS_DIR = resolve(__dirname, '..', '..', 'generated', 'models');
const SERVICES_DIR = resolve(__dirname, '..', '..', 'generated', 'services');

const read = (dir: string, file: string) => readFileSync(resolve(dir, file), 'utf8');

interface MultiSelectFieldExpectation {
  readonly table: string;
  readonly modelFile: string;
  readonly serviceFile: string;
  readonly fields: readonly string[];
}

const EXPECTATIONS: readonly MultiSelectFieldExpectation[] = [
  {
    table: 'cr664_loandeals',
    modelFile: 'Cr664_loandealsModel.ts',
    serviceFile: 'Cr664_loandealsService.ts',
    fields: ['cr664_relationshipexpansionopportunitytags'],
  },
  {
    table: 'cr664_alertqueues',
    modelFile: 'Cr664_alertqueuesModel.ts',
    serviceFile: 'Cr664_alertqueuesService.ts',
    fields: ['cr664_assignmenthierarchy', 'cr664_assignmenthistory'],
  },
];

describe('MultiSelectPicklist field shape contract (regeneration guard)', () => {
  for (const exp of EXPECTATIONS) {
    describe(exp.table, () => {
      const modelSrc = read(MODELS_DIR, exp.modelFile);
      const serviceSrc = read(SERVICES_DIR, exp.serviceFile);

      for (const field of exp.fields) {
        it(`${field} stays array-typed on the model (not flattened to a scalar)`, () => {
          // e.g. `cr664_relationshipexpansionopportunitytags?: Cr664_loandealscr664_relationshipexpansionopportunitytags[];`
          const arrayFieldPattern = new RegExp(`\\b${field}\\?:\\s*[A-Za-z0-9_]+\\[\\];`, 'g');
          const arrayMatches = modelSrc.match(arrayFieldPattern) ?? [];
          expect(arrayMatches.length, `${exp.modelFile} should declare ${field} as an array field exactly once`).toBe(1);

          // A scalar regression would declare the same field WITHOUT the trailing `[]`.
          const scalarFieldPattern = new RegExp(`\\b${field}\\?:\\s*[A-Za-z0-9_]+;`, 'g');
          const scalarMatches = modelSrc.match(scalarFieldPattern) ?? [];
          expect(
            scalarMatches.length,
            `${exp.modelFile} must NOT declare ${field} as a scalar (regen has flattened this exact kind of field before)`,
          ).toBe(0);
        });
      }

      it('the service still lists every expected field in multiSelectPicklistFields', () => {
        const match = /multiSelectPicklistFields\s*=\s*\[([^\]]*)\]/.exec(serviceSrc);
        expect(match, `${exp.serviceFile} should declare a multiSelectPicklistFields const`).not.toBeNull();
        const listed = (match?.[1] ?? '').split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean);
        for (const field of exp.fields) {
          expect(listed, `${exp.serviceFile}'s multiSelectPicklistFields should still list ${field}`).toContain(field);
        }
      });

      it('the service still wires serializeMultiSelectPicklistFields and deserializeMultiSelectPicklistFields', () => {
        expect(serviceSrc).toMatch(/serializeMultiSelectPicklistFields/);
        expect(serviceSrc).toMatch(/deserializeMultiSelectPicklistFields/);
      });
    });
  }
});
