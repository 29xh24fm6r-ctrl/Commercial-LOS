/** Type declarations for the import-safe NAICS seed helpers (shared by the CLI + tests). */

export interface NaicsSectorEntry {
  readonly sectorCode: string;
  readonly sectorTitle: string;
}

export interface NaicsSeedRecord {
  readonly cr664_code: string;
  readonly cr664_title: string;
  readonly cr664_sectorcode: string;
  readonly cr664_sectortitle: string;
  readonly cr664_naicsversion: string;
}

export interface NaicsSeedResult {
  readonly records: NaicsSeedRecord[];
  readonly errors: string[];
  readonly skipped: number;
}

export const SECTOR_BY_PREFIX: Readonly<Record<string, NaicsSectorEntry>>;

export function parseCsv(text: string): string[][];

export function buildNaicsSeed(
  pairs: ReadonlyArray<readonly [unknown, unknown]>,
  version: string,
): NaicsSeedResult;
