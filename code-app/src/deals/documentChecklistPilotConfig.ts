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
 * Operator-curated approved checklist document names for the pilot preview.
 * Static config only -- never invented at runtime, never borrower-facing.
 */
export const DOCUMENT_CHECKLIST_PILOT_APPROVED_NAMES: readonly string[] = Object.freeze([
  '2024 Business Tax Return',
  '2025 Interim Financial Statements',
  'Debt Schedule',
]);
