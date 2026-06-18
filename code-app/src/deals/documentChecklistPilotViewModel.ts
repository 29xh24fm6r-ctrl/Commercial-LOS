/**
 * Phase 188D -- pure view-model for the disabled document checklist pilot panel.
 *
 * Derives a read-only preview of which approved checklist names would be created
 * vs already present on the deal, using the SAME trim + case-insensitive
 * normalization proven in 188B / 188C. It performs no IO and triggers no action:
 * `canGenerate` is ALWAYS false in this phase. The panel is informational only.
 */

export type DocumentChecklistPilotStatus = 'pilot_disabled' | 'preview_ready' | 'blocked';

export interface DocumentChecklistPilotViewModel {
  readonly status: DocumentChecklistPilotStatus;
  readonly approvedNames: readonly string[];
  readonly alreadyPresentNames: readonly string[];
  readonly wouldCreateNames: readonly string[];
  readonly safetyMessages: readonly string[];
  readonly disabledReason: string | undefined;
  /** ALWAYS false in 188D -- the UI may never trigger generation. */
  readonly canGenerate: false;
}

export interface DocumentChecklistPilotInput {
  /** Optional deal context (display only); the logic does not require it. */
  readonly deal?: { readonly name?: string; readonly id?: string } | null;
  /** Existing checklist rows already loaded by the deal/document data path. */
  readonly existingChecklistRows?: readonly ({ readonly name?: string } | string)[];
  /** Approved pilot checklist names (static config). */
  readonly approvedChecklistNames?: readonly string[];
  /** Pilot UI flag. Even when true, `canGenerate` stays false in 188D. */
  readonly pilotEnabled?: boolean;
}

const SAFETY_MESSAGES: readonly string[] = Object.freeze([
  'No borrower request will be sent.',
  'No checklist rows will be created from this screen while the pilot is disabled.',
]);

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

function rowName(row: { readonly name?: string } | string): string {
  return typeof row === 'string' ? row : row?.name ?? '';
}

export function buildDocumentChecklistPilotViewModel(
  input: DocumentChecklistPilotInput,
): DocumentChecklistPilotViewModel {
  // Approved names: drop blanks, de-dup case-insensitively (preview never shows
  // a duplicate and never implies a duplicate create).
  const seen = new Set<string>();
  const approvedNames = (input.approvedChecklistNames ?? [])
    .map((n) => (n ?? '').trim())
    .filter((n) => n.length > 0)
    .filter((n) => {
      const key = normalize(n);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const existing = new Set(
    (input.existingChecklistRows ?? [])
      .map(rowName)
      .map(normalize)
      .filter((n) => n.length > 0),
  );

  const alreadyPresentNames = approvedNames.filter((n) => existing.has(normalize(n)));
  const wouldCreateNames = approvedNames.filter((n) => !existing.has(normalize(n)));

  const pilotEnabled = input.pilotEnabled === true;
  let status: DocumentChecklistPilotStatus;
  let disabledReason: string | undefined;
  if (!pilotEnabled) {
    status = 'pilot_disabled';
    disabledReason = 'Document checklist generation pilot is disabled — requires operator certification.';
  } else if (approvedNames.length === 0) {
    status = 'blocked';
    disabledReason = 'No approved checklist names are configured for the pilot.';
  } else {
    status = 'preview_ready';
    disabledReason = 'Preview only — checklist generation is not enabled from this screen in this phase.';
  }

  return {
    status,
    approvedNames,
    alreadyPresentNames,
    wouldCreateNames,
    safetyMessages: SAFETY_MESSAGES,
    disabledReason,
    // 188D is not the live generation phase. Never derive this as true.
    canGenerate: false,
  };
}
