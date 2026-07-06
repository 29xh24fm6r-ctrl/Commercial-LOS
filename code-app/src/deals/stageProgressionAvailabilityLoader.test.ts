import { describe, it, expect } from 'vitest';
import { loadStageProgressionAvailabilityWith } from './stageProgressionAvailabilityLoader';
import { CANONICAL_STAGES, type StageReferenceRow } from '../workflow/stageOrderingContract';

/**
 * WF-1A Item 1 — data-driven stage-progression availability. Availability flips
 * to available ONLY when a complete, conflict-free ordered set of the seven
 * canonical stages resolves; it fails closed (unavailable) on missing sequence
 * or a read error (the not-yet-provisioned cr664_sequence column).
 */

function seededRows(): StageReferenceRow[] {
  return CANONICAL_STAGES.map((s) => ({
    cr664_code: s.code,
    cr664_name: s.name,
    cr664_sequence: s.sequence,
    cr664_activeflag: true,
  }));
}

describe('loadStageProgressionAvailabilityWith', () => {
  it('is available when the seven canonical rows resolve to a unique ordered set', async () => {
    const availability = await loadStageProgressionAvailabilityWith(async () => seededRows());
    expect(availability.available).toBe(true);
  });

  it('fails closed (unavailable) when rows lack cr664_sequence (not yet seeded/regenerated)', async () => {
    const rows = seededRows().map((r) => ({ ...r, cr664_sequence: undefined }));
    const availability = await loadStageProgressionAvailabilityWith(async () => rows);
    expect(availability.available).toBe(false);
    expect(availability.banner).toMatch(/not yet available/i);
  });

  it('fails closed (unavailable) when the set is incomplete', async () => {
    const rows = seededRows().slice(0, 5); // missing two stages
    const availability = await loadStageProgressionAvailabilityWith(async () => rows);
    expect(availability.available).toBe(false);
  });

  it('fails closed (unavailable) when the read throws (missing column / service error)', async () => {
    const availability = await loadStageProgressionAvailabilityWith(async () => {
      throw new Error("Could not find a property named 'cr664_sequence' (0x80060888)");
    });
    expect(availability.available).toBe(false);
    expect(availability.banner).toMatch(/not yet available/i);
  });
});
