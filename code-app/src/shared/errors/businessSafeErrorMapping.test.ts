import { describe, it, expect } from 'vitest';
import { mapBusinessSafeError, mapBusinessSafeReadError } from './businessSafeErrorMapping';

describe('mapBusinessSafeError', () => {
  it('never renders the raw message text in safeMessage', () => {
    const raw =
      "Invalid property 'cr664_someattribute' at System.ServiceModel.Channels... OData version=4.0";
    const mapped = mapBusinessSafeError(raw);
    expect(mapped.safeMessage).not.toContain('cr664_someattribute');
    expect(mapped.safeMessage).not.toContain('System.ServiceModel');
    expect(mapped.safeMessage).not.toContain('OData');
  });

  it('preserves the original raw text in technicalDetail, unmodified, for internal diagnostics only', () => {
    const raw = "Invalid property 'cr664_someattribute'";
    const mapped = mapBusinessSafeError(raw);
    expect(mapped.technicalDetail).toBe(raw);
  });

  it('maps every raw transport error to the same fixed safe message shape regardless of content', () => {
    const a = mapBusinessSafeError('row locked');
    const b = mapBusinessSafeError('network timeout after 30000ms');
    expect(a.safeMessage).toContain("We couldn't save that action");
    expect(b.safeMessage).toContain("We couldn't save that action");
  });

  it('includes the supplied correlation id in the safe message when provided', () => {
    const mapped = mapBusinessSafeError('boom', 'corr-abc123');
    expect(mapped.safeMessage).toContain('corr-abc123');
  });

  it('falls back to an honest "no correlation id" reference when none is supplied', () => {
    const mapped = mapBusinessSafeError('boom');
    expect(mapped.safeMessage).not.toContain('undefined');
    expect(mapped.safeMessage).toContain('no correlation id');
  });

  it('handles an empty raw message without throwing and without an empty technicalDetail', () => {
    const mapped = mapBusinessSafeError('   ');
    expect(mapped.technicalDetail.length).toBeGreaterThan(0);
  });
});

describe('mapBusinessSafeReadError (146 Factory arc, Workstream 146-G)', () => {
  it('never renders the raw message text in safeMessage', () => {
    const raw = "EntityNotFoundException: cr664_deal with id 'x' does not exist (OData v4)";
    const mapped = mapBusinessSafeReadError(raw);
    expect(mapped.safeMessage).not.toContain('EntityNotFoundException');
    expect(mapped.safeMessage).not.toContain('cr664_deal');
  });

  it('uses read-appropriate copy ("load"), never the write-path "save that action" claim', () => {
    const mapped = mapBusinessSafeReadError('boom');
    expect(mapped.safeMessage).toContain("We couldn't load that information");
    expect(mapped.safeMessage).not.toContain('save that action');
  });

  it('preserves the original raw text in technicalDetail, unmodified, for internal diagnostics only', () => {
    const raw = 'row locked';
    const mapped = mapBusinessSafeReadError(raw);
    expect(mapped.technicalDetail).toBe(raw);
  });

  it('falls back to an honest "no correlation id" reference when none is supplied', () => {
    const mapped = mapBusinessSafeReadError('boom');
    expect(mapped.safeMessage).not.toContain('undefined');
    expect(mapped.safeMessage).toContain('no correlation id');
  });
});
