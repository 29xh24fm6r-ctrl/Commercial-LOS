/**
 * Phase PE-5 — dual risk rating + regulatory classification.
 *
 * A PURE, deterministic dual-grade model: an obligor grade (1–8, a PD scale, the
 * default-risk dimension) and a facility grade (an LGD band driven by collateral
 * coverage / lien / structure, the loss-severity dimension) blend into a single
 * loan grade, which maps to a regulatory classification (Pass / Special Mention /
 * Substandard / Doubtful / Loss). Overrides require justification; migration
 * (up/down) is tracked with dates; the PD/LGD feed the PE-4 credit provision.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - Pure. No IO, no fetch, no clock. Deterministic for a given input.
 *   - Classification is OBLIGOR-driven (repayment capacity); collateral changes
 *     loss severity (LGD / blended grade) but never un-criticizes a weak obligor.
 *   - An override with no justification is REJECTED, not silently applied.
 *   - PD/LGD are representative internal-scale midpoints (model parameters), not
 *     fabricated per-borrower data.
 */

export type ObligorGrade = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type RegulatoryClassification =
  | 'Pass'
  | 'Special Mention'
  | 'Substandard'
  | 'Doubtful'
  | 'Loss';

/** The internal obligor scale: grade → representative PD (fraction) + classification. */
export interface ObligorScaleRow {
  readonly grade: ObligorGrade;
  readonly label: string;
  readonly pd: number;
  readonly classification: RegulatoryClassification;
}

export const OBLIGOR_SCALE: readonly ObligorScaleRow[] = Object.freeze([
  { grade: 1, label: 'Minimal risk', pd: 0.0010, classification: 'Pass' },
  { grade: 2, label: 'Modest risk', pd: 0.0025, classification: 'Pass' },
  { grade: 3, label: 'Average risk', pd: 0.0075, classification: 'Pass' },
  { grade: 4, label: 'Acceptable risk', pd: 0.0200, classification: 'Pass' },
  { grade: 5, label: 'Special mention (watch)', pd: 0.0600, classification: 'Special Mention' },
  { grade: 6, label: 'Substandard', pd: 0.1500, classification: 'Substandard' },
  { grade: 7, label: 'Doubtful', pd: 0.4000, classification: 'Doubtful' },
  { grade: 8, label: 'Loss', pd: 1.0000, classification: 'Loss' },
]);

export type FacilityBand = 'strongly_secured' | 'well_secured' | 'partially_secured' | 'unsecured';

export interface FacilityScaleRow {
  readonly band: FacilityBand;
  readonly label: string;
  readonly lgd: number;
}

/** Ordered best → worst; index is used for notching. */
export const FACILITY_SCALE: readonly FacilityScaleRow[] = Object.freeze([
  { band: 'strongly_secured', label: 'Strongly secured', lgd: 0.15 },
  { band: 'well_secured', label: 'Well secured', lgd: 0.30 },
  { band: 'partially_secured', label: 'Partially secured', lgd: 0.50 },
  { band: 'unsecured', label: 'Unsecured', lgd: 0.65 },
]);

export interface FacilityInputs {
  readonly secured?: boolean;
  readonly collateralValue?: number;
  /** Exposure at default (falls back to the rating input's `ead`). */
  readonly exposure?: number;
  readonly lienPosition?: 'first' | 'junior' | string;
  /** Structural support (guarantees, covenants): strong improves, weak worsens. */
  readonly structureSupport?: 'strong' | 'standard' | 'weak';
}

export interface RatingMigration {
  readonly direction: 'upgrade' | 'downgrade' | 'affirmed';
  readonly notches: number;
  readonly fromGrade: number;
  readonly toGrade: number;
  readonly fromClassification: RegulatoryClassification;
  readonly toClassification: RegulatoryClassification;
  readonly fromDate?: string;
  readonly toDate: string;
  readonly classificationChanged: boolean;
}

