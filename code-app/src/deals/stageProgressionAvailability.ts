/**
 * Phase 28 — DELIBERATELY BLOCKED IMPLEMENTATION.
 *
 * The Phase 28 brief asked for a governed Advance Stage write that
 * fires only when the Phase 27 eligibility guard reports Clear.
 *
 * The critical guardrail in the brief is explicit:
 *
 *   "If the Dataverse schema does not provide a deterministic next-
 *    stage ordering/reference, do not implement the write. Keep
 *    Phase 28 as a blocked implementation with a clear schema
 *    limitation note. Do not hardcode a stage order just to ship
 *    the button."
 *
 * Schema audit, performed against the currently generated SDK
 * (src/generated/services/ and src/generated/models/):
 *
 *   - cr664_loandeal exposes stage via the
 *     cr664_StageReference@odata.bind lookup
 *     (see Cr664_loandealsModel.ts, required field).
 *   - There is NO Cr664_stagereferences service / model in the
 *     generated SDK. The reference entity that StageReference points
 *     to is not registered as a Power Apps data source, so we cannot
 *     enumerate available stages with the typed client.
 *   - No stage-order / sequence field is surfaced anywhere — not on
 *     cr664_loandeal, not on cr664_systemsettings, not on
 *     cr664_kpithresholdconfigurations.
 *   - cr664_loandeal does NOT carry an enum for stage either; it is
 *     purely a lookup. Even if we read the GUID we have no way to
 *     resolve "what comes next" without inventing a stage order.
 *
 * Conclusion: the write surface does not exist yet under the
 * deterministic-ordering guardrail. Phase 28 therefore ships a gate
 * function that reports unavailable + a schema-limitation banner in
 * the DealStageProgressionCard. No Advance Stage / Promote / Move
 * Stage button is rendered anywhere.
 *
 * To flip this gate to available in a future phase, ALL of the
 * following must be true:
 *   1. A stage-reference service exists in src/generated/services/
 *      (typically Cr664_dealstagereferencesService or similar).
 *   2. The corresponding model exposes an explicit ordering field
 *      (e.g. cr664_sequence, cr664_order, or an enum with a known
 *      ordinal contract).
 *   3. The stage-progression action follows the Phase 21/22/25
 *      coordination pattern (update + audit + timeline + correlation
 *      id + governance-partial outcome).
 *
 * Until those three conditions are met, this file is the single
 * source of truth that says "no" — flipping it later will be a tiny,
 * traceable change with no scattered toggles.
 */

export interface StageProgressionAvailability {
  available: boolean;
  /** Banker-facing one-line summary surfaced in the UI banner. */
  banner: string;
  /** Engineer-facing detail surfaced beneath the banner, suitable
   *  for inclusion in a JIRA / schema-design conversation. */
  detail: string;
}

const SCHEMA_LIMITATION_BANNER =
  'Advance Stage is not yet available on this workspace.';

const SCHEMA_LIMITATION_DETAIL =
  'The Dataverse schema does not currently expose a deterministic next-stage ordering (no Cr664_stagereferences service in the generated SDK, no sequence/order field on the loan deal record). A stage-progression write is intentionally not shipped until a typed stage-reference table with an ordering contract is available. See src/deals/stageProgressionAvailability.ts for the future-extension contract.';

/**
 * Returns the current write-availability state for Advance Stage.
 * Pure; no I/O. The function deliberately does not consume runtime
 * data — write availability is a SCHEMA-LEVEL property, not a
 * per-deal property. Per-deal eligibility lives in
 * deriveStageProgressionEligibility (Phase 27).
 */
export function stageProgressionAvailability(): StageProgressionAvailability {
  return {
    available: false,
    banner: SCHEMA_LIMITATION_BANNER,
    detail: SCHEMA_LIMITATION_DETAIL,
  };
}
