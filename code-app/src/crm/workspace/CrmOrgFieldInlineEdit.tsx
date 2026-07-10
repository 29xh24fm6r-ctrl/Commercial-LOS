import { useState, type CSSProperties } from 'react';
import { palette, radius, spacing, typography } from '../../shared/theme';
import {
  updateOrganizationField,
  describeUpdateFailure,
  buildLiveCrmUpdateDeps,
  type CrmUpdatableOrgField,
  type CrmUpdateActor,
  type CrmUpdateDeps,
} from '../write/crmUpdateAdapter';
import { NaicsTypeahead } from '../naics/NaicsTypeahead';
import { isSixDigitNaicsCode } from '../naics/validateNaicsCode';
import { sectorForCode } from '../naics/naicsSectorMap';
import type { NaicsLoader, NaicsCodeLookup } from '../naics/naicsSearch';

/**
 * CRM-G — governed inline edit for a CRM company field, wired for the live CRM Hub.
 *
 * Self-contained (no global-toast dependency, so it mounts safely inside the hub drawer):
 * click-to-edit with an optimistic update, and it routes EVERY save through the governed
 * updateOrganizationField adapter — identity/authorization gate, allow-list, sensitive-value
 * rejection, per-field validation, and a cr664_crmauditentries audit with actor binding. On
 * failure it ROLLS BACK to the prior value and shows the reason. It never widens the write
 * surface: an unauthorized actor sees a disabled, non-editable field.
 *
 * CONTROLLED INPUTS (parity with the create flow): a field with a bounded domain edits through
 * the SAME control the Add Company / Add Contact flow uses — Type/party role is a `<select>` over
 * the party-type enum (no arbitrary free text), and NAICS uses the shared `NaicsTypeahead` picker
 * with a strict six-digit save gate + derived-sector preview. Free-text fields (Industry manual
 * override, Website, Notes) remain plain inputs.
 */

