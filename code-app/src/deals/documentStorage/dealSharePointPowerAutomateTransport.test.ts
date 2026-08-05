import { describe, expect, it } from 'vitest';
import { unavailableDealSharePointDocumentPort } from './dealSharePointDocumentPort';
import {
  buildDealSharePointPowerAutomateTransport,
  DEAL_SHAREPOINT_POWER_AUTOMATE_OPERATIONS,
  DEAL_SHAREPOINT_POWER_AUTOMATE_WORKFLOW_ID,
  verifyDealSharePointPowerAutomateRegistration,
} from './dealSharePointPowerAutomateTransport';

const verified = {
  requestedProvider: 'POWER_AUTOMATE',
  storageMode: 'LIVE',
  registration: {
    provider: 'POWER_AUTOMATE' as const,
    workflowId: DEAL_SHAREPOINT_POWER_AUTOMATE_WORKFLOW_ID,
    generatedServiceName: 'GeneratedOnlyAfterImport',
    generatedRunMethod: 'Run',
    generatedParameterNames: ['operation', 'dealId', 'correlationId', 'idempotencyKey'],
    connectionReferenceBound: true,
    environmentConfigurationVerified: true,
    authenticatedActorResolutionVerified: true,
    serverAuthorizationVerified: true,
    idempotencyLedgerVerified: true,
    sharePointReadbackVerified: true,
    reconciliationVerified: true,
  },
} as const;

describe('Power Automate SharePoint transport activation seam', () => {
  it('publishes only the four approved semantic operations', () => {
    expect(DEAL_SHAREPOINT_POWER_AUTOMATE_OPERATIONS).toEqual(['ensureFolder', 'upload', 'verifyFolder', 'verifyFile']);
  });
  it('remains fail closed by default and without generated service evidence', async () => {
    expect(verifyDealSharePointPowerAutomateRegistration({ requestedProvider: 'POWER_AUTOMATE', storageMode: 'DRY_RUN' }).ready).toBe(false);
    const adapter = buildDealSharePointPowerAutomateTransport({ requestedProvider: 'POWER_AUTOMATE', storageMode: 'DRY_RUN' });
    expect((await adapter.ensureFolder({} as never)).ok).toBe(false);
  });
  it('requires every server and readback verification gate', () => {
    expect(verifyDealSharePointPowerAutomateRegistration({ ...verified, registration: { ...verified.registration, serverAuthorizationVerified: false } }).ready).toBe(false);
  });
  it('uses an injected generated adapter only after every gate passes', () => {
    expect(buildDealSharePointPowerAutomateTransport(verified, unavailableDealSharePointDocumentPort)).toBe(unavailableDealSharePointDocumentPort);
    expect(verifyDealSharePointPowerAutomateRegistration(verified).ready).toBe(true);
  });
  it('keeps the Azure implementation available but inactive', () => {
    expect(verifyDealSharePointPowerAutomateRegistration({ ...verified, registration: { ...verified.registration, provider: 'AZURE_FUNCTION' } }).ready).toBe(false);
  });
});
