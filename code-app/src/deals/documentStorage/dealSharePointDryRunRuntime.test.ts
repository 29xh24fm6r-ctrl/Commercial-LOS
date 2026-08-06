import { describe, expect, it } from 'vitest';
import { getDealSharePointDryRunRuntime } from './dealSharePointDryRunRuntime';

describe('SharePoint DRY_RUN production composition', () => {
  it('has no fabricated generated service or in-memory fallback', async () => {
    const runtime = getDealSharePointDryRunRuntime();
    expect(runtime.available).toBe(false);
    expect(runtime.reasons).toContain('The Power Apps SDK has not generated the inspected transport workflow Run client.');
    expect((await runtime.port.validateFolder({} as never)).ok).toBe(false);
  });
});
