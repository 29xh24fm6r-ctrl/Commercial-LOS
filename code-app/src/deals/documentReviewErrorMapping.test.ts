import { describe, it, expect } from 'vitest';
import { mapDocumentWriteError } from './documentReviewErrorMapping';

describe('mapDocumentWriteError', () => {
  it('never renders the raw message text in safeMessage — the exact N-01/N-21 production failure mode', () => {
    const raw =
      "Invalid property 'cr664_requirementstatus' at System.ServiceModel.Channels... OData version=4.0";
    const mapped = mapDocumentWriteError(raw);
    expect(mapped.safeMessage).not.toContain('cr664_requirementstatus');
    expect(mapped.safeMessage).not.toContain('System.ServiceModel');
    expect(mapped.safeMessage).not.toContain('OData');
  });

  it('preserves the original raw text in technicalDetail, unmodified, for internal diagnostics only', () => {
    const raw = 'Invalid property \'cr664_requirementstatus\'';
    const mapped = mapDocumentWriteError(raw);
    expect(mapped.technicalDetail).toBe(raw);
  });

  it('maps every raw transport error to the same fixed safe message shape regardless of content', () => {
    const a = mapDocumentWriteError('row locked');
    const b = mapDocumentWriteError('network timeout after 30000ms');
    expect(a.safeMessage).toContain("We couldn't save that action");
    expect(b.safeMessage).toContain("We couldn't save that action");
  });

  it('includes the supplied correlation id in the safe message when provided', () => {
    const mapped = mapDocumentWriteError('boom', 'dreq-abc123');
    expect(mapped.safeMessage).toContain('dreq-abc123');
  });

  it('falls back to an honest "no correlation id" reference when none is supplied', () => {
    const mapped = mapDocumentWriteError('boom');
    expect(mapped.safeMessage).not.toContain('undefined');
    expect(mapped.safeMessage).toContain('no correlation id');
  });

  it('handles an empty raw message without throwing and without an empty technicalDetail', () => {
    const mapped = mapDocumentWriteError('   ');
    expect(mapped.technicalDetail.length).toBeGreaterThan(0);
  });
});
