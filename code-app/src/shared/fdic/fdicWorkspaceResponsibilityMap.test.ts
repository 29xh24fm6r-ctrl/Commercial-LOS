import { describe, it, expect } from 'vitest';
import {
  FDIC_WORKSPACE_RESPONSIBILITY_MAP,
  getWorkspaceResponsibility,
  ownedControlIdsFromModel,
} from './fdicWorkspaceResponsibilityMap';
import {
  FDIC_WORKSPACES,
  FDIC_REMEDIATION_CONTROLS,
  getFdicControl,
} from './fdicRemediationOperatingModel';

/**
 * Phase 140A — FDIC workspace responsibility map pins.
 *
 * Pins that every workspace is described, that the controls each workspace
 * claims to OWN match the controls whose primary workspace is that one
 * (no drift between the map and the operating model), and that the
 * distributed-ownership architecture holds (portfolio is the control tower,
 * not the sole owner).
 */

describe('Phase 140A — workspace responsibility coverage', () => {
  it('every workspace has exactly one responsibility row', () => {
    for (const w of FDIC_WORKSPACES) {
      const matches = FDIC_WORKSPACE_RESPONSIBILITY_MAP.filter(
        (r) => r.workspace === w,
      );
      expect(matches.length, `${w} must be described once`).toBe(1);
    }
    expect(FDIC_WORKSPACE_RESPONSIBILITY_MAP.length).toBe(FDIC_WORKSPACES.length);
  });

  it('every row states a purpose, future UI surface, and current limitations', () => {
    for (const r of FDIC_WORKSPACE_RESPONSIBILITY_MAP) {
      expect(r.purpose.length, `${r.workspace} purpose`).toBeGreaterThan(10);
      expect(
        r.futureUISurface.length,
        `${r.workspace} futureUISurface`,
      ).toBeGreaterThan(5);
      expect(
        r.currentLimitations.length,
        `${r.workspace} currentLimitations`,
      ).toBeGreaterThan(10);
    }
  });

  it('each row owns exactly the controls whose primary workspace is itself (no drift)', () => {
    for (const r of FDIC_WORKSPACE_RESPONSIBILITY_MAP) {
      const expected = [...ownedControlIdsFromModel(r.workspace)].sort();
      const declared = [...r.controlsOwned].sort();
      expect(declared, `${r.workspace} controlsOwned drift`).toEqual(expected);
    }
  });

  it('every owned control id resolves to a real control in the model', () => {
    for (const r of FDIC_WORKSPACE_RESPONSIBILITY_MAP) {
      for (const id of [...r.controlsOwned, ...r.controlsSupported]) {
        expect(getFdicControl(id), `${id} must exist`).toBeDefined();
      }
    }
  });
});

describe('Phase 140A — distributed ownership architecture', () => {
  it('every control in the model is owned by exactly one workspace in the map', () => {
    for (const c of FDIC_REMEDIATION_CONTROLS) {
      const owners = FDIC_WORKSPACE_RESPONSIBILITY_MAP.filter((r) =>
        r.controlsOwned.includes(c.id),
      );
      expect(owners.length, `${c.id} should have one owner`).toBe(1);
      expect(owners[0]!.workspace).toBe(c.primaryWorkspace);
    }
  });

  it('portfolio is the control tower but not the sole owner', () => {
    const portfolio = getWorkspaceResponsibility('portfolio_command_center');
    expect(portfolio).toBeDefined();
    expect(portfolio!.controlsOwned.length).toBeGreaterThan(0);
    expect(portfolio!.controlsOwned.length).toBeLessThan(
      FDIC_REMEDIATION_CONTROLS.length,
    );
    // It also consumes evidence produced by other workspaces (control tower).
    expect(portfolio!.evidenceConsumed.length).toBeGreaterThan(0);
  });

  it('Credit Admin owns the control-execution responsibilities and supports appraisal routing', () => {
    const ca = getWorkspaceResponsibility('credit_administration_workspace');
    expect(ca!.controlsOwned).toEqual(
      expect.arrayContaining([
        'FDIC-LOAN-DOC-COMPLETE-1',
        'FDIC-MIS-DATA-ACCURACY-1',
        'FDIC-DUAL-CONTROL-DATA-ENTRY-1',
      ]),
    );
    // Appraisal/evaluation routing is a supported responsibility; the
    // appraisal queue owns the control itself.
    expect(ca!.controlsSupported).toContain('FDIC-APPRAISAL-EVALUATION-1');
    expect(getWorkspaceResponsibility('appraisal_review_queue')!.controlsOwned).toContain(
      'FDIC-APPRAISAL-EVALUATION-1',
    );
  });

  it('Banker Deal Workspace owns the source-evidence capture', () => {
    const banker = getWorkspaceResponsibility('banker_deal_workspace');
    expect(banker!.controlsOwned).toContain('FDIC-REPAYMENT-SOURCE-1');
    expect(banker!.evidenceProduced).toContain('repayment_capacity_analysis');
  });

  it('Governance Evidence Ledger owns the proof/audit evidence architecture', () => {
    const ledger = getWorkspaceResponsibility('governance_evidence_ledger');
    expect(ledger!.evidenceProduced).toContain('remediation_evidence_packet');
    expect(ledger!.evidenceConsumed.length).toBeGreaterThan(5);
  });
});
