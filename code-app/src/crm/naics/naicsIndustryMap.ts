/**
 * Phase 4B — NAICS sector → deal industry resolution (pure).
 *
 * The deal's cr664_industry is a fixed six-value choice set. This module maps a
 * CRM organization's NAICS classification to one of those values USING ONLY the
 * admin-managed cr664_naicsindustrymap rows — never a hard-coded guess. A sector
 * with no active mapping row (or a row pointing at a non-real industry) resolves
 * to `no-mapping`, so the caller shows the honest "no mapped deal industry option
 * exists" state instead of fabricating one.
 *
 * Pure data + pure functions: no I/O, no SDK import.
 */

import { Cr664_loandealscr664_industry } from '../../generated/models/Cr664_loandealsModel';
import { sectorForCode, type SectorResolution } from './naicsSectorMap';

/** The six real deal industry labels (from the cr664_industry choice set). */
export const DEAL_INDUSTRY_LABELS: readonly string[] = Object.values(Cr664_loandealscr664_industry);

/** True when a string is one of the six real deal industry labels. */
export function isDealIndustryLabel(v: string | undefined | null): boolean {
  return typeof v === 'string' && DEAL_INDUSTRY_LABELS.includes(v.trim());
}

/** One admin-managed mapping row (subset we read). */
export interface NaicsIndustryMapRow {
  readonly sectorCode?: string;
  readonly dealIndustry?: string;
  readonly active?: boolean;
}

export type SectorIndustryResolution =
  | { kind: 'mapped'; dealIndustry: string }
  | { kind: 'no-mapping' };

function norm(v: string | undefined): string {
  return (v ?? '').trim().toLowerCase();
}

/**
 * Resolve the deal industry mapped to a NAICS sector code from the active mapping
 * rows. `no-mapping` when no active row matches or the matched row points at a
 * value that is not a real deal industry label (honest — never fabricated).
 */
export function resolveDealIndustryForSector(
  sectorCode: string,
  rows: readonly NaicsIndustryMapRow[],
): SectorIndustryResolution {
  const want = norm(sectorCode);
  if (want.length === 0) return { kind: 'no-mapping' };
  for (const r of rows) {
    if (r.active === false) continue;
    if (norm(r.sectorCode) !== want) continue;
    const industry = (r.dealIndustry ?? '').trim();
    if (isDealIndustryLabel(industry)) return { kind: 'mapped', dealIndustry: industry };
    // A row that maps to a non-real industry is treated as no-mapping, not a fabrication.
    return { kind: 'no-mapping' };
  }
  return { kind: 'no-mapping' };
}

export type NaicsIndustryResolution =
  | { kind: 'mapped'; naicsCode: string; sector: SectorResolution; dealIndustry: string }
  | { kind: 'no-mapping'; naicsCode: string; sector: SectorResolution }
  | { kind: 'no-sector'; naicsCode: string };

/**
 * Resolve a 6-digit NAICS code all the way to a deal industry: code → sector
 * (via the fixed sector map) → mapped industry (via the admin mapping rows). An
 * invalid / unknown-prefix code is `no-sector`; a valid sector with no active
 * mapping is `no-mapping`.
 */
export function resolveDealIndustryFromNaics(
  naicsCode: string,
  rows: readonly NaicsIndustryMapRow[],
): NaicsIndustryResolution {
  const code = (naicsCode ?? '').trim();
  const sector = sectorForCode(code);
  if (!sector) return { kind: 'no-sector', naicsCode: code };
  const mapping = resolveDealIndustryForSector(sector.sectorCode, rows);
  if (mapping.kind === 'mapped') {
    return { kind: 'mapped', naicsCode: code, sector, dealIndustry: mapping.dealIndustry };
  }
  return { kind: 'no-mapping', naicsCode: code, sector };
}
