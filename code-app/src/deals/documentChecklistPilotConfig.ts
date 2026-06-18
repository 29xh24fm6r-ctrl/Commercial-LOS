/**
 * Phase 188D -- document checklist pilot UI configuration.
 *
 * The UI panel is informational and DISABLED. This flag gates whether the panel
 * presents a "preview" posture; it NEVER enables generation. Even when true, the
 * view-model's `canGenerate` stays false in this phase (188D is not the live
 * generation phase). Separate from DOCUMENT_CHECKLIST_GENERATION_ENABLED, which
 * stays false and is the real runtime gate.
 */

/** Disabled by default. Gates the panel's informational/preview posture only. */
export const DOCUMENT_CHECKLIST_PILOT_UI_ENABLED = false as const;

/**
 * Phase 188I -- FUTURE-STATE flag for a controlled UI generate action (188J).
 *
 * Disabled constant only. It is NOT read by any clickable control in this phase
 * and never makes `canGenerate` true. It exists so the 188J controlled-proof can
 * flip a single, named, fail-closed switch (alongside the runtime gate
 * DOCUMENT_CHECKLIST_GENERATION_ENABLED) rather than editing component logic.
 * Both gates must be true for any future UI generation; either being false fails
 * closed. No live write, borrower contact, or auto-run is introduced by adding
 * this constant.
 */
export const DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED = false as const;

/**
 * Operator-curated approved checklist document names for the pilot preview.
 * Static config only -- never invented at runtime, never borrower-facing.
 */
export const DOCUMENT_CHECKLIST_PILOT_APPROVED_NAMES: readonly string[] = Object.freeze([
  '2024 Business Tax Return',
  '2025 Interim Financial Statements',
  'Debt Schedule',
]);