export type CrmInlineEditControl = 'text' | 'select' | 'naics';

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
  /** Which input to render. Defaults to a free-text input. */
  readonly control?: CrmInlineEditControl;
  /** Options for a `select` control (value === stored value), e.g. the party-type enum. */
  readonly options?: ReadonlyArray<{ readonly value: string; readonly label: string }>;
  /** Injectable NAICS reference loader/lookup for the `naics` control (tests); live defaults otherwise. */
  readonly naicsLoader?: NaicsLoader;
  readonly naicsFindByCode?: NaicsCodeLookup;
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
  control = 'text',
  options = [],
  naicsLoader,
  naicsFindByCode,
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

  // Single governed save path for every control. `nextRaw` is the proposed value.
  async function commit(nextRaw: string) {
    const next = nextRaw.trim();
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

  if (editing && control === 'select') {
    const known = options.some((o) => o.value === committed);
    return (
      <select
        autoFocus
        defaultValue={committed}
        aria-label={`Edit ${label}`}
        data-crm-inline-edit={field}
        onChange={(e) => void commit(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            setEditing(false);
          }
        }}
        style={selectStyle}
      >
        {/* Empty current value → a disabled placeholder forces an explicit valid choice. */}
        {committed.length === 0 && (
          <option value="" disabled>
            Select {label}
          </option>
        )}
        {/* A legacy off-list value is shown honestly as the current selection; the only OTHER
            choices are on-list options, so a change can only ever land on a valid party type. */}
        {!known && committed.length > 0 && (
          <option value={committed}>{committed} — current (non-standard)</option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (editing && control === 'naics') {
    return (
      <NaicsInlineEditor
        initialCode={committed}
        label={label}
        loader={naicsLoader}
        findByCode={naicsFindByCode}
        onCancel={() => setEditing(false)}
        onCommit={(code) => void commit(code)}
      />
    );
  }

  if (editing) {
    return (
      <input
        autoFocus
        defaultValue={draft}
        aria-label={`Edit ${label}`}
        data-crm-inline-edit={field}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void commit(draft);
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

/**
 * NAICS edit control. Reuses the SAME picker the create flow uses (`NaicsTypeahead`): search an
 * industry in words or a code, and only a confirmed reference hit becomes the selected code. Save is
 * GATED on an exactly-six-digit code (or an intentional clear of an existing code); an invalid entry
 * leaves Save disabled so the write adapter is never called. The derived sector is previewed before
 * save — never fabricated (an unmapped code is saved as-is with an honest note).
 */
function NaicsInlineEditor({
  initialCode,
  label,
  loader,
  findByCode,
  onCancel,
  onCommit,
}: {
  readonly initialCode: string;
  readonly label: string;
  readonly loader?: NaicsLoader;
  readonly findByCode?: NaicsCodeLookup;
  readonly onCancel: () => void;
  readonly onCommit: (code: string) => void;
}) {
  const [code, setCode] = useState(initialCode.trim());
  const trimmed = code.trim();
  const validFormat = isSixDigitNaicsCode(trimmed);
  const isClear = trimmed.length === 0 && initialCode.trim().length > 0; // intentional clear of an existing code
  const changed = trimmed !== initialCode.trim();
  const canSave = (validFormat || isClear) && changed;
  const sector = validFormat ? sectorForCode(trimmed) : null;

  return (
    <div style={naicsEditorStyle} data-crm-naics-editor>
      <NaicsTypeahead
        value={initialCode ? { code: initialCode } : undefined}
        loader={loader}
        findByCode={findByCode}
        label={label}
        onSelect={(hit) => setCode((hit?.code ?? '').trim())}
      />

      {validFormat && (
        <p style={naicsPreviewStyle} role="status" data-crm-naics-sector-preview>
          {sector
            ? `Derived Industry: ${sector.sectorTitle} (sector ${sector.sectorCode})`
            : 'No standard sector maps to this code — it will be saved exactly as entered.'}
        </p>
      )}
      {!validFormat && trimmed.length > 0 && (
        <p style={naicsErrorStyle} role="alert" data-crm-naics-inline-error>
          Enter exactly six numeric digits before saving.
        </p>
      )}
      {isClear && (
        <p style={naicsPreviewStyle} role="status" data-crm-naics-clear-note>
          Clearing the NAICS code — the displayed Industry will fall back to the manual override, if any.
        </p>
      )}

      <div style={naicsBtnRow}>
        <button
          type="button"
          disabled={!canSave}
          data-crm-naics-save
          onClick={() => onCommit(trimmed)}
          style={naicsSaveStyle(canSave)}
        >
          Save NAICS
        </button>
        <button type="button" data-crm-naics-cancel onClick={onCancel} style={naicsCancelStyle}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const wrapStyle: CSSProperties = { display: 'inline-flex', flexDirection: 'column', gap: 2 };
const inputStyle: CSSProperties = { height: '1.9rem', maxWidth: 320, font: 'inherit', padding: `0 ${spacing.xs}` };
const selectStyle: CSSProperties = {
  height: '2rem',
  maxWidth: 320,
  font: 'inherit',
  padding: `0 ${spacing.xs}`,
  border: `1px solid ${palette.border}`,
  borderRadius: radius.sm,
  background: palette.surface,
  color: palette.text,
};
const naicsEditorStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.xs, maxWidth: 360 };
const naicsPreviewStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textMuted };
const naicsErrorStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.blocked };
const naicsBtnRow: CSSProperties = { display: 'flex', gap: spacing.xs };
function naicsSaveStyle(enabled: boolean): CSSProperties {
  return {
    font: 'inherit',
    fontSize: typography.size.sm,
    padding: `${spacing.xxs} ${spacing.sm}`,
    borderRadius: radius.sm,
    border: 'none',
    background: enabled ? palette.accent : palette.border,
    color: enabled ? palette.accentFg : palette.textMuted,
    cursor: enabled ? 'pointer' : 'not-allowed',
  };
}
const naicsCancelStyle: CSSProperties = {
  font: 'inherit',
  fontSize: typography.size.sm,
  padding: `${spacing.xxs} ${spacing.sm}`,
  borderRadius: radius.sm,
  border: `1px solid ${palette.border}`,
  background: 'transparent',
  color: palette.text,
  cursor: 'pointer',
};
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
