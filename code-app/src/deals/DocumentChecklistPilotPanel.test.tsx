// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { DocumentChecklistPilotPanel } from './DocumentChecklistPilotPanel';

/**
 * Phase 188D — the banker pilot panel renders disabled, informational, and
 * non-operative: it never offers a generate/send/request action.
 */

describe('DocumentChecklistPilotPanel — disabled UX', () => {
  it('renders the panel titled Document Checklist Pilot, status Pilot disabled', () => {
    const { container } = render(<DocumentChecklistPilotPanel existingDocumentNames={[]} />);
    expect(screen.getByText('Document Checklist Pilot')).toBeInTheDocument();
    expect(screen.getByText('Pilot disabled')).toBeInTheDocument();
    const panel = container.querySelector('[data-doc-checklist-pilot="panel"]');
    expect(panel?.getAttribute('data-doc-checklist-pilot-status')).toBe('pilot_disabled');
  });

  it('states no borrower request will be sent and no rows created while disabled', () => {
    const { container } = render(<DocumentChecklistPilotPanel existingDocumentNames={[]} />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/No borrower request will be sent/i);
    expect(text).toMatch(/No checklist rows will be created/i);
    expect(container.querySelector('[data-doc-checklist-pilot-cert-note]')?.textContent).toMatch(/operator certification/i);
  });

  it('the generate control is present but DISABLED (never enabled)', () => {
    const { container } = render(<DocumentChecklistPilotPanel existingDocumentNames={[]} />);
    const btn = container.querySelector('[data-doc-checklist-pilot-generate]') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn).toBeDisabled();
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.textContent).toMatch(/disabled/i);
  });

  it('offers NO send / request / borrower / approve / commit / apply action', () => {
    const { container } = render(
      <DocumentChecklistPilotPanel existingDocumentNames={[]} approvedChecklistNames={['Tax Return']} pilotEnabled />,
    );
    // The ONLY button is the disabled generate control.
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toBeDisabled();
    // No borrower-send / request / commit action phrasing, and no optimistic
    // success / generated state from a UI-only preview.
    const text = (container.textContent ?? '').toLowerCase();
    for (const phrase of ['send request', 'send email', 'request documents', 'borrower email']) {
      expect(text).not.toContain(phrase);
    }
    expect(text).not.toMatch(/checklist generated|rows created|generation succeeded/i);
    // No links/anchors either (no mailto, no navigation action).
    expect(container.querySelector('a')).toBeNull();
  });

  it('shows approved vs already-present vs would-create as read-only preview (no action)', () => {
    const { container } = render(
      <DocumentChecklistPilotPanel
        existingDocumentNames={['Debt Schedule']}
        approvedChecklistNames={['2024 Business Tax Return', 'Debt Schedule']}
        pilotEnabled
      />,
    );
    const already = container.querySelector('[data-doc-checklist-pilot-list="already-present"]');
    const would = container.querySelector('[data-doc-checklist-pilot-list="would-create"]');
    expect(within(already as HTMLElement).getByText('Debt Schedule')).toBeInTheDocument();
    expect(within(would as HTMLElement).getByText('2024 Business Tax Return')).toBeInTheDocument();
    // Even with pilotEnabled, the generate button stays disabled.
    expect(container.querySelector('[data-doc-checklist-pilot-generate]')).toBeDisabled();
  });
});

/**
 * Phase 188J — the TEST-ONLY dependency-injected action seam. By default the
 * button stays disabled; an injected callback alone is not enough; only an
 * explicitly-enabled action gate + injected callback makes one click reach the
 * bridge. The default runtime posture remains disabled.
 */
describe('DocumentChecklistPilotPanel — 188J controlled action seam', () => {
  it('stays disabled by default even when an onGenerate callback is injected', () => {
    const onGenerate = vi.fn();
    const { container } = render(
      <DocumentChecklistPilotPanel existingDocumentNames={[]} pilotEnabled onGenerate={onGenerate} />,
    );
    const btn = container.querySelector('[data-doc-checklist-pilot-generate]') as HTMLButtonElement;
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('stays disabled when the action gate is enabled but no callback is injected', () => {
    const { container } = render(
      <DocumentChecklistPilotPanel existingDocumentNames={[]} pilotEnabled generateActionEnabled />,
    );
    expect(container.querySelector('[data-doc-checklist-pilot-generate]')).toBeDisabled();
  });

  it('one controlled click reaches the injected callback ONLY when fully enabled (test-only)', () => {
    const onGenerate = vi.fn();
    const { container } = render(
      <DocumentChecklistPilotPanel
        existingDocumentNames={[]}
        pilotEnabled
        generateActionEnabled
        onGenerate={onGenerate}
      />,
    );
    const btn = container.querySelector('[data-doc-checklist-pilot-generate]') as HTMLButtonElement;
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onGenerate).toHaveBeenCalledTimes(1);
    // Still exactly one button — no borrower-send / request control was added.
    expect(Array.from(container.querySelectorAll('button'))).toHaveLength(1);
    expect((container.textContent ?? '').toLowerCase()).not.toContain('send request');
  });
});
