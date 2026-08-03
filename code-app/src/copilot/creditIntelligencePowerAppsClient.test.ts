import { describe, expect, it } from 'vitest';
import { _test } from './creditIntelligencePowerAppsClient';

describe('Power Apps credit intelligence client', () => {
  it('unwraps and parses the Custom API ResultJson envelope', () => {
    expect(_test.unwrapResultJson({ success: true, data: { ResultJson: '{"status":"complete"}' } }))
      .toEqual({ status: 'complete' });
  });

  it('fails closed for an unsuccessful platform operation', () => {
    expect(() => _test.unwrapResultJson({ success: false, error: { message: 'denied' } })).toThrow('denied');
  });
});
