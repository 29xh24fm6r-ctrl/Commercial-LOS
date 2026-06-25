import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseFinalLaunchSmokeEvidence,
  type FinalLaunchSmokeEvidence,
} from './finalLaunchSmokeEvidence';

/**
 * Phase 256A — node-only loader for operator-recorded final-launch smoke artifacts.
 *
 * Reads docs/operator-evidence/final-launch/*.json and returns only records that VALIDATE
 * against the fail-closed parser. Malformed files are reported as errors and dropped (never
 * coerced into a pass). This file imports node:fs and is therefore imported ONLY by node
 * contexts (governance loader / tests / the operator console) — never by the app bundle.
 */

export const FINAL_LAUNCH_EVIDENCE_DIR = 'docs/operator-evidence/final-launch';

export interface LoadedFinalLaunchEvidence {
  readonly records: readonly FinalLaunchSmokeEvidence[];
  readonly errors: ReadonlyArray<{ readonly file: string; readonly errors: readonly string[] }>;
}

/**
 * @param baseDir absolute repo root (so callers can point at a fixture dir in tests).
 * @param dir relative evidence dir (defaults to FINAL_LAUNCH_EVIDENCE_DIR).
 */
export function loadFinalLaunchSmokeRecords(baseDir: string, dir: string = FINAL_LAUNCH_EVIDENCE_DIR): LoadedFinalLaunchEvidence {
  const abs = resolve(baseDir, dir);
  if (!existsSync(abs)) return { records: [], errors: [] };

  const records: FinalLaunchSmokeEvidence[] = [];
  const errors: { file: string; errors: string[] }[] = [];
  for (const name of readdirSync(abs).filter((f) => f.toLowerCase().endsWith('.json')).sort()) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(resolve(abs, name), 'utf8').replace(/^﻿/, ''));
    } catch (err: unknown) {
      errors.push({ file: name, errors: [`invalid JSON: ${err instanceof Error ? err.message : String(err)}`] });
      continue;
    }
    const parsed = parseFinalLaunchSmokeEvidence(raw);
    if (parsed.ok) records.push(parsed.evidence);
    else errors.push({ file: name, errors: [...parsed.errors] });
  }
  return { records, errors };
}
