/**
 * Phase 202 — OGB-native CRM + Lending Workflow activation status model.
 *
 * PURE, READ-ONLY, OFFLINE, DETERMINISTIC. `deriveOgbCrmWorkflowActivation()`
 * reports the activation status of the OGB-NATIVE internal CRM and lending
 * workflow surfaces (LOS / Dataverse-native — NOT an external Salesforce / nCino
 * connector). The internal CRM + workflow read surfaces are ACTIVE (read-only
 * relationship + workflow intelligence); unsafe write categories (CRM writeback,
 * checklist generation, broad workflow writes, borrower communications) remain
 * GATED / fail-closed. It derives every status from existing gate constants —
 * no SDK call, no Dataverse read/write, no fetch, and it flips no gate.
 */

import { BANKER_CREATE_PILOT_ENABLED } from '../deals/bankerCreatePilotConfig';
import { CRM_LIVE_PERSISTENCE_ENABLED } from '../crm/crmFeatureFlags';
import {
  DOCUMENT_CHECKLIST_GENERATION_ENABLED,
  BORROWER_MESSAGING_ENABLED,
} from '../deals/dealOriginationFeatureFlags';

export type ActivationState = 'active' | 'inactive';
export type GateState = 'enabled' | 'gated';

export interface OgbCrmWorkflowActivation {
  /** Internal OGB CRM read surfaces are active (read-only). */
  readonly internalCrmActive: boolean;
  /** Internal OGB lending workflow read surfaces are active (read-only). */
  readonly internalWorkflowActive: boolean;
  /** Certified New Deal create pilot (pilot-context only). */
  readonly pilotCreateStatus: GateState;
  /** CRM writeback / live persistence. */
  readonly writebackStatus: GateState;
  /** Document checklist generation. */
  readonly checklistGenerationStatus: GateState;
  /** Borrower communications. */
  readonly borrowerCommunicationStatus: GateState;
  /** Honest, human-readable remaining blockers / gated categories. */
  readonly remainingBlockers: readonly string[];
  /** Admin-facing status rows (label + value). */
  readonly rows: readonly { readonly label: string; readonly value: string }[];
}

function gate(enabled: boolean): GateState {
  return enabled ? 'enabled' : 'gated';
}

export function deriveOgbCrmWorkflowActivation(): OgbCrmWorkflowActivation {
  // The internal OGB CRM + lending workflow READ surfaces are active (read-only
  // relationship / workflow intelligence from the LOS-native context).
  const internalCrmActive = true;
  const internalWorkflowActive = true;

  // `Boolean(...)` reads the live runtime value without a literal-`false` vs
  // `true` type-overlap error (the gate constants are `false as const`).
  const pilotCreateStatus = gate(Boolean(BANKER_CREATE_PILOT_ENABLED));
  const writebackStatus = gate(Boolean(CRM_LIVE_PERSISTENCE_ENABLED)); // false → gated
  const checklistGenerationStatus = gate(Boolean(DOCUMENT_CHECKLIST_GENERATION_ENABLED));
  const borrowerCommunicationStatus = gate(Boolean(BORROWER_MESSAGING_ENABLED));

  const remainingBlockers: string[] = [];
  if (writebackStatus === 'gated') remainingBlockers.push('CRM writeback gated (read-only; no live persistence).');
  if (checklistGenerationStatus === 'gated') remainingBlockers.push('Checklist generation gated.');
  if (borrowerCommunicationStatus === 'gated') remainingBlockers.push('Borrower communications gated.');
  remainingBlockers.push('Broad workflow writes gated (workflow derivers are read-only decision support).');

  const activeLabel = (active: boolean) => (active ? 'Active' : 'Inactive');

  return {
    internalCrmActive,
    internalWorkflowActive,
    pilotCreateStatus,
    writebackStatus,
    checklistGenerationStatus,
    borrowerCommunicationStatus,
    remainingBlockers,
    rows: [
      { label: 'Internal OGB CRM', value: `${activeLabel(internalCrmActive)} — internal relationship intelligence (read-only)` },
      { label: 'Internal lending workflow', value: `${activeLabel(internalWorkflowActive)} — internal workflow readiness (read-only)` },
      { label: 'Certified New Deal create pilot', value: pilotCreateStatus === 'enabled' ? 'Enabled (pilot context only)' : 'Gated' },
      { label: 'CRM writeback', value: writebackStatus === 'gated' ? 'Gated (disabled by default)' : 'Enabled' },
      { label: 'Checklist generation', value: checklistGenerationStatus === 'gated' ? 'Gated' : 'Enabled' },
      { label: 'Borrower communications', value: borrowerCommunicationStatus === 'gated' ? 'Gated' : 'Enabled' },
    ],
  };
}