export interface DualRatingRecord {
  readonly loanId?: string;
  readonly effectiveDate: string;
  readonly obligorGrade: ObligorGrade;
  readonly obligorLabel: string;
  readonly pd: number;
  readonly facilityBand: FacilityBand;
  readonly facilityLabel: string;
  readonly lgd: number;
  readonly blendedGrade: ObligorGrade;
  readonly classification: RegulatoryClassification;
  /** True once obligor grade ≥ 5 (regulatory watch and worse). */
  readonly criticized: boolean;
  /** True once obligor grade ≥ 6 (Substandard and worse). */
  readonly classified: boolean;
  readonly overridden: boolean;
  readonly overrideJustification?: string;
  readonly drivers: readonly string[];
  readonly ratedBy?: string;
  readonly rationale?: string;
  readonly migration?: RatingMigration;
}

export interface DualRatingInput {
  readonly loanId?: string;
  readonly effectiveDate: string;
  /** Analyst-assigned obligor grade (1–8). */
  readonly obligorGrade: ObligorGrade;
  readonly facility?: FacilityInputs;
  readonly ead?: number;
  readonly drivers?: readonly string[];
  readonly ratedBy?: string;
  readonly rationale?: string;
  /** Manual override of the blended grade — REQUIRES a justification. */
  readonly override?: { readonly blendedGrade: ObligorGrade; readonly justification?: string };
  /** Prior effective-dated record, for migration detection. */
  readonly prior?: DualRatingRecord;
}

export type DualRatingOutcome =
  | { readonly kind: 'rated'; readonly record: DualRatingRecord; readonly migrationEvent?: RatingMigration }
  | { readonly kind: 'override-rejected'; readonly reason: string };

function clampGrade(n: number): ObligorGrade {
  const c = Math.max(1, Math.min(8, Math.round(n)));
  return c as ObligorGrade;
}

function obligorRow(grade: ObligorGrade): ObligorScaleRow {
  return OBLIGOR_SCALE.find((r) => r.grade === grade) ?? OBLIGOR_SCALE[OBLIGOR_SCALE.length - 1];
}

/** Derive the facility band (LGD) from collateral coverage, lien, and structure. */
export function deriveFacilityGrade(facility: FacilityInputs | undefined, ead: number | undefined): FacilityScaleRow {
  const exposure = num(facility?.exposure) > 0 ? num(facility?.exposure) : num(ead);
  const collateral = num(facility?.collateralValue);

  let index: number;
  if (collateral > 0 && exposure > 0) {
    const coverage = collateral / exposure;
    index = coverage >= 1.25 ? 0 : coverage >= 1.0 ? 1 : coverage >= 0.5 ? 2 : 3;
  } else if (facility?.secured === true) {
    index = 1; // secured but unquantified → well secured
  } else {
    index = 3; // unsecured / unknown
  }

  // Junior lien worsens one band; structural support improves or worsens one.
  if (facility?.lienPosition && facility.lienPosition !== 'first') index += 1;
  if (facility?.structureSupport === 'strong') index -= 1;
  else if (facility?.structureSupport === 'weak') index += 1;

  index = Math.max(0, Math.min(FACILITY_SCALE.length - 1, index));
  return FACILITY_SCALE[index];
}

/** Blend obligor + facility into a single loan grade (criticized floor applies). */
export function blendGrades(obligorGrade: ObligorGrade, facilityBand: FacilityBand): ObligorGrade {
  const notch = facilityBand === 'strongly_secured' ? -1 : facilityBand === 'unsecured' ? 1 : 0;
  let blended = clampGrade(obligorGrade + notch);
  // Collateral changes loss severity, never un-criticizes a weak obligor.
  if (obligorGrade >= 5 && blended < 5) blended = 5 as ObligorGrade;
  return blended;
}

function deriveMigration(prior: DualRatingRecord | undefined, toGrade: number, toClass: RegulatoryClassification, toDate: string): RatingMigration | undefined {
  if (!prior) return undefined;
  const fromGrade = prior.blendedGrade;
  const notches = Math.abs(toGrade - fromGrade);
  // Lower grade number = better credit, so an increase is a downgrade.
  const direction = toGrade < fromGrade ? 'upgrade' : toGrade > fromGrade ? 'downgrade' : 'affirmed';
  return {
    direction,
    notches,
    fromGrade,
    toGrade,
    fromClassification: prior.classification,
    toClassification: toClass,
    fromDate: prior.effectiveDate,
    toDate,
    classificationChanged: prior.classification !== toClass,
  };
}

