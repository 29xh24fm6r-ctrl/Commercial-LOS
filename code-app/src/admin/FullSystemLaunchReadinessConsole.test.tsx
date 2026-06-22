// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { FullSystemLaunchReadinessConsole } from './FullSystemLaunchReadinessConsole';

/**
 * Phase 197 — Full System Launch Readiness console tests.
 *
 * The console is a READ-ONLY projection: it renders the honest launch posture
 * and performs no action. These tests pin the title, the CONDITIONAL GO
 * recommendation, every domain, the gated/conditional statuses, the standing
 * safety lines, and the absence of any create/write/apply/enable/send control.
 */

const REQUIRED_DOMAIN_LABELS = [
  'Banker Workspace',
  'New Deal Create',
  'OGB CRM / Relationship Command Center',
  'Workflow Factory',
  'Credit / Committee / Compliance',
  'Data Quality / No Fake Data',
  'Permissions / Entitlements',
  'Operator / Admin Readiness',
  'Build / Release',
  'Final V1.0 Launch Decision',
];

function domainCard(container: HTMLElement, id: string): HTMLElement {
  const el = container.querySelector(`[data-launch-domain="${id}"]`);
  if (!el) throw new Error(`domain card ${id} not rendered`);
  return el as HTMLElement;
}

describe('FullSystemLaunchReadinessConsole', () => {
  it('renders the title', () => {
    render(<FullSystemLaunchReadinessConsole />);
    expect(screen.getByText('V1 Full System Launch Readiness')).toBeTruthy();
  });

  it('renders the CONDITIONAL GO recommendation', () => {
    render(<FullSystemLaunchReadinessConsole />);
    expect(screen.getByText('CONDITIONAL GO')).toBeTruthy();
  });

  it('renders all required domains', () => {
    render(<FullSystemLaunchReadinessConsole />);
    for (const label of REQUIRED_DOMAIN_LABELS) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('renders New Deal Create as conditional (operator enablement required)', () => {
    const { container } = render(<FullSystemLaunchReadinessConsole />);
    const card = domainCard(container, 'new-deal-create');
    expect(within(card).getByText('Conditional')).toBeTruthy();
    expect(card.textContent).toMatch(/global create gates remain false/i);
    expect(card.textContent).toMatch(/operator enablement/i);
    expect(card.textContent).toMatch(/no actorless create/i);
  });

  it('renders CRM / Salesforce / nCino as conditional and writeback-gated', () => {
    const { container } = render(<FullSystemLaunchReadinessConsole />);
    const card = domainCard(container, 'crm-salesforce-ncino');
    expect(within(card).getByText('Conditional')).toBeTruthy();
    expect(card.textContent).toMatch(/built, mounted, and certified/i);
    expect(card.textContent).toMatch(/CRM writeback remains gated/i);
  });

  it('renders Workflow Factory as conditional and write-gated', () => {
    const { container } = render(<FullSystemLaunchReadinessConsole />);
    const card = domainCard(container, 'workflow-factory');
    expect(within(card).getByText('Conditional')).toBeTruthy();
    expect(card.textContent).toMatch(/fail-closed/i);
    expect(card.textContent).toMatch(/no borrower send path/i);
  });

  it('renders Build / Release as ready', () => {
    const { container } = render(<FullSystemLaunchReadinessConsole />);
    const card = domainCard(container, 'build-release');
    expect(within(card).getByText('Ready')).toBeTruthy();
    expect(card.textContent).toMatch(/190A/);
  });

  it('renders the standing safety lines', () => {
    render(<FullSystemLaunchReadinessConsole />);
    expect(screen.getByText('No live gate is flipped by this console.')).toBeTruthy();
    expect(screen.getByText('CRM writeback remains gated.')).toBeTruthy();
    expect(screen.getByText('Workflow writes remain gated.')).toBeTruthy();
    expect(screen.getByText('Borrower communications remain disabled.')).toBeTruthy();
    expect(screen.getByText('Checklist generation remains disabled.')).toBeTruthy();
  });

  it('renders no create/write/apply/enable/send controls', () => {
    const { container } = render(<FullSystemLaunchReadinessConsole />);
    // The read-only console renders zero buttons of any kind.
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(container.querySelectorAll('button')).toHaveLength(0);
    // And nothing that reads as an action affordance.
    expect(container.textContent).not.toMatch(/\b(Create deal|Apply|Enable live|Send request|Send to borrower)\b/i);
  });
});
