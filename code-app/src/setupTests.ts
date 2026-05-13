import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Vitest 3 + RTL 16 do not auto-cleanup between tests. Without this,
// every render() leaks DOM into the next test and selectors return
// stale matches.
afterEach(() => {
  cleanup();
});
