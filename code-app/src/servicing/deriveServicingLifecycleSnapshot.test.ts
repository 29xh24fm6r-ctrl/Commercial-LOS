import { describe, it, expect } from 'vitest';
import { deriveServicingLifecycleSnapshot } from './deriveServicingLifecycleSnapshot';
import { deriveServicingLifecycleStage } from './deriveServicingLifecycleStage';
import { deriveServicingCollateralSecurityStatus } from './deriveServicingCollateralSecurityStatus';
import { deriveServicingInsuranceTicklerStatus } from './deriveServicingInsuranceTicklerStatus';
import { deriveServicingCovenantReportingStatus } from './deriveServicingCovenantReportingStatus';
import { deriveServicingMaturityRenewalStatus } from './deriveServicingMaturityRenewalStatus';
import type { ServicingLifecycleInput } from './servicingLifecycleTypes';

const AS_OF = '2026-06-09';

function build(opts: {
  stageInput?: Partial<ServicingLifecycleInput>;
  collateral?: Parameters<typeof deriveServicingCollateralSecurityStatus>[0];
  insurance?: Parameters<typeof deriveServicingInsuranceTicklerStatus>[0];
  covenant?: Parameters<typeof deriveServicingCovenantReportingStatus>[0];
  maturityDate?: string;
} = {}) {
  const input: ServicingLifecycleInput = { lifecycleId: 'L1', asOfDate: AS_OF, boardedLoan: { verified: true }, ...opts.stageInput };
  const stage = deriveServicingLifecycleStage(input);
  const { insuranceStatus, ticklerStatus } = deriveServicingInsuranceTicklerStatus(opts.insurance ?? { insurance: { accepted: true, evidencePresent: true, expirationDate: '2027-01-01' }, ticklers: [], asOfDate: AS_OF });
  return deriveServicingLifecycleSnapshot({
    input, stage, obligations: [],
    collateralSecurityStatus: deriveServicingCollateralSecurityStatus(opts.collateral ?? { collateralItems: [{ collateralId: 'CL1', hasEvidence: true, perfected: true }] }),
    insuranceStatus, ticklerStatus,
    covenantReportingStatus: deriveServicingCovenantReportingStatus(opts.covenant ?? { covenantResults: [{ covenantId: 'C1', status: 'pass' }] }),
    maturityRenewalStatus: deriveServicingMaturityRenewalStatus({ maturityDate: opts.maturityDate ?? '2030-01-01', asOfDate: AS_OF }),
  });
}

describe('Phase 142E — lifecycle snapshot', () => {
  it('is healthy when all components are healthy', () => {
    expect(build().lifecycleStatus).toBe('healthy');
  });

  it('is attention_required for an overdue tickler', () => {
    expect(build({ insurance: { insurance: { accepted: true, evidencePresent: true, expirationDate: '2027-01-01' }, ticklers: [{ ticklerId: 'T1', dueDate: '2020-01-01' }], asOfDate: AS_OF } }).lifecycleStatus).toBe('attention_required');
  });

  it('is blocked_missing_evidence when key collateral evidence is missing', () => {
    expect(build({ collateral: { collateralItems: [{ collateralId: 'CL1', hasEvidence: false }] } }).lifecycleStatus).toBe('blocked_missing_evidence');
  });

  it('is review_required for an unknown stage', () => {
    expect(build({ stageInput: { boardedLoan: undefined } }).lifecycleStatus).toBe('review_required');
  });

  it('uses no approval / waiver / send language', () => {
    expect(JSON.stringify(build())).not.toMatch(/\bapprove\b|\bwaive\b|sendEmail|mailto:/i);
  });

  it('fabricates no balances / payments', () => {
    const s = build();
    expect(s.auditSummary.containsFakeBalance).toBe(false);
    expect(s.auditSummary.containsPaymentPosting).toBe(false);
    expect(JSON.stringify(s)).not.toMatch(/\$\s*\d/);
  });
});
