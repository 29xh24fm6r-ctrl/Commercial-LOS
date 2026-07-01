import { describe, it, expect } from 'vitest';
import {
  RISK_RATING_TABLE,
  DUAL_RATING_COLUMNS,
  DUAL_RATING_COLUMN_NAMES,
  REGULATORY_CLASSIFICATION_VALUES,
  RISK_RATING_OPTION_SETS,
  RISK_RATING_SCHEMA_VERSION,
} from './riskRatingSchemaPlan';
import { OBLIGOR_SCALE } from './dualRiskRating';

describe('PE-5 — dual rating schema plan', () => {
  it('declares the additive dual-rating columns on the boarded loan', () => {
    expect(RISK_RATING_SCHEMA_VERSION).toMatch(/^PE-5/);
    for (const name of [
      'cr664_obligorgrade',
      'cr664_facilityband',
      'cr664_blendedgrade',
      'cr664_regulatoryclassification',
      'cr664_ratingoverridejustification',
      'cr664_ratingmigrationdirection',
    ]) {
      expect(DUAL_RATING_COLUMN_NAMES).toContain(name);
    }
    for (const c of DUAL_RATING_COLUMNS) {
      expect(c.tableLogicalName).toBe(RISK_RATING_TABLE);
      expect(c.logicalName.startsWith('cr664_')).toBe(true);
      expect(c.requiredForCreate).toBe(false);
    }
  });

  it('plans the five canonical regulatory classifications', () => {
    expect(REGULATORY_CLASSIFICATION_VALUES).toEqual(['Pass', 'Special Mention', 'Substandard', 'Doubtful', 'Loss']);
    expect(RISK_RATING_OPTION_SETS.map((o) => o.key)).toContain('regulatoryClassification');
  });

  it('every obligor scale classification is one of the planned option-set values', () => {
    for (const row of OBLIGOR_SCALE) {
      expect(REGULATORY_CLASSIFICATION_VALUES).toContain(row.classification);
    }
  });

  it('carries no dollar-amount literals', () => {
    expect(/\$\s*\d/.test(JSON.stringify(DUAL_RATING_COLUMNS))).toBe(false);
  });
});
