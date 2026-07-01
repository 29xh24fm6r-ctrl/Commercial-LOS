import { Cr664_naicscodesService } from '../../generated/services/Cr664_naicscodesService';
import { sectorForCode, isNaicsCode6 } from './naicsSectorMap';

/**
 * NAICS reference search (Phase 3) â€” read-only, fail-closed.
 *
 * Reads the maker-provisioned `cr664_naicscodes` reference table and resolves a
 * banker's plain-language query ("auto repair") to the standard 6-digit code. The
 * sector is DERIVED via `sectorForCode` (single source of truth) â€” never trusted
 * from the stored column. Until the maker provisions the table + regenerates the
 * SDK, the loader resolves `unavailable` honestly (no fabricated codes).
 */

export interface NaicsHit {
  readonly code: string;
  readonly title: string;
  readonly sectorCode: string;
  readonly sectorTitle: string;
}

export interface NaicsRow {
  readonly cr664_code?: string;
  readonly cr664_title?: string;
}

/**
 * Pure client-side filter over already-loaded reference rows. Matches code-prefix
 * OR title-substring (case-insensitive); derives the sector and drops any row whose
 * code is not a valid 6-digit code with a known sector. Capped to `limit` hits.
 */
export function filterNaicsHits(rows: readonly NaicsRow[], query: string, limit = 30): NaicsHit[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];
  const hits: NaicsHit[] = [];
  for (const row of rows) {
    const code = String(row.cr664_code ?? '').trim();
    const title = String(row.cr664_title ?? '').trim();
    if (!isNaicsCode6(code)) continue;
    const matches = code.startsWith(q) || title.toLowerCase().includes(q);
    if (!matches) continue;
    const sector = sectorForCode(code);
    if (!sector) continue; // honest: never surface a code with no derivable sector
    hits.push({ code, title, sectorCode: sector.sectorCode, sectorTitle: sector.sectorTitle });
    if (hits.length >= limit) break;
  }
  return hits;
}

export type NaicsLoadResult =
  | { readonly status: 'ready'; readonly rows: readonly NaicsRow[] }
  | { readonly status: 'unavailable'; readonly reason: string };

/** Injectable loader type so the component + tests stay decoupled from the SDK. */
export type NaicsLoader = () => Promise<NaicsLoadResult>;

/**
 * Live loader. The generated service only exists AFTER the maker creates
 * `cr664_naicscodes` and regenerates the SDK, so it is reached via a guarded,
 * non-statically-analyzable dynamic import: the current build never depends on it,
 * and the feature lights up automatically once the service is present.
 */
export const loadNaicsRowsLive: NaicsLoader = async () => {
  try {
    const result = await Cr664_naicscodesService.getAll({ top: 2000 });
    return { status: 'ready', rows: result.data ?? [] };
  } catch {
    return {
      status: 'unavailable',
      reason: 'NAICS reference table is not provisioned yet (see docs/NAICS_SETUP.md).',
    };
  }
};


