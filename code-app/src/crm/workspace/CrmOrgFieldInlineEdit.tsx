import { useState, type CSSProperties } from 'react';
import { palette, spacing, typography } from '../../shared/theme';
import {
  updateOrganizationField,
  describeUpdateFailure,
  buildLiveCrmUpdateDeps,
  type CrmUpdatableOrgField,
  type CrmUpdateActor,
  type CrmUpdateDeps,
} from '../write/crmUpdateAdapter';

/**
 * CRM-G — governed inline edit for a CRM company field, wired for the live CRM Hub.
 *
 * Self-contained (no global-toast dependency, so it mounts safely inside the hub drawer):
 * click-to-edit with an optimistic update, and it routes EVERY save through the governed
 * updateOrganizationField adapter — identity/authorization gate, allow-list, sensitive-value
 * rejection, per-field validation, and a cr664_crmauditentries audit with actor binding. On
 * failure it ROLLS BACK to the prior value and shows the reason. It never widens the write
 * surface: an unauthorized actor sees a disabled, non-editable field.
 */

export interface CrmOrgFieldInlineEditProps {
  readonly organizationId: string;
  readonly field: CrmUpdatableOrgField;
  readonly label: string;
  readonly value: string;
  readonly actor: CrmUpdateActor;
  /** Injected in tests; defaults to the live generated-service deps. */
  readonly deps?: CrmUpdateDeps;
  readonly disabledReason?: string;
  readonly placeholder?: string;
}

type SaveStatus = { readonly tone: 'success' | 'error'; readonly message: string } | null;

export function CrmOrgFieldInlineEdit({
  organizationId,
  field,
  label,
  value,
  actor,
  deps,
  disabledReason,
  placeholder = '—',
}: CrmOrgFieldInlineEditProps) {
  const authorized =
    actor.authorized === true &&
    (actor.actorSystemUserId ?? '').trim().length > 0 &&
    (actor.actorEmail ?? '').trim().length > 0;

  const [committed, setCommitted] = useState(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<SaveStatus>(null);

  function begin() {
    if (!authorized || pending) return;
    setDraft(committed);
    setStatus(null);
    setEditing(true);
  }

  async function commit() {
    const next = draft.trim();
    setEditing(false);
    if (next === committed) return;

    const previous = committed;
    setCommitted(next); // optimistic
    setPending(true);
    const outcome = await updateOrganizationField(
      { ...actor, organizationId, field, value: next },
      deps ?? buildLiveCrmUpdateDeps(),
    );
    setPending(false);
    if (outcome.kind === 'success') {
      setStatus({ tone: 'success', message: `${label} saved` });
    } else {
      setCommitted(previous); // rollback
      setStatus({ tone: 'error', message: describeUpdateFailure(outcome) });
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        defaultValue={draft}
        aria-label={`Edit ${label}`}
        data-crm-inline-edit={field}
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
        style={inputStyle}
      />
    );
  }

  return (
    <span style={wrapStyle}>
      <button
        type="button"
        onClick={begin}
        disabled={!authorized || pending}
        data-crm-inline-edit-trigger={field}
        title={authorized ? `Edit ${label}` : disabledReason}
        aria-label={`${label}: ${committed || 'empty'}${authorized ? ' — click to edit' : ''}`}
        style={triggerStyle(authorized)}
      >
        {committed || placeholder}
      </button>
      {status && (
        <span role="status" style={statusStyle(status.tone)} data-crm-inline-edit-status={status.tone}>
          {status.message}
        </span>
      )}
    </span>
  );
}

const wrapStyle: CSSProperties = { display: 'inline-flex', flexDirection: 'column', gap: 2 };
const inputStyle: CSSProperties = { height: '1.9rem', maxWidth: 320, font: 'inherit', padding: `0 ${spacing.xs}` };
function triggerStyle(authorized: boolean): CSSProperties {
  return {
    font: 'inherit',
    textAlign: 'left',
    background: 'transparent',
    border: 'none',
    padding: 0,
    color: palette.text,
    cursor: authorized ? 'pointer' : 'default',
  };
}
function statusStyle(tone: 'success' | 'error'): CSSProperties {
  return { fontSize: typography.size.xs, color: tone === 'success' ? palette.clear : palette.blocked };
}
