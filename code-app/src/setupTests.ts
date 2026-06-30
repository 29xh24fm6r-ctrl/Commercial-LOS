import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom does not implement ResizeObserver / scrollIntoView, which headless UI
// libraries (cmdk, Radix) rely on. Provide inert polyfills so component tests
// that mount the command palette / overlays don't throw.
if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
    ResizeObserverStub;
}
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {};
}

// Vitest 3 + RTL 16 do not auto-cleanup between tests. Without this,
// every render() leaks DOM into the next test and selectors return
// stale matches.
afterEach(() => {
  cleanup();
});
