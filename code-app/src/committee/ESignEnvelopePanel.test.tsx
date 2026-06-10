// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ESignEnvelopePanel } from './ESignEnvelopePanel';
import { prepareESignEnvelopeRequest, submitESignEnvelope } from './eSignEnvelopeAdapter';

const CLOCK = '2026-06-10T00:00:00.000Z';
const RESULT = submitESignEnvelope(prepareESignEnvelopeRequest({ dealId: 'D1', dealName: 'Deal One', clientName: 'Client A', documentLabel: 'Credit package', signerCount: 2, signerLabels: ['Borrower', 'Guarantor'], requestedByDisplayName: 'admin-1', requestedAt: CLOCK }));
const IDENTITY = { dealName: 'Deal One', clientName: 'Client A', documentLabel: 'Credit package', signerCount: 2, signerLabels: ['Borrower', 'Guarantor'] };

describe('Phase 142O — ESignEnvelopePanel', () => {
  it('renders the title, the PandaDoc provider, and the disabled status', () => {
    render(<ESignEnvelopePanel identity={IDENTITY} result={RESULT} />);
    expect(screen.getByText('E-sign Envelope Adapter')).toBeTruthy();
    expect(screen.getByText('PandaDoc')).toBeTruthy();
    expect(screen.getByText('Disabled by default')).toBeTruthy();
  });

  it('renders the not-enabled body copy', () => {
    render(<ESignEnvelopePanel identity={IDENTITY} result={RESULT} />);
    expect(screen.getAllByText(/PandaDoc e-signature sending is not enabled/i).length).toBeGreaterThanOrEqual(1);
  });

  it('shows the deal / package / document / signer summary', () => {
    render(<ESignEnvelopePanel identity={IDENTITY} result={RESULT} />);
    expect(screen.getByText('Deal')).toBeTruthy();
    expect(screen.getByText('Document')).toBeTruthy();
    expect(screen.getByText('Signers')).toBeTruthy();
    expect(screen.getByText(/Live envelope created: false/)).toBeTruthy();
  });

  it('renders an honest empty state when no identity is provided', () => {
    render(<ESignEnvelopePanel />);
    expect(screen.getByText(/No package identity provided/i)).toBeTruthy();
  });

  it('exposes no send / create / upload / submit / deliver / request-signature / approve / deny / vote buttons or forms', () => {
    const { container } = render(<ESignEnvelopePanel identity={IDENTITY} result={RESULT} />);
    expect(container.querySelectorAll('button, form, input').length).toBe(0);
    const text = (container.textContent ?? '').toLowerCase();
    for (const w of ['send envelope', 'create envelope', 'upload document', 'submit envelope', 'deliver envelope', 'request signature', 'approve package', 'deny package', 'cast vote', 'sent for signature', 'envelope created successfully', 'delivered successfully']) {
      expect(text).not.toContain(w);
    }
  });

  it('renders no external URL', () => {
    const { container } = render(<ESignEnvelopePanel identity={IDENTITY} result={RESULT} />);
    expect(container.innerHTML).not.toMatch(/https?:\/\//);
  });
});
