// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AmlKycCreditBureauPolicyGatePanel } from './AmlKycCreditBureauPolicyGatePanel';
import { evaluateAmlKycCreditBureauPolicyGate, POLICY_GATE_LIVE_PULL_MODE } from './amlKycCreditBureauPolicyGate';

const CLOCK = '2026-06-10T00:00:00.000Z';
const RESULT = evaluateAmlKycCreditBureauPolicyGate({ dealId: 'D1', dealName: 'Deal One', clientName: 'Client A', borrowerLabel: 'Primary borrower', requestedByDisplayName: 'admin-1', requestedAt: CLOCK, requestedPolicyDomains: ['aml_kyc', 'credit_bureau'], consentStatus: 'not_collected', permissiblePurposeStatus: 'not_documented', livePullMode: POLICY_GATE_LIVE_PULL_MODE });
const IDENTITY = { dealName: 'Deal One', clientName: 'Client A', borrowerLabel: 'Primary borrower', requestedDomains: ['aml_kyc', 'credit_bureau'] as const, consentStatus: 'not_collected' as const, permissiblePurposeStatus: 'not_documented' as const };

describe('Phase 142Q — AmlKycCreditBureauPolicyGatePanel', () => {
  it('renders the title and no-live-pull status', () => {
    render(<AmlKycCreditBureauPolicyGatePanel identity={IDENTITY} result={RESULT} />);
    expect(screen.getByText('AML/KYC and Credit Bureau Policy Gate')).toBeTruthy();
    expect(screen.getByText('No live pull')).toBeTruthy();
  });

  it('renders the no-live-pull body copy', () => {
    render(<AmlKycCreditBureauPolicyGatePanel identity={IDENTITY} result={RESULT} />);
    expect(screen.getAllByText(/are not enabled\. No reports, scores, sanctions results/i).length).toBeGreaterThanOrEqual(1);
  });

  it('shows the deal / client / borrower summary and requested domains', () => {
    render(<AmlKycCreditBureauPolicyGatePanel identity={IDENTITY} result={RESULT} />);
    expect(screen.getByText('Deal')).toBeTruthy();
    expect(screen.getByText('Requested domains')).toBeTruthy();
    expect(screen.getByText(/Live pull performed: false/)).toBeTruthy();
  });

  it('shows blockers and warnings', () => {
    render(<AmlKycCreditBureauPolicyGatePanel identity={IDENTITY} result={RESULT} />);
    expect(screen.getByText('Blockers')).toBeTruthy();
    expect(screen.getByText('Warnings')).toBeTruthy();
  });

  it('renders an honest empty state when no identity is provided', () => {
    render(<AmlKycCreditBureauPolicyGatePanel />);
    expect(screen.getByText(/No deal identity provided/i)).toBeTruthy();
  });

  it('exposes no pull / run / check / verify / get-score / approve / deny / vote buttons or forms', () => {
    const { container } = render(<AmlKycCreditBureauPolicyGatePanel identity={IDENTITY} result={RESULT} />);
    expect(container.querySelectorAll('button, form, input').length).toBe(0);
    const text = (container.textContent ?? '').toLowerCase();
    for (const w of ['pull report', 'run kyc', 'run ofac', 'check sanctions', 'verify identity', 'get bureau', 'get score', 'approve package', 'deny package', 'cast vote', 'ofac no match', 'bureau score found', 'aml clear']) {
      expect(text).not.toContain(w);
    }
  });

  it('renders no external URL', () => {
    const { container } = render(<AmlKycCreditBureauPolicyGatePanel identity={IDENTITY} result={RESULT} />);
    expect(container.innerHTML).not.toMatch(/https?:\/\//);
  });
});
