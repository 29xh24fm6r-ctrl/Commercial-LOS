import { describe, it, expect } from 'vitest';
import {
  deriveServicingLifecycleProjection,
  type ServicingLifecycleMapperInput,
} from './servicingLifecycleMapper';

function input(over: Partial<ServicingLifecycleMapperInput> = {}): ServicingLifecycleMapperInput {
  return { dealId: 'D1', dealName: 'Deal One', clientName: 'Client A', borrowerLabel: 'Primary borrower', bankerName: 'Banker B', ...over };
}

const CLOSED = { status: 'Closed Won', stage: 'closed', productType: 'commercial', loanStructure: 'term_loan', pricingType: 'fixed', amount: 250000, maturityDate: '2031-01-01', actualCloseDate: '2026-01-15' };

describe('Phase 142R — servicing lifecycle read-only mapper', () => {
  it('returns unknown with a warning when deal identity is missing', () => {
    const r = deriveServicingLifecycleProjection(input({ dealId: undefined }));
    expect(r.servicingProjectionStatus).toBe('unknown');
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('returns not_ready_for_servicing for a non-closed/non-approved deal', () => {
    const r = deriveServicingLifecycleProjection(input({ status: 'underwriting', stage: 'analysis' }));
    expect(r.servicingProjectionStatus).toBe('not_ready_for_servicing');
    expect(r.boardingReadiness).toBe('unavailable');
  });

  it('returns boarding_data_incomplete for a closed deal missing required fields', () => {
    const r = deriveServicingLifecycleProjection(input({ status: 'closed', stage: 'closed' }));
    expect(r.servicingProjectionStatus).toBe('boarding_data_incomplete');
    expect(r.missingServicingFields.length).toBeGreaterThan(0);
    expect(r.boardingReadiness).toBe('incomplete');
  });

  it('returns servicing_record_unavailable when review fields are complete but no servicing record exists', () => {
    const r = deriveServicingLifecycleProjection(input(CLOSED));
    expect(r.servicingProjectionStatus).toBe('servicing_record_unavailable');
    expect(r.servicingReferencePresent).toBe(false);
    expect(r.boardingReadiness).toBe('review_required');
  });

  it('presents an existing servicingRecordId as a read-only reference, not active servicing', () => {
    const r = deriveServicingLifecycleProjection(input({ ...CLOSED, servicingRecordId: 'svc-ref-123' }));
    expect(r.servicingProjectionStatus).toBe('ready_for_boarding_review');
    expect(r.servicingReferencePresent).toBe(true);
    expect(r.warnings.join(' ').toLowerCase()).toMatch(/read-only review only|live servicing is not active/);
  });

  it('produces a deterministic missing-field list', () => {
    const a = deriveServicingLifecycleProjection(input({ status: 'closed', stage: 'closed' })).missingServicingFields;
    const b = deriveServicingLifecycleProjection(input({ status: 'closed', stage: 'closed' })).missingServicingFields;
    expect(a).toEqual(b);
  });

  it('keeps all safety booleans false except readOnly', () => {
    const r = deriveServicingLifecycleProjection(input(CLOSED));
    expect(r.readOnly).toBe(true);
    expect(r.liveServicingSyncPerformed).toBe(false);
    expect(r.coreBankingSyncPerformed).toBe(false);
    expect(r.loanBoarded).toBe(false);
    expect(r.paymentScheduleGenerated).toBe(false);
    expect(r.externalSystemChanged).toBe(false);
  });

  it('emits no boarded / serviced / current / delinquent / defaulted fact label', () => {
    const r = deriveServicingLifecycleProjection(input({ ...CLOSED, servicingRecordId: 'svc-ref-123' }));
    const facts = [r.servicingProjectionLabel, r.nextReadOnlyReviewStep, ...r.lifecycleMilestones.map((m) => m.label), ...r.warnings].join(' ');
    expect(facts).not.toMatch(/\bboarded\b|\bserviced\b|\bdelinquent\b|\bdefaulted\b|actively current|is current\b/i);
  });

  it('renders milestones only for source data that exists', () => {
    const minimal = deriveServicingLifecycleProjection(input({ status: 'closed', stage: 'closed' }));
    expect(minimal.lifecycleMilestones.every((m) => m.present)).toBe(true);
    const full = deriveServicingLifecycleProjection(input({ ...CLOSED, memoGeneratedAt: '2025-12-01', approvedAmount: 250000 }));
    expect(full.lifecycleMilestones.some((m) => m.key === 'application')).toBe(true);
    expect(full.lifecycleMilestones.some((m) => m.key === 'close')).toBe(true);
  });
});
