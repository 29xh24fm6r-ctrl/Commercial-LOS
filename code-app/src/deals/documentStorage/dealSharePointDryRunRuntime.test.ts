import { describe, expect, it } from 'vitest';
import { getDealSharePointDryRunRuntime } from './dealSharePointDryRunRuntime';

describe('SharePoint DRY_RUN production composition', () => {
  it('has no fabricated generated service or in-memory fallback', async () => {
    const runtime = getDealSharePointDryRunRuntime();
    expect(runtime.available).toBe(false);
    expect(runtime.reasons).toContain('The inspected Power Apps workflow Run client has not been registered by production composition.');
    expect((await runtime.port.validateFolder({} as never)).ok).toBe(false);
  });
});
