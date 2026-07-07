/**
 * Ranking / grouping for the Link CRM client modal — keeps it usable as the CRM
 * grows past pilot data.
 *
 * The modal must NOT dump the whole CRM list. Instead:
 *   - with a short/empty query it shows only deal-name SUGGESTIONS (a small,
 *     relevant subset), never the full list;
 *   - a real search needs >= 2 characters, then results are ranked
 *     exact → starts-with → contains and capped to a small number;
 *   - client-target results are grouped into "Existing CRM Client" and the
 *     "CRM Company — will create/link borrower client record" bridge targets.
 *
 * Pure: no IO, no React. The modal renders whatever this returns; tests exercise
 * the ranking directly.
 */

import { type CrmLinkOption, CRM_COMPANY_OPTION_SUBLABEL } from './dealCrmLinkOptions';
import type { DealCrmLinkTarget } from './write/linkDealCrmEntity';

/** Minimum characters before a general search runs. */
export const MIN_SEARCH_CHARS = 2;
/** Small cap on visible results; extra matches show "refine your search". */
export const LINK_OPTION_RESULT_CAP = 20;

export const CLIENT_GROUP_TITLE = 'Existing CRM Client';
/** The bridge-target group title (matches the per-option company sublabel). */
export const ORG_GROUP_TITLE = CRM_COMPANY_OPTION_SUBLABEL;

export interface LinkOptionGroup {
  readonly key: string;
  /** Section heading; undefined for a single ungrouped list (e.g. teams). */
  readonly title?: string;
  readonly options: readonly CrmLinkOption[];
}

export interface RankedLinkOptions {
  /**
   * `prompt`  — query too short and no deal-name suggestions: ask the user to type.
   * `suggestions` — showing deal-name matches (short/empty query).
   * `search`  — showing ranked results for a >= 2-char query.
   */
  readonly mode: 'prompt' | 'suggestions' | 'search';
  readonly groups: readonly LinkOptionGroup[];
  /** How many options are actually shown (after the cap). */
  readonly visibleCount: number;
  /** How many matched in total (before the cap). */
  readonly totalCount: number;
  /** True when totalCount exceeded the cap (⇒ "More matches exist. Refine…"). */
  readonly hasMore: boolean;
}

function normalize(v: string | undefined): string {
  return (v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** exact(0) → starts-with(1) → contains(2), or null when the query misses. */
function queryScore(name: string, q: string): number | null {
  const n = normalize(name);
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.includes(q)) return 2;
  return null;
}

/**
 * Suggestion score of an option against the deal name: exact(0) → starts-with(1)
 * → contains(2) checked BOTH directions, then a shared leading token(3) so a
 * deal like "Acme Term Loan" still suggests the client "Acme Holdings LLC".
 */
function suggestionScore(name: string, deal: string): number | null {
  const n = normalize(name);
  if (n.length === 0 || deal.length === 0) return null;
  if (n === deal) return 0;
  if (deal.startsWith(n) || n.startsWith(deal)) return 1;
  if (deal.includes(n) || n.includes(deal)) return 2;
  const nTok = n.split(' ')[0];
  const dTok = deal.split(' ')[0];
  if (nTok.length >= 2 && nTok === dTok) return 3;
  return null;
}

function compare(a: { score: number; o: CrmLinkOption }, b: { score: number; o: CrmLinkOption }): number {
  if (a.score !== b.score) return a.score - b.score;
  return normalize(a.o.name).localeCompare(normalize(b.o.name));
}

function group(
  visible: readonly CrmLinkOption[],
  targetKind: DealCrmLinkTarget,
): LinkOptionGroup[] {
  if (targetKind !== 'client') {
    return visible.length > 0 ? [{ key: 'all', options: visible }] : [];
  }
  const clients = visible.filter((o) => (o.sourceKind ?? 'clientrelationship') !== 'organization');
  const orgs = visible.filter((o) => o.sourceKind === 'organization');
  const groups: LinkOptionGroup[] = [];
  // Preserve rank order: existing clients rank above bridge targets already, so
  // the client group naturally precedes the company group.
  if (clients.length > 0) groups.push({ key: 'client', title: CLIENT_GROUP_TITLE, options: clients });
  if (orgs.length > 0) groups.push({ key: 'organization', title: ORG_GROUP_TITLE, options: orgs });
  return groups;
}

/**
 * Decide what the modal shows for the given options, deal name, and query.
 * `cap` defaults to LINK_OPTION_RESULT_CAP.
 */
export function rankLinkOptions(args: {
  options: readonly CrmLinkOption[];
  dealName?: string;
  query: string;
  targetKind: DealCrmLinkTarget;
  cap?: number;
}): RankedLinkOptions {
  const { options, dealName, targetKind } = args;
  const cap = args.cap ?? LINK_OPTION_RESULT_CAP;
  const q = normalize(args.query);

  const finish = (mode: 'suggestions' | 'search', scored: Array<{ score: number; o: CrmLinkOption }>): RankedLinkOptions => {
    scored.sort(compare);
    const totalCount = scored.length;
    const visible = scored.slice(0, cap).map((x) => x.o);
    return {
      mode,
      groups: group(visible, targetKind),
      visibleCount: visible.length,
      totalCount,
      hasMore: totalCount > cap,
    };
  };

  if (q.length >= MIN_SEARCH_CHARS) {
    const scored: Array<{ score: number; o: CrmLinkOption }> = [];
    for (const o of options) {
      const score = queryScore(o.name, q);
      if (score !== null) scored.push({ score, o });
    }
    return finish('search', scored);
  }

  // Short / empty query: deal-name suggestions only (never the full list).
  const deal = normalize(dealName);
  if (deal.length === 0) {
    return { mode: 'prompt', groups: [], visibleCount: 0, totalCount: 0, hasMore: false };
  }
  const scored: Array<{ score: number; o: CrmLinkOption }> = [];
  for (const o of options) {
    const score = suggestionScore(o.name, deal);
    if (score !== null) scored.push({ score, o });
  }
  if (scored.length === 0) {
    return { mode: 'prompt', groups: [], visibleCount: 0, totalCount: 0, hasMore: false };
  }
  return finish('suggestions', scored);
}
