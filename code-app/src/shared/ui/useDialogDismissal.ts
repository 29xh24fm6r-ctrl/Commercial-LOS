import { useEffect, useRef, type RefObject } from 'react';

/**
 * final-seven-workstreams Workstream 3C — a shared, tested foundation for hand-rolled modal
 * dismissal behavior: Escape-to-close (the pattern already established across this app's modals),
 * click-outside-to-dismiss, a focus trap while open, and focus return to the element that had
 * focus before the dialog opened.
 *
 * This is an INCREMENTAL migration, not a sweep: every hand-rolled dialog in this app (18 as of
 * this pass) already has its own bespoke Escape handling and none has click-outside/focus-trap/
 * focus-return. Rather than touch all 18 in one under-tested change, this hook is introduced and
 * adopted by a small, deliberately-chosen subset with real regression tests; the remainder is a
 * documented follow-up (see docs/final-seven-workstreams/03_RESIDUAL_REMEDIATION.md), not silently
 * dropped.
 */

export interface UseDialogDismissalOptions {
  /** Called when the dialog should close (Escape or a qualifying outside click). */
  readonly onClose: () => void;
  /** Suppresses Escape/outside-click dismissal while true (e.g. a save is in flight). */
  readonly disabled?: boolean;
  /**
   * When false, clicking outside the dialog does NOT close it — for a form that may hold
   * meaningful unsaved input where an accidental outside click losing work would be worse than a
   * consistent close affordance. Escape and the dialog's own Close button remain available either
   * way. Defaults to true.
   */
  readonly closeOnOutsideClick?: boolean;
}

/**
 * Attach to the dialog's root element. Returns a ref to assign to that element — the hook needs it
 * to distinguish an inside click from an outside one, and to scope the focus trap.
 */
export function useDialogDismissal<T extends HTMLElement>(
  options: UseDialogDismissalOptions,
): RefObject<T | null> {
  const dialogRef = useRef<T | null>(null);
  const { onClose, disabled = false, closeOnOutsideClick = true } = options;

  // Escape-to-close — matches the pattern already established across this app's modals.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !disabled) {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, disabled]);

  // Click-outside-to-dismiss.
  useEffect(() => {
    if (!closeOnOutsideClick) return;
    function onPointerDown(e: MouseEvent) {
      if (disabled) return;
      const node = dialogRef.current;
      if (node && e.target instanceof Node && !node.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [onClose, disabled, closeOnOutsideClick]);

  // Focus trap: Tab/Shift+Tab wrap within the dialog's focusable elements while open.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const node = dialogRef.current;
      if (!node) return;
      const focusable = node.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Focus return: remember what had focus before the dialog opened, restore it on unmount.
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    return () => {
      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus();
      }
    };
  }, []);

  return dialogRef;
}
