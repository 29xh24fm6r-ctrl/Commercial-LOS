// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminDurableRecordCapabilityPanel } from './AdminDurableRecordCapabilityPanel';
import { DURABLE_RECORD_CAPABILITIES } from '../shared/governance/durableRecordCapabilityInventory';

describe('AdminDurableRecordCapabilityPanel', () => {
  it('shows the total capability count in the header', () => {
    render(<AdminDurableRecordCapabilityPanel />);
    expect(
      screen.getByText(new RegExp(`${DURABLE_RECORD_CAPABILITIES.length} durable-record capabilities`)),
    ).toBeInTheDocument();
  });

  it('renders one row per capability, each labeled "Live governed write"', () => {
    const { container } = render(<AdminDurableRecordCapabilityPanel />);
    for (const c of DURABLE_RECORD_CAPABILITIES) {
      const row = container.querySelector(`[data-admin-durable-record-capability-row="${c.id}"]`);
      expect(row).not.toBeNull();
      expect(row?.textContent).toContain(c.label);
      expect(row?.textContent).toContain('Live governed write');
    }
  });

  it("renders every status value from each capability's own status vocabulary", () => {
    const { container } = render(<AdminDurableRecordCapabilityPanel />);
    for (const c of DURABLE_RECORD_CAPABILITIES) {
      const row = container.querySelector(`[data-admin-durable-record-capability-row="${c.id}"]`);
      for (const status of c.statusVocabulary) {
        expect(row?.textContent).toContain(status);
      }
    }
  });
});
