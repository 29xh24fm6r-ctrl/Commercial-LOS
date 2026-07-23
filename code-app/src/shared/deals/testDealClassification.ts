/**
 * P1-11 — explicit classification of TEST / SMOKE / QA deal records.
 *
 * Smoke-test and QA deals (created during supervised smoke runs) were mixed into normal banker
 * pipeline counts and queues. There is no dedicated Dataverse flag for them, but they are named by a
 * durable, deliberate convention — bracketed tags and explicit phrases such as
 * "[SMOKE TEST - PHASE 170K] TEST - New Deal Smoke 170K" or "[QA] …" or "DO NOT USE". This module is
 * the SINGLE, pure source of truth for recognizing them, so every operational metric/queue can
 * exclude them by default while an authorized admin surface can still include them. Nothing is
 * deleted — classification is display/aggregation-only.
 *
 * The patterns are deliberately SPECIFIC (bracketed tags or explicit test phrases) so an ordinary
 * deal name like "Acme Expansion" or "Latest Retail Deal" is never misclassified.
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

/** A deal-like record carrying at least a display name. */
export interface NamedDealLike {
  readonly name?: string | null | undefined;
}

/** True when a deal record is a test/smoke record (by name). */
export function isTestOrSmokeDeal(deal: NamedDealLike | null | undefined): boolean {
  return isTestOrSmokeDealName(deal?.name);
}

export interface DealPartition<T> {
  /** Real, operational deals — the default set every metric/queue should count. */
  readonly operational: readonly T[];
  /** Classified test/smoke deals — preserved (never deleted), surfaced only to authorized admins. */
  readonly test: readonly T[];
}

/** Split a deal list into operational vs test/smoke. Pure; order-preserving. */
export function partitionDealsByTestClassification<T extends NamedDealLike>(deals: readonly T[]): DealPartition<T> {
  const operational: T[] = [];
  const test: T[] = [];
  for (const d of deals) {
    if (isTestOrSmokeDeal(d)) test.push(d);
    else operational.push(d);
  }
  return { operational, test };
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
