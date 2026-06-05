import { describe, it, expect } from 'vitest';
import {
  FDIC_EVIDENCE_ARTIFACTS,
  FDIC_UNIVERSAL_PROHIBITED_CLAIMS,
  FDIC_EVIDENCE_NOT_COMPLIANCE_RULE,
  getEvidenceArtifact,
} from './fdicEvidenceArchitecture';
import {
  FDIC_WORKSPACES,
  FDIC_EVIDENCE_TYPES,
  FDIC_REMEDIATION_CONTROLS,
} from './fdicRemediationOperatingModel';

/**
 * Phase 140A — FDIC evidence architecture pins.
 *
 * Pins that every artifact is well-formed, that each artifact's
 * requiredForControls is derived-consistent with the operating model, that
 * the required-coverage artifacts all exist, and — most importantly — that
 * no artifact carries a fake-compliance claim and that nothing is wired yet.
 */

const REQUIRED_COVERAGE = [
  'repayment_capacity_analysis',
  'source_of_repayment_documentation',
  'core_system_reconciliation',
  'loan_document_inventory',
  'legally_enforceable_document_review',
  'dual_control_approval',
  'appraisal_review',
  'independent_loan_review_report',
  'watchlist_review',
  'classified_asset_review',
  'special_mention_review',
  'acl_cecl_support',
  'qualitative_factor_support',
  'individually_evaluated_loan_support',
  'board_report',
  'management_commitment_tracking',
] as const;

describe('Phase 140A — evidence artifact coverage', () => {
  it('covers every required evidence artifact', () => {
    for (const e of REQUIRED_COVERAGE) {
      expect(getEvidenceArtifact(e), `${e} artifact must exist`).toBeDefined();
    }
  });

  it('every artifact is well-formed', () => {
    for (const a of FDIC_EVIDENCE_ARTIFACTS) {
      expect(FDIC_EVIDENCE_TYPES).toContain(a.evidenceType);
      expect(FDIC_WORKSPACES).toContain(a.producedByWorkspace);
      expect(a.title.length).toBeGreaterThan(3);
      expect(a.description.length).toBeGreaterThan(10);
      expect(a.minimumFields.length).toBeGreaterThan(0);
      for (const w of a.consumedByWorkspaces) {
        expect(FDIC_WORKSPACES).toContain(w);
      }
    }
  });

  it('each artifact requiredForControls matches the controls that require it', () => {
    for (const a of FDIC_EVIDENCE_ARTIFACTS) {
      const expected = FDIC_REMEDIATION_CONTROLS.filter((c) =>
        c.evidenceRequired.includes(a.evidenceType),
      )
        .map((c) => c.id)
        .sort();
      expect([...a.requiredForControls].sort(), a.evidenceType).toEqual(
        expected,
      );
    }
  });
});

describe('Phase 140A — evidence is not compliance', () => {
  it('the no-fake-compliance rule is stated and explicit', () => {
    expect(FDIC_EVIDENCE_NOT_COMPLIANCE_RULE).toMatch(
      /not automatically compliance/i,
    );
    expect(FDIC_EVIDENCE_NOT_COMPLIANCE_RULE).toMatch(
      /does not equal remediation/i,
    );
    expect(FDIC_EVIDENCE_NOT_COMPLIANCE_RULE).toMatch(
      /reviewed and approved before any regulatory claim/i,
    );
  });

  it('every artifact prohibits the fake-compliance claims', () => {
    for (const a of FDIC_EVIDENCE_ARTIFACTS) {
      for (const claim of FDIC_UNIVERSAL_PROHIBITED_CLAIMS) {
        expect(
          a.prohibitedClaims,
          `${a.evidenceType} must prohibit "${claim}"`,
        ).toContain(claim);
      }
    }
  });

  it('the universal prohibited-claims set lists the regulatory conclusion words', () => {
    expect(FDIC_UNIVERSAL_PROHIBITED_CLAIMS).toEqual(
      expect.arrayContaining([
        'FDIC approved',
        'compliant',
        'remediated',
        'examiner ready',
      ]),
    );
  });

  it('no artifact is wired yet — every artifact is not_wired in Phase 140A', () => {
    for (const a of FDIC_EVIDENCE_ARTIFACTS) {
      expect(a.currentAvailability, `${a.evidenceType}`).toBe('not_wired');
    }
  });
});
