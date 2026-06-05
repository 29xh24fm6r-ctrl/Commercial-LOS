import { describe, it, expect } from 'vitest';
import {
  FDIC_REMEDIATION_CONTROLS,
  FDIC_REQUIRED_CONTROL_IDS,
  FDIC_CONTROL_STATUSES,
  FDIC_PROHIBITED_STATUS_CLAIMS,
  FDIC_FINDING_THEMES,
  FDIC_WORKSPACES,
  FDIC_EVIDENCE_TYPES,
  getFdicControl,
  isHonestFdicStatus,
} from './fdicRemediationOperatingModel';

/**
 * Phase 140A — FDIC remediation operating model pins.
 *
 * Pins the platform-wide control catalog: every required control exists,
 * maps to a primary workspace, requires evidence, defaults to an honest
 * not-yet-wired status, and carries a no-fake-compliance rule. The theme-
 * and evidence-specific pins below lock the FDIC report's findings to the
 * controls that address them.
 */

describe('Phase 140A — FDIC control catalog completeness', () => {
  it('every required FDIC control id exists exactly once', () => {
    for (const id of FDIC_REQUIRED_CONTROL_IDS) {
      const matches = FDIC_REMEDIATION_CONTROLS.filter((c) => c.id === id);
      expect(matches.length, `control ${id} must exist exactly once`).toBe(1);
    }
  });

  it('there are no extra controls beyond the required set', () => {
    const ids = FDIC_REMEDIATION_CONTROLS.map((c) => c.id).sort();
    expect(ids).toEqual([...FDIC_REQUIRED_CONTROL_IDS].sort());
  });

  it('every control maps to a known primary workspace', () => {
    for (const c of FDIC_REMEDIATION_CONTROLS) {
      expect(FDIC_WORKSPACES).toContain(c.primaryWorkspace);
    }
  });

  it('every control maps to a known theme', () => {
    for (const c of FDIC_REMEDIATION_CONTROLS) {
      expect(FDIC_FINDING_THEMES).toContain(c.theme);
    }
  });

  it('every control requires at least one known evidence type', () => {
    for (const c of FDIC_REMEDIATION_CONTROLS) {
      expect(c.evidenceRequired.length, `${c.id} needs evidence`).toBeGreaterThan(
        0,
      );
      for (const e of c.evidenceRequired) {
        expect(FDIC_EVIDENCE_TYPES).toContain(e);
      }
    }
  });

  it('every control states a required control and a not-fake-compliance rule', () => {
    for (const c of FDIC_REMEDIATION_CONTROLS) {
      expect(c.requiredControl.length, `${c.id} requiredControl`).toBeGreaterThan(
        10,
      );
      expect(
        c.notFakeComplianceRule.length,
        `${c.id} notFakeComplianceRule`,
      ).toBeGreaterThan(10);
    }
  });
});

describe('Phase 140A — honest status discipline', () => {
  it('exposes exactly the four honest statuses', () => {
    expect([...FDIC_CONTROL_STATUSES]).toEqual([
      'mapped_not_wired',
      'evidence_gap',
      'partially_wired',
      'wired_with_evidence',
    ]);
  });

  it('every control defaults to mapped_not_wired or evidence_gap (nothing claims wired_with_evidence)', () => {
    for (const c of FDIC_REMEDIATION_CONTROLS) {
      expect(
        ['mapped_not_wired', 'evidence_gap'],
        `${c.id} must not pre-claim wiring`,
      ).toContain(c.currentStatus);
    }
  });

  it('no control uses a fake-compliance term as its status', () => {
    for (const c of FDIC_REMEDIATION_CONTROLS) {
      expect(isHonestFdicStatus(c.currentStatus)).toBe(true);
      expect(FDIC_PROHIBITED_STATUS_CLAIMS).not.toContain(
        c.currentStatus.toLowerCase(),
      );
    }
  });
});

