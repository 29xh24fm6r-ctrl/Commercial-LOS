import {
  BORROWER_MESSAGING_ENABLED,
  BORROWER_EMAIL_TRANSPORT_ENABLED,
} from '../deals/dealOriginationFeatureFlags';

/**
 * Phase 249 — Borrower send / Office 365 Outlook connector evidence (READ-ONLY).
 *
 * The generated Office365OutlookService exists, but the connector is NOT registered in
 * the app data-source manifest, so live send cannot be certified. This module records the
 * connector state fail-closed: the generated service alone is NOT enough — connector
 * registration (and authorization) is required. It fabricates no registration and flips
 * no gate (BORROWER_MESSAGING_ENABLED / BORROWER_EMAIL_TRANSPORT_ENABLED stay false).
 */

export const OUTLOOK_GENERATED_SERVICE_PATH = 'src/generated/services/Office365OutlookService.ts';

export interface OutlookConnectorState {
  /** The generated Office365OutlookService typed client is present in the SDK. */
  readonly generatedServicePresent: boolean;
  /** The connector is registered (and authorized) in the app data-source manifest. */
  readonly connectorRegisteredInManifest: boolean;
  /** Deploy email mode is LIVE (VITE_EMAIL_MODE=LIVE). */
  readonly emailModeLive: boolean;
}

/**
 * OPERATOR-OWNED, transcribed from scripts/activation/verify-outlook-connector.ps1:
 * the generated service is present, but the connector is NOT registered and email mode is
 * not LIVE. Set `connectorRegisteredInManifest`/`emailModeLive` true only from a real
 * recorded registration — never fabricate.
 */
export const OUTLOOK_CONNECTOR_STATE: OutlookConnectorState = Object.freeze({
  generatedServicePresent: true,
  connectorRegisteredInManifest: false,
  emailModeLive: false,
});

export type OutlookConnectorStatus = 'PASS' | 'UNKNOWN' | 'BLOCKED';

export interface OutlookConnectorReadiness {
  readonly status: OutlookConnectorStatus;
  readonly generatedServicePresent: boolean;
  readonly connectorRegisteredInManifest: boolean;
  readonly emailModeLive: boolean;
  /** Registration is required whenever the connector is not registered. */
  readonly registrationRequired: boolean;
  /** Live borrower send flags — stay false here; this module never flips them. */
  readonly borrowerMessagingEnabled: boolean;
  readonly borrowerEmailTransportEnabled: boolean;
  readonly liveSendEnabled: boolean;
  readonly verificationCommand: string;
  readonly missingOperatorActions: readonly string[];
}

export function deriveOutlookConnectorReadiness(
  state: OutlookConnectorState = OUTLOOK_CONNECTOR_STATE,
): OutlookConnectorReadiness {
  // The generated service ALONE is not enough — registration is the gating step.
  const status: OutlookConnectorStatus = !state.generatedServicePresent
    ? 'BLOCKED'
    : state.connectorRegisteredInManifest
      ? 'PASS'
      : 'UNKNOWN';

  const borrowerMessagingEnabled = Boolean(BORROWER_MESSAGING_ENABLED);
  const borrowerEmailTransportEnabled = Boolean(BORROWER_EMAIL_TRANSPORT_ENABLED);

  return {
    status,
    generatedServicePresent: state.generatedServicePresent,
    connectorRegisteredInManifest: state.connectorRegisteredInManifest,
    emailModeLive: state.emailModeLive,
    registrationRequired: !state.connectorRegisteredInManifest,
    borrowerMessagingEnabled,
    borrowerEmailTransportEnabled,
    liveSendEnabled: borrowerMessagingEnabled && borrowerEmailTransportEnabled,
    verificationCommand: 'powershell -File scripts/activation/verify-outlook-connector.ps1',
    missingOperatorActions: status === 'PASS'
      ? ['Connector registered. The borrower-send gate flip + explicit audited live-send certification remain separate governed steps (not performed here).']
      : [
          'In the Power Apps maker portal, add and AUTHORIZE the Office 365 Outlook connector for the app.',
          'Register the connector as an app data source and regenerate the typed SDK so the manifest includes Office365Outlook (Office365OutlookService is already generated).',
          'Deploy with VITE_EMAIL_MODE=LIVE and certify the explicit banker-action audited send path (connector acceptance is not delivery; no auto-send).',
          'Re-run scripts/activation/verify-outlook-connector.ps1 until STATUS=PASS.',
        ],
  };
}
