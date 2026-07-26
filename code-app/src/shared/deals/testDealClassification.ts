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
 * N-17 remediation (Production Remediation Factory Arc Phase 11) — a governed
 * `cr664_istestrecord` Dataverse column (see scripts/schema-migrations/pr142-test-record-field/)
 * now exists as the authoritative classification once an admin sets it explicitly. Name-pattern
 * matching remains the fallback for every record the field hasn't been set on (including every
 * pre-existing deal, and any read path not yet wired to the new column) — this is deliberately
 * non-breaking: an explicit `true`/`false` on the field always wins; `undefined`/`null` (unset, or
 * not carried by a given read model) falls through to the name convention exactly as before.
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

/** A deal-like record carrying at least a display name, plus an optional GOVERNED classification
 *  field (cr664_istestrecord). When explicitly set (true or false), it is authoritative; when
 *  absent (undefined/null), classification falls back to the name convention. */
export interface NamedDealLike {
  readonly name?: string | null | undefined;
  readonly isTestRecord?: boolean | null | undefined;
}

/**
 * True when a deal record is a test/smoke record. The governed `isTestRecord` field, when
 * explicitly set, always wins over name inference — it is the authoritative signal once an admin
 * has classified the record. An unset field (undefined/null) falls back to name matching.
 */
export function isTestOrSmokeDeal(deal: NamedDealLike | null | undefined): boolean {
  if (deal?.isTestRecord === true) return true;
  if (deal?.isTestRecord === false) return false;
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
