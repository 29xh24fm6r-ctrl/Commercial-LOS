// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  deriveOutlookConnectorReadiness,
  OUTLOOK_CONNECTOR_STATE,
} from './outlookConnectorEvidence';

describe('Phase 249 — Outlook connector evidence', () => {
  it('the generated service ALONE is not enough → UNKNOWN, registration required', () => {
    expect(OUTLOOK_CONNECTOR_STATE.generatedServicePresent).toBe(true);
    expect(OUTLOOK_CONNECTOR_STATE.connectorRegisteredInManifest).toBe(false);
    const vm = deriveOutlookConnectorReadiness();
    expect(vm.status).toBe('UNKNOWN');
    expect(vm.registrationRequired).toBe(true);
    expect(vm.liveSendEnabled).toBe(false);
    expect(vm.borrowerMessagingEnabled).toBe(false);
    expect(vm.borrowerEmailTransportEnabled).toBe(false);
    expect(vm.missingOperatorActions.length).toBeGreaterThan(0);
    expect(vm.verificationCommand).toMatch(/verify-outlook-connector\.ps1/);
  });

  it('only a registered + generated connector reads PASS', () => {
    const vm = deriveOutlookConnectorReadiness({ generatedServicePresent: true, connectorRegisteredInManifest: true, emailModeLive: true });
    expect(vm.status).toBe('PASS');
    expect(vm.registrationRequired).toBe(false);
  });

  it('a missing generated service is BLOCKED', () => {
    const vm = deriveOutlookConnectorReadiness({ generatedServicePresent: false, connectorRegisteredInManifest: false, emailModeLive: false });
    expect(vm.status).toBe('BLOCKED');
  });

  it('the committed state fabricates no registration or live send', () => {
    expect(OUTLOOK_CONNECTOR_STATE.connectorRegisteredInManifest).toBe(false);
    expect(OUTLOOK_CONNECTOR_STATE.emailModeLive).toBe(false);
  });
});
