// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  deriveOutlookConnectorReadiness,
  detectOutlookConnectorRegistration,
  OUTLOOK_CONNECTOR_STATE,
} from './outlookConnectorEvidence';

const ROOT = resolve(__dirname, '..', '..');

describe('Phase 250 — Outlook connector evidence (power.config registration)', () => {
  it('the committed connector is registered (power.config.json) → PASS, while the borrower-send gates stay safe-default off', () => {
    expect(OUTLOOK_CONNECTOR_STATE.generatedServicePresent).toBe(true);
    expect(OUTLOOK_CONNECTOR_STATE.connectorRegisteredInManifest).toBe(true);
    expect(OUTLOOK_CONNECTOR_STATE.emailModeLive).toBe(false);
    const vm = deriveOutlookConnectorReadiness();
    expect(vm.status).toBe('PASS');
    expect(vm.registrationRequired).toBe(false);
    // Completion Phase A: the borrower-send gates were reset to their safe defaults (off).
    // Connector registration is environment evidence only; it flips no live-send gate.
    expect(vm.liveSendEnabled).toBe(false);
    expect(vm.borrowerMessagingEnabled).toBe(false);
    expect(vm.borrowerEmailTransportEnabled).toBe(false);
    expect(vm.verificationCommand).toMatch(/verify-outlook-connector\.ps1/);
  });

  it('the generated service ALONE (no registration) is not enough → UNKNOWN', () => {
    const vm = deriveOutlookConnectorReadiness({ generatedServicePresent: true, connectorRegisteredInManifest: false, emailModeLive: false });
    expect(vm.status).toBe('UNKNOWN');
    expect(vm.registrationRequired).toBe(true);
  });

  it('connector registration ALONE (no generated service) is not enough → BLOCKED', () => {
    const vm = deriveOutlookConnectorReadiness({ generatedServicePresent: false, connectorRegisteredInManifest: true, emailModeLive: false });
    expect(vm.status).toBe('BLOCKED');
  });

  it('detects the connector from power.config.json shapes, not from empty/unrelated text', () => {
    expect(detectOutlookConnectorRegistration('/providers/Microsoft.PowerApps/apis/shared_office365')).toBe(true);
    expect(detectOutlookConnectorRegistration('displayName: Office 365 Outlook')).toBe(true);
    expect(detectOutlookConnectorRegistration('new_Office365OutlookCommercialLOS')).toBe(true);
    expect(detectOutlookConnectorRegistration('alias: office365')).toBe(true);
    expect(detectOutlookConnectorRegistration('', undefined, null)).toBe(false);
    expect(detectOutlookConnectorRegistration('some unrelated data source')).toBe(false);
  });

  it('the real power.config.json actually contains the connector registration', () => {
    const powerConfig = readFileSync(resolve(ROOT, 'power.config.json'), 'utf8');
    expect(detectOutlookConnectorRegistration(powerConfig)).toBe(true);
  });
});