describe('Phase 140A — distributed ownership (portfolio is not the sole owner)', () => {
  it('controls are owned across multiple workspaces, not all by portfolio', () => {
    const primaries = new Set(
      FDIC_REMEDIATION_CONTROLS.map((c) => c.primaryWorkspace),
    );
    expect(primaries.size).toBeGreaterThanOrEqual(5);
    const portfolioOwned = FDIC_REMEDIATION_CONTROLS.filter(
      (c) => c.primaryWorkspace === 'portfolio_command_center',
    );
    expect(portfolioOwned.length).toBeLessThan(FDIC_REMEDIATION_CONTROLS.length);
  });

  it('Credit Admin owns document, core-data, and dual-control; appraisal control lives in the appraisal queue', () => {
    const creditAdmin = FDIC_REMEDIATION_CONTROLS.filter(
      (c) => c.primaryWorkspace === 'credit_administration_workspace',
    ).map((c) => c.id);
    expect(creditAdmin).toContain('FDIC-LOAN-DOC-COMPLETE-1');
    expect(creditAdmin).toContain('FDIC-MIS-DATA-ACCURACY-1');
    expect(creditAdmin).toContain('FDIC-DUAL-CONTROL-DATA-ENTRY-1');
    // The appraisal/evaluation control is owned by the collateral-compliance
    // layer; Credit Admin owns appraisal ROUTING as a supporting responsibility.
    expect(getFdicControl('FDIC-APPRAISAL-EVALUATION-1')?.primaryWorkspace).toBe(
      'appraisal_review_queue',
    );
  });

  it('Banker Deal Workspace owns repayment-source evidence capture', () => {
    expect(getFdicControl('FDIC-REPAYMENT-SOURCE-1')?.primaryWorkspace).toBe(
      'banker_deal_workspace',
    );
  });

  it('Independent Loan Review owns the independent review + risk-rating challenge', () => {
    const c = getFdicControl('FDIC-INDEPENDENT-LOAN-REVIEW-1');
    expect(c?.primaryWorkspace).toBe('independent_loan_review_workspace');
    expect(c?.evidenceRequired).toContain('risk_rating_review');
  });

  it('ACL/CECL owns ACL support; Executive/Board owns board oversight', () => {
    expect(getFdicControl('FDIC-ACL-CECL-SUPPORT-1')?.primaryWorkspace).toBe(
      'acl_cecl_workbench',
    );
    expect(getFdicControl('FDIC-BOARD-OVERSIGHT-1')?.primaryWorkspace).toBe(
      'executive_board_oversight',
    );
  });
});

describe('Phase 140A — theme-specific evidence requirements', () => {
  it('repayment-source control requires repayment capacity AND source-of-repayment evidence', () => {
    const c = getFdicControl('FDIC-REPAYMENT-SOURCE-1');
    expect(c?.evidenceRequired).toContain('repayment_capacity_analysis');
    expect(c?.evidenceRequired).toContain('source_of_repayment_documentation');
  });

  it('MIS control requires core-system reconciliation evidence', () => {
    expect(
      getFdicControl('FDIC-MIS-DATA-ACCURACY-1')?.evidenceRequired,
    ).toContain('core_system_reconciliation');
  });

  it('document control requires legally-enforceable-document evidence', () => {
    expect(
      getFdicControl('FDIC-LOAN-DOC-COMPLETE-1')?.evidenceRequired,
    ).toContain('legally_enforceable_document_review');
  });

  it('appraisal control requires appraisal/evaluation review evidence', () => {
    expect(
      getFdicControl('FDIC-APPRAISAL-EVALUATION-1')?.evidenceRequired,
    ).toContain('appraisal_review');
  });

  it('loan-review control requires independent loan-review evidence', () => {
    expect(
      getFdicControl('FDIC-INDEPENDENT-LOAN-REVIEW-1')?.evidenceRequired,
    ).toContain('independent_loan_review_report');
  });

  it('ACL control requires CECL support AND qualitative factor evidence', () => {
    const c = getFdicControl('FDIC-ACL-CECL-SUPPORT-1');
    expect(c?.evidenceRequired).toContain('acl_cecl_support');
    expect(c?.evidenceRequired).toContain('qualitative_factor_support');
  });
});
