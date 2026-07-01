/**
 * Phase PE-5 — dual risk rating + classification schema PLAN.
 *
 * Standalone (not folded into the pinned boarding plan). Documents the additive
 * dual-rating dimension on the boarded loan — obligor grade / PD, facility band /
 * LGD, blended grade, regulatory classification, criticized/classified flags,
 * override justification, and migration — plus the RegulatoryClassification
 * reference option set. CONSTANTS ONLY: no IO, no writes, nothing created.
 *
 * Additive + optional: reads must fail closed when a column is not provisioned
 * (see PE-0A). No fabricated borrower/loan/$ data.
 */

import type { TargetColumnPlan } from '../../portfolioBoarding/portfolioLoanBoardingDataverseSchemaPlan';
import type { TargetOptionSetPlan } from '../../portfolioBoarding/portfolioLoanBoardingDataverseSchemaPlan';

export const RISK_RATING_SCHEMA_VERSION = 'PE-5.1';

/** The boarded-loan root table these additive dual-rating columns attach to. */
export const RISK_RATING_TABLE = 'cr664_portfolioboardedloan';

/** The existing reference entities this plan reads option sets from. */
export const RISK_RATING_REFERENCE_TABLE = 'cr664_riskratingreference';
export const REGULATORY_CLASSIFICATION_REFERENCE_TABLE = 'cr664_regulatoryclassificationreference';

function col(
  shortName: string,
  displayName: string,
  dataType: TargetColumnPlan['dataType'],
  extra: Partial<TargetColumnPlan> = {},
): TargetColumnPlan {
  return {
    tableLogicalName: RISK_RATING_TABLE,
    logicalName: `cr664_${shortName}`,
    schemaName: `cr664_${shortName.charAt(0).toUpperCase()}${shortName.slice(1)}`,
    displayName,
    dataType,
    requiredLevel: 'None',
    description: displayName,
    sourceModelPath: '',
    requiredForCreate: false,
    requiredForFDIC: false,
    requiredForBoard: false,
    requiredForPortfolioMonitoring: true,
    ...extra,
  };
}

export const DUAL_RATING_COLUMNS: readonly TargetColumnPlan[] = Object.freeze([
  col('obligorgrade', 'Obligor grade (1–8)', 'Integer', { sourceModelPath: 'obligorGrade' }),
  col('obligorpd', 'Obligor PD', 'Decimal', { precision: 6, sourceModelPath: 'pd' }),
  col('facilityband', 'Facility band', 'String', { sourceModelPath: 'facilityBand' }),
  col('facilitylgd', 'Facility LGD', 'Decimal', { precision: 4, sourceModelPath: 'lgd' }),
  col('blendedgrade', 'Blended loan grade (1–8)', 'Integer', { sourceModelPath: 'blendedGrade' }),
  col('regulatoryclassification', 'Regulatory classification', 'Picklist', {
    optionSetKey: 'regulatoryClassification',
    sourceModelPath: 'classification',
  }),
  col('criticized', 'Criticized (grade ≥ 5)', 'Boolean', { sourceModelPath: 'criticized' }),
  col('classified', 'Classified (grade ≥ 6)', 'Boolean', { sourceModelPath: 'classified' }),
  col('ratingoverridden', 'Rating overridden', 'Boolean', { sourceModelPath: 'overridden' }),
  col('ratingoverridejustification', 'Rating override justification', 'Memo', {
    description: 'Required written justification when the blended grade is overridden.',
    sourceModelPath: 'overrideJustification',
  }),
  col('ratingmigrationdirection', 'Rating migration direction', 'String', {
    description: 'upgrade / downgrade / affirmed vs the prior effective-dated rating.',
    sourceModelPath: 'migration.direction',
  }),
  col('ratingeffectivedate', 'Rating effective date', 'DateTime', { sourceModelPath: 'effectiveDate' }),
]);

export const DUAL_RATING_COLUMN_NAMES: readonly string[] = Object.freeze(
  DUAL_RATING_COLUMNS.map((c) => c.logicalName),
);

/** The canonical regulatory classifications (option set values). */
export const REGULATORY_CLASSIFICATION_VALUES: readonly string[] = Object.freeze([
  'Pass',
  'Special Mention',
  'Substandard',
  'Doubtful',
  'Loss',
]);

export const RISK_RATING_OPTION_SETS: readonly TargetOptionSetPlan[] = Object.freeze([
  {
    key: 'regulatoryClassification',
    displayName: 'Regulatory classification',
    description: 'Pass / Special Mention / Substandard / Doubtful / Loss.',
  },
  {
    key: 'facilityBand',
    displayName: 'Facility band',
    description: 'Strongly secured / well secured / partially secured / unsecured (LGD driver).',
  },
]);
