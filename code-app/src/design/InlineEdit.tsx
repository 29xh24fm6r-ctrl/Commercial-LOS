import { useEffect, useRef, useState } from 'react';
import { useToast } from './toastContext';

export interface InlineEditProps {
  /** Current persisted value. */
  value: string;
  /**
   * Persist the new value. MUST route through the governed write path (audit +
   * timeline); the optimistic UI sits on top, it never replaces governance.
   * Resolve on success, reject to roll back.
   */
  onSave: (next: string) => Promise<void>;
  /** Field name, used in the accessible label + the toast ("Company saved"). */
  label: string;
  /** Disable editing (e.g. no write authorization) with an explanation. */
  disabled?: boolean;
  disabledReason?: string;
  /** Placeholder when empty. */
  placeholder?: string;
}

/**
 * Click-to-edit field with an optimistic update: the new value shows immediately,
 * a success toast confirms the governed write, and a failure rolls the value back
 * with an error toast. No modal for a simple edit.
 */
export function InlineEdit({ value, onSave, label, disabled = false, disabledReason, placeholder = '—' }: InlineEditProps) {
  const { toast } = useToast();
  const [committed, setCommitted] = useState(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [prevValue, setPrevValue] = useState(value);

  // Re-sync only when the persisted value genuinely changes upstream (React's
  // "adjust state during render" pattern — not an effect), so a successful
  // optimistic save is never clobbered when the parent holds the prop stale.
  if (value !== prevValue) {
    setPrevValue(value);
    if (!editing) setCommitted(value);
  }

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function begin() {
    if (disabled || pending) return;
    setDraft(committed);
    setEditing(true);
  }

  async function commit() {
    const next = draft.trim();
    setEditing(false);
    if (next === committed) return;

    const previous = committed;
    setCommitted(next); // optimistic
    setPending(true);
    try {
      await onSave(next);
      toast({ title: `${label} saved`, tone: 'success' });
    } catch (err) {
      setCommitted(previous); // rollback
      toast({
        title: `Could not save ${label.toLowerCase()}`,
        description: err instanceof Error ? err.message : 'The change was not saved.',
        tone: 'error',
      });
    } finally {
      setPending(false);
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="ig-input"
        defaultValue={draft}
        aria-label={`Edit ${label}`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setEditing(false);
          }
        }}
        style={{ height: '1.9rem', maxWidth: 320 }}
      />
    );
  }

  return (
    <button
      type="button"
      className="ig-inline"
      onClick={begin}
      disabled={disabled}
      title={disabled ? disabledReason : `Edit ${label}`}
      aria-label={`${label}: ${committed || 'empty'}${disabled ? '' : ' — click to edit'}`}
      style={{ font: 'inherit', color: 'inherit', textAlign: 'left' }}
    >
      <span>{committed || placeholder}</span>
      {!disabled && (
        <svg className="ig-inline__pencil" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      )}
    </button>
  );
}
