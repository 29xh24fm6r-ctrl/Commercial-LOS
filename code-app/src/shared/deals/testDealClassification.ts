/**
 * P1-11 — explicit classification of TEST / SMOKE / QA deal records.
 *
 * Smoke-test and QA deals (created during supervised smoke runs) were mixed into normal banker
 * pipeline counts and queues. They are named by a durable, deliberate convention — bracketed tags
 * and explicit phrases such as "[SMOKE TEST - PHASE 170K] TEST - New Deal Smoke 170K" or "[QA] …"
 * or "DO NOT USE". This module is the SINGLE, pure source of truth for recognizing them, so every
 * operational metric/queue can exclude them by default while an authorized admin surface can still
 * include them. Nothing is deleted — classification is display/aggregation-only.
 *
 * The patterns are deliberately SPECIFIC (bracketed tags or explicit test phrases) so an ordinary
 * deal name like "Acme Expansion" or "Latest Retail Deal" is never misclassified.
 *
 * A governed `cr664_istestrecord` Dataverse column exists, but production acceptance proved that
 * some unmistakably controlled records carry an explicit false value. Treating false as an
 * unconditional override contaminated operational totals. Classification therefore fails safe:
 * an explicit false plus governed controlled-record naming is a classification conflict. The
 * record remains visible to authorized investigation/data-quality workflows, but never enters an
 * operational default until the conflict is reviewed and corrected.
 */

const TEST_DEAL_PATTERNS: readonly RegExp[] = [
  // A bracketed classification tag: [SMOKE TEST - …], [TEST], [QA], [DEMO], [SANDBOX], [DO NOT USE],
  // [SYSTEM TEST].
  /\[\s*(system\s*test|smoke\s*test|smoke|test|qa|demo|sandbox|do\s*not\s*use)\b[^\]]*\]/i,
  // Explicit phrases anywhere in the name.
  /\bsmoke\s*test\b/i,
  /\bqa\s*test\b/i,
  /\btest\s*deal\b/i,
  /\bdo\s*not\s*use\b/i,
  // Production-controlled conventions observed during the 2026-07-29 acceptance run.
  // These are anchored or explicit phrases to avoid matching ordinary words containing "test".
  /^\s*(?:system\s*test|test|qa|smoke)\s*(?:[-—–:]|\b)/i,
  /^\s*ogb\s+full\s+workflow\s+test\b/i,
  /\bstage\s+advancement\s+smoke\b/i,
  /\bfull\s+e2e\b/i,
  /\b(?:v\d+\s+)?[\w\s-]*\bsmoke\b/i,
  // final-seven-workstreams (2026-07-23) — the repository's own controlled-test-record naming rule
  // is "SYSTEM TEST - <description>" as a NAME PREFIX (not necessarily bracketed). Anchored at the
  // start so an unrelated deal that happens to mention "system test" mid-sentence is never
  // misclassified.
  /^\s*system\s*test\s*-/i,
];

/** True when a deal NAME matches the test/smoke naming convention. Pure + deterministic. */
export function isTestOrSmokeDealName(name: string | null | undefined): boolean {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed.length === 0) return false;
  return TEST_DEAL_PATTERNS.some((re) => re.test(trimmed));
}

/** A deal-like record carrying at least a display name, plus an optional GOVERNED classification
 *  field (cr664_istestrecord). When explicitly set (true or false), it is authoritative; when
 *  absent (undefined/null), classification falls back to the name convention. */
export interface NamedDealLike {
  readonly name?: string | null | undefined;
  readonly isTestRecord?: boolean | null | undefined;
}

export type DealRecordClassificationKind =
  | 'operational'
  | 'controlled'
  | 'classification-conflict';

export interface DealRecordClassification {
  readonly kind: DealRecordClassificationKind;
  readonly governedFlag: boolean | null | undefined;
  readonly nameMatchesControlledConvention: boolean;
  readonly reason:
    | 'no-controlled-evidence'
    | 'governed-flag'
    | 'governed-name'
    | 'governed-flag-and-name'
    | 'explicit-false-conflicts-with-governed-name';
}

/**
 * Return the full classification, including the fail-safe conflict state required by production
 * data governance. Callers that only need inclusion/exclusion may use isTestOrSmokeDeal.
 */
export function classifyDealRecord(
  deal: NamedDealLike | null | undefined,
): DealRecordClassification {
  const governedFlag = deal?.isTestRecord;
  const nameMatchesControlledConvention = isTestOrSmokeDealName(deal?.name);

  if (governedFlag === true) {
    return {
      kind: 'controlled',
      governedFlag,
      nameMatchesControlledConvention,
      reason: nameMatchesControlledConvention
        ? 'governed-flag-and-name'
        : 'governed-flag',
    };
  }
  if (governedFlag === false && nameMatchesControlledConvention) {
    return {
      kind: 'classification-conflict',
      governedFlag,
      nameMatchesControlledConvention,
      reason: 'explicit-false-conflicts-with-governed-name',
    };
  }
  if (nameMatchesControlledConvention) {
    return {
      kind: 'controlled',
      governedFlag,
      nameMatchesControlledConvention,
      reason: 'governed-name',
    };
  }
  return {
    kind: 'operational',
    governedFlag,
    nameMatchesControlledConvention,
    reason: 'no-controlled-evidence',
  };
}

/**
 * True when a deal is controlled OR carries a classification conflict. A conflict is excluded
 * fail-safe from operational defaults and separately visible through classifyDealRecord.
 */
export function isTestOrSmokeDeal(deal: NamedDealLike | null | undefined): boolean {
  return classifyDealRecord(deal).kind !== 'operational';
}

export interface DealPartition<T> {
  /** Real, operational deals — the default set every metric/queue should count. */
  readonly operational: readonly T[];
  /** Classified test/smoke deals — preserved (never deleted), surfaced only to authorized admins. */
  readonly test: readonly T[];
  /** Explicit-false/name conflicts requiring production-data review. Also included in `test`. */
  readonly conflicts: readonly T[];
}

/** Split a deal list into operational vs test/smoke. Pure; order-preserving. */
export function partitionDealsByTestClassification<T extends NamedDealLike>(deals: readonly T[]): DealPartition<T> {
  const operational: T[] = [];
  const test: T[] = [];
  const conflicts: T[] = [];
  for (const d of deals) {
    const classification = classifyDealRecord(d);
    if (classification.kind === 'operational') operational.push(d);
    else {
      test.push(d);
      if (classification.kind === 'classification-conflict') conflicts.push(d);
    }
  }
  return { operational, test, conflicts };
}

/**
 * Apply the default operational exclusion. `includeTest` (admin-only) keeps the full set. This is the
 * one canonical helper every operational count/queue should route deal lists through so exclusion is
 * consistent and reconcilable.
 */
export function operationalDeals<T extends NamedDealLike>(
  deals: readonly T[],
  options: { readonly includeTest?: boolean } = {},
): readonly T[] {
  if (options.includeTest === true) return deals;
  return deals.filter((d) => !isTestOrSmokeDeal(d));
}
