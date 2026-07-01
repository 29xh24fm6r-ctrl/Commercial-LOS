import { sectorForCode } from './naicsSectorMap';

/**
 * Industry concentration (Phase 5) — the examiner-facing view of the book grouped
 * by 2-digit NAICS sector (derived via `sectorForCode`, the single source of truth).
 *
 * Exposure is OPTIONAL: a CRM company carries no exposure of its own (exposure lives
 * with its loans). When no exposure is supplied the view reports counts + % of book
 * honestly and marks exposure as not-yet-linked, becoming richer once a loan join is
 * wired. Companies with no / invalid NAICS fall into an explicit "unclassified"
 * bucket — never silently dropped or fabricated into a sector.
 */

export interface ConcentrationCompany {
  readonly naicsCode?: string;
  readonly exposure?: number;
}

export interface SectorConcentrationRow {
  readonly sectorCode: string;
  readonly sectorTitle: string;
  readonly count: number;
  readonly exposure: number;
  /** Share of the whole book by company count (0–100). */
  readonly pctOfBook: number;
}

export interface SectorConcentration {
  readonly rows: readonly SectorConcentrationRow[];
  readonly total: number;
  readonly classified: number;
  readonly unclassified: number;
  readonly exposureTotal: number;
  /** True only if at least one company carried a numeric exposure. */
  readonly hasExposure: boolean;
}

export function deriveSectorConcentration(
  companies: ReadonlyArray<ConcentrationCompany>,
): SectorConcentration {
  const total = companies.length;
  const acc = new Map<string, { sectorTitle: string; count: number; exposure: number }>();
  let unclassified = 0;
  let exposureTotal = 0;
  let hasExposure = false;

  for (const c of companies) {
    const exposure = typeof c.exposure === 'number' && Number.isFinite(c.exposure) ? c.exposure : undefined;
    if (exposure !== undefined) {
      hasExposure = true;
      exposureTotal += exposure;
    }
    const sector = c.naicsCode ? sectorForCode(c.naicsCode) : null;
    if (!sector) {
      unclassified++;
      continue;
    }
    const cur = acc.get(sector.sectorCode) ?? { sectorTitle: sector.sectorTitle, count: 0, exposure: 0 };
    cur.count += 1;
    cur.exposure += exposure ?? 0;
    acc.set(sector.sectorCode, cur);
  }

  const rows: SectorConcentrationRow[] = [...acc.entries()]
    .map(([sectorCode, v]) => ({
      sectorCode,
      sectorTitle: v.sectorTitle,
      count: v.count,
      exposure: v.exposure,
      pctOfBook: total > 0 ? +((v.count / total) * 100).toFixed(1) : 0,
    }))
    .sort((a, b) => b.count - a.count || a.sectorCode.localeCompare(b.sectorCode));

  return {
    rows,
    total,
    classified: total - unclassified,
    unclassified,
    exposureTotal,
    hasExposure,
  };
}