/**
 * Derive a dual risk rating. Returns the effective-dated record (with migration
 * vs the prior record when supplied), or an override-rejected outcome when a
 * manual override is provided without a justification.
 */
export function deriveDualRiskRating(input: DualRatingInput): DualRatingOutcome {
  if (input.override && (input.override.justification ?? '').trim().length === 0) {
    return { kind: 'override-rejected', reason: 'A rating override requires a written justification.' };
  }

  const obligorGrade = clampGrade(input.obligorGrade);
  const obligor = obligorRow(obligorGrade);
  const facility = deriveFacilityGrade(input.facility, input.ead);

  const computedBlended = blendGrades(obligorGrade, facility.band);
  const overridden = Boolean(input.override);
  const blendedGrade = overridden ? clampGrade(input.override!.blendedGrade) : computedBlended;

  // Classification is obligor-driven (repayment capacity).
  const classification = obligor.classification;

  const migration = deriveMigration(input.prior, blendedGrade, classification, input.effectiveDate);

  const record: DualRatingRecord = {
    loanId: input.loanId,
    effectiveDate: input.effectiveDate,
    obligorGrade,
    obligorLabel: obligor.label,
    pd: obligor.pd,
    facilityBand: facility.band,
    facilityLabel: facility.label,
    lgd: facility.lgd,
    blendedGrade,
    classification,
    criticized: obligorGrade >= 5,
    classified: obligorGrade >= 6,
    overridden,
    overrideJustification: overridden ? input.override!.justification : undefined,
    drivers: input.drivers ?? [],
    ratedBy: input.ratedBy,
    rationale: input.rationale,
    migration,
  };

  // A migration event is emitted on any grade or classification change.
  const migrationEvent = migration && (migration.direction !== 'affirmed' || migration.classificationChanged) ? migration : undefined;

  return { kind: 'rated', record, migrationEvent };
}

/** Append a rating to effective-dated history, newest last, stable by date. */
export function appendRatingHistory(
  history: readonly DualRatingRecord[],
  record: DualRatingRecord,
): readonly DualRatingRecord[] {
  return [...history, record].slice().sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
}

/** Canonical classification order for reporting. */
export const CLASSIFICATION_ORDER: readonly RegulatoryClassification[] = Object.freeze([
  'Pass',
  'Special Mention',
  'Substandard',
  'Doubtful',
  'Loss',
]);

export interface ClassificationCount {
  readonly classification: RegulatoryClassification;
  readonly count: number;
}

export interface PortfolioClassification {
  readonly total: number;
  /** Grade ≥ 5 (Special Mention and worse). */
  readonly criticizedCount: number;
  /** Grade ≥ 6 (Substandard and worse). */
  readonly classifiedCount: number;
  readonly distribution: readonly ClassificationCount[];
}

/** Roll a set of dual ratings into the regulatory classification distribution. */
export function derivePortfolioClassification(
  records: readonly DualRatingRecord[],
): PortfolioClassification {
  const counts = new Map<RegulatoryClassification, number>();
  for (const c of CLASSIFICATION_ORDER) counts.set(c, 0);
  let criticizedCount = 0;
  let classifiedCount = 0;
  for (const r of records) {
    counts.set(r.classification, (counts.get(r.classification) ?? 0) + 1);
    if (r.criticized) criticizedCount += 1;
    if (r.classified) classifiedCount += 1;
  }
  return {
    total: records.length,
    criticizedCount,
    classifiedCount,
    distribution: CLASSIFICATION_ORDER.map((classification) => ({ classification, count: counts.get(classification) ?? 0 })),
  };
}

/** Bridge to PE-4: turn a dual rating into profitability risk inputs (PD/LGD/EAD). */
export function dualRatingToRiskInputs(
  record: DualRatingRecord,
  ead?: number,
): { pd: number; lgd: number; ead?: number } {
  return { pd: record.pd, lgd: record.lgd, ead };
}

function num(n: number | undefined | null): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}
