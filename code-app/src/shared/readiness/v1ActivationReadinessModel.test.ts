import { describe, it, expect } from 'vitest';
import { deriveV1ActivationReadiness } from './v1ActivationReadinessModel';
import { CRM_LIVE_PERSISTENCE_ENABLED } from '../../crm/crmFeatureFlags';
import { BANKER_CREATE_PILOT_ENABLED } from '../../deals/bankerCreatePilotConfig';
import {
  DOCUMENT_CHECKLIST_GENERATION_ENABLED,
  BORROWER_MESSAGING_ENABLED,
} from '../../deals/dealOriginationFeatureFlags';

/**
 * Phase 203 — V1 activation readiness model contract.
 *
 * Pins the deterministic V1 release posture: OGB-native surfaces ACTIVE, pilot
 * ENABLED, every unsafe write category GATED (derived from real constants),
 * external connectors / schema / fake data / route widening all absent.
 */

describe('203 — deriveV1ActivationReadiness()', () => {
  const r = deriveV1ActivationReadiness();

  it('overall posture is CONDITIONAL_GO', () => {
    expect(r.overallPosture).toBe('CONDITIONAL_GO');
  });

  it('OGB CRM and internal lending workflow are ACTIVE', () => {
    expect(r.ogbCrmStatus).toBe('ACTIVE');
    expect(r.internalLendingWorkflowStatus).toBe('ACTIVE');
  });

  it('New Deal create pilot is ENABLED (and matches the pilot constant)', () => {
    expect(r.newDealCreatePilot).toBe('ENABLED');
    expect(BANKER_CREATE_PILOT_ENABLED).toBe(true);
  });

  it('CRM writeback is ENABLED now that CRM_LIVE_PERSISTENCE_ENABLED is true', () => {
    expect(CRM_LIVE_PERSISTENCE_ENABLED).toBe(true);
    expect(r.crmWriteback).toBe('ENABLED');
  });

  it('borrower communications are ENABLED (matches the constant)', () => {
    expect(BORROWER_MESSAGING_ENABLED).toBe(true);
    expect(r.borrowerCommunications).toBe('ENABLED');
  });

  it('checklist generation is ENABLED (matches the constant)', () => {
    expect(DOCUMENT_CHECKLIST_GENERATION_ENABLED).toBe(true);
    expect(r.checklistGeneration).toBe('ENABLED');
  });

  it('broad workflow writes are GATED', () => {
    expect(r.broadWorkflowWrites).toBe('GATED');
  });

  it('external connectors are NOT_REQUIRED', () => {
    expect(r.externalConnectors).toBe('NOT_REQUIRED');
  });

  it('fake/sample data dependency is NOT_PRESENT', () => {
    expect(r.fakeSampleDataDependency).toBe('NOT_PRESENT');
  });

  it('schema/migration dependency is NOT_REQUIRED', () => {
    expect(r.schemaMigrationDependency).toBe('NOT_REQUIRED');
  });

  it('permission/route expansion is NOT_PRESENT', () => {
    expect(r.permissionRouteExpansion).toBe('NOT_PRESENT');
  });

  it('is deterministic across repeated calls', () => {
    expect(deriveV1ActivationReadiness()).toEqual(deriveV1ActivationReadiness());
    expect(deriveV1ActivationReadiness()).toEqual(r);
  });
});
