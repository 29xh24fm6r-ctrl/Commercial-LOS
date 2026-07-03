import { useState, type CSSProperties } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { palette, radius, shadow, spacing, typography } from '../../shared/theme';
import { CRM_PARTY_TYPE_OPTIONS } from '../crmPartyTypes';
import { ADVISOR_ROLE_OPTIONS } from '../advisors/advisorRoles';
import { NaicsTypeahead } from '../naics/NaicsTypeahead';
import { buildLiveCrmWriteFns, type CrmWriteFns } from '../write/crmWriteActions';
import type { CrmWriteOutcome } from '../write/crmWriteAdapter';

/**
 * Phase 261 (B) — CRM write action bar + modal forms.
 *
 * The action surface that makes the CRM operable: Add Company, Add Contact,
 * Log Activity, New Follow-up, and Add Relationship. Each opens a focused modal
 * that calls the governed adapter (readback + audit) and reports the outcome.
 * When no Dataverse identity is resolved the actions are disabled with a clear,
 * non-engineering explanation (not hidden dead buttons).
 */

export type CrmActionKind = 'company' | 'contact' | 'activity' | 'task' | 'relationship' | 'advisor';

export interface CrmOption {
  readonly id: string;
  readonly label: string;
}

interface Props {
  readonly authorized: boolean;
  readonly actorEmail: string | undefined;
  readonly actorSystemUserId: string | undefined;
  readonly disabledReason: string | undefined;
  /** Existing companies + people, for linking selects. */
  readonly companyOptions: readonly CrmOption[];
  readonly personOptions: readonly CrmOption[];
  /** Called after a successful write so the workspace can reload. */
  readonly onWritten?: () => void;
  /** Injected for tests; defaults to the live governed writes. */
  readonly writeFns?: CrmWriteFns;
  /**
   * Record-scoped mode: when set, the action forms pre-bind this organization
   * (contact.employerOrganization / activity.organization / task.organization /
   * relationship.sourceOrganization), and only the actions in `actions` render as
   * a compact in-drawer row. Used by the company detail drawer.
   */
  readonly presetOrganizationId?: string;
  readonly actions?: readonly CrmActionKind[];
}

const ACTIONS: ReadonlyArray<{ kind: CrmActionKind; label: string }> = [
  { kind: 'company', label: '+ Add Company' },
  { kind: 'contact', label: '+ Add Contact' },
  { kind: 'activity', label: 'Log Activity' },
  { kind: 'task', label: 'New Follow-up' },
  { kind: 'relationship', label: 'Add Relationship' },
  { kind: 'advisor', label: 'Add Advisor' },
];

/** Record-scoped mode pre-binds the open company to the relevant form field. */
function presetFieldsFor(kind: CrmActionKind, orgId: string | undefined): Record<string, string> {
  if (!orgId) return {};
  switch (kind) {
    case 'contact':
      return { employerOrganizationId: orgId };
    case 'activity':
    case 'task':
      return { organizationId: orgId };
    case 'relationship':
      return { sourceOrganizationId: orgId };
    default:
      return {};
  }
}

export function CrmWriteActions({
  authorized,
  actorEmail,
  actorSystemUserId,
  disabledReason,
  companyOptions,
  personOptions,
  onWritten,
  writeFns,
  presetOrganizationId,
  actions,
}: Props) {
  const [open, setOpen] = useState<CrmActionKind | undefined>(undefined);
  const fns = writeFns ?? null; // resolved lazily so the live deps aren't built in tests that inject
  const recordActions = actions ? ACTIONS.filter((a) => actions.includes(a.kind)) : undefined;

  // Record-scoped compact row (in the company drawer): the requested actions,
  // each pre-binding this company. Reuses the exact governed modal + adapters.
  if (recordActions) {
    return (
      <div style={styles.bar} data-crm-actions data-crm-actions-record>
        {recordActions.map((a) => (
          <button
            key={a.kind}
            type="button"
            style={authorized ? styles.secondaryBtn : styles.disabledBtn}
            disabled={!authorized}
            data-crm-action={a.kind}
            title={authorized ? undefined : disabledReason}
            onClick={() => setOpen(a.kind)}
          >
            {a.label}
          </button>
        ))}
        {!authorized && (
          <span style={styles.disabledNote} data-crm-actions-disabled>
            {disabledReason ?? 'Sign-in identity is still resolving; CRM editing will enable shortly.'}
          </span>
        )}
        {open && authorized && (
          <CrmActionModal
            kind={open}
            presetFields={presetFieldsFor(open, presetOrganizationId)}
            actor={{ actorEmail, actorSystemUserId, authorized }}
            companyOptions={companyOptions}
            personOptions={personOptions}
            fns={fns ?? buildLiveCrmWriteFns()}
            onClose={() => setOpen(undefined)}
            onWritten={() => onWritten?.()}
          />
        )}
      </div>
    );
  }

  // v3 FIX 3 — restore the single-primary rule: one Seal-Red primary (Add Company)
  // + one quiet secondary (Add Contact); everything else lives in a tidy overflow.
  const primary = ACTIONS[0]; // company
  const secondary = ACTIONS[1]; // contact
  const overflow = ACTIONS.slice(2); // activity, task, relationship, advisor

  return (
    <div style={styles.bar} data-crm-actions>
      {[primary, secondary].map((a) => (
        <button
          key={a.kind}
          type="button"
          style={authorized ? (a.kind === 'company' ? styles.primaryBtn : styles.secondaryBtn) : styles.disabledBtn}
          disabled={!authorized}
          data-crm-action={a.kind}
          title={authorized ? undefined : disabledReason}
          onClick={() => setOpen(a.kind)}
        >
          {a.label}
        </button>
      ))}
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            style={authorized ? styles.secondaryBtn : styles.disabledBtn}
            disabled={!authorized}
            data-crm-actions-more
            aria-label="More CRM actions"
            title={authorized ? undefined : disabledReason}
          >
            More ▾
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content className="ig-popover-menu" align="end" sideOffset={6}>
            {overflow.map((a) => (
              <Popover.Close asChild key={a.kind}>
                <button type="button" className="ig-popover-item" data-crm-action={a.kind} onClick={() => setOpen(a.kind)}>
                  {a.label}
                </button>
              </Popover.Close>
            ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {!authorized && (
        <span style={styles.disabledNote} data-crm-actions-disabled>
          {disabledReason ?? 'Sign-in identity is still resolving; CRM editing will enable shortly.'}
        </span>
      )}

      {open && authorized && (
        <CrmActionModal
          kind={open}
          actor={{ actorEmail, actorSystemUserId, authorized }}
          companyOptions={companyOptions}
          personOptions={personOptions}
          fns={fns ?? buildLiveCrmWriteFns()}
          onClose={() => setOpen(undefined)}
          onWritten={() => {
            onWritten?.();
          }}
        />
      )}
    </div>
  );
}

interface ActorCtx {
  actorEmail: string | undefined;
  actorSystemUserId: string | undefined;
  authorized: boolean;
}

const TITLES: Record<CrmActionKind, string> = {
  company: 'Add Company',
  contact: 'Add Contact',
  activity: 'Log Activity',
  task: 'Create Follow-up Task',
  relationship: 'Add Relationship',
  advisor: 'Add Advisor / Professional',
};

function CrmActionModal({
  kind,
  actor,
  companyOptions,
  personOptions,
  fns,
  onClose,
  onWritten,
  presetFields,
}: {
  kind: CrmActionKind;
  actor: ActorCtx;
  companyOptions: readonly CrmOption[];
  personOptions: readonly CrmOption[];
  fns: CrmWriteFns;
  onClose: () => void;
  onWritten: () => void;
  presetFields?: Record<string, string>;
}) {
  const [fields, setFields] = useState<Record<string, string>>({ activityType: 'call', ...presetFields });
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<CrmWriteOutcome | undefined>(undefined);

  const set = (k: string, v: string) => setFields((s) => ({ ...s, [k]: v }));
  const val = (k: string) => fields[k] ?? '';

  async function submit() {
    setBusy(true);
    const a = { actorEmail: actor.actorEmail, actorSystemUserId: actor.actorSystemUserId, authorized: actor.authorized };
    let result: CrmWriteOutcome;
    switch (kind) {
      case 'company':
        result = await fns.addCompany({ ...a, name: val('name'), organizationType: val('organizationType'), industry: val('industry'), naicsCode: val('naicsCode'), website: val('website'), notes: val('notes') });
        break;
      case 'contact':
        result = await fns.addContact({ ...a, firstName: val('firstName'), lastName: val('lastName'), title: val('title'), email: val('email'), phone: val('phone'), employerOrganizationId: val('employerOrganizationId'), notes: val('notes') });
        break;
      case 'activity':
        result = await fns.logActivity({ ...a, activityType: (val('activityType') || 'call') as 'call' | 'email' | 'meeting' | 'note', summary: val('summary'), occurredAt: val('occurredAt'), outcome: val('outcome'), nextFollowUpDate: val('nextFollowUpDate'), organizationId: val('organizationId'), personId: val('personId') });
        break;
      case 'task':
        result = await fns.createFollowUpTask({ ...a, title: val('title'), dueDate: val('dueDate'), personId: val('personId'), organizationId: val('organizationId'), notes: val('notes') });
        break;
      case 'relationship':
        result = await fns.addRelationship({ ...a, name: val('name'), relationshipType: val('relationshipType'), role: val('role'), sourceOrganizationId: val('sourceOrganizationId'), targetPersonId: val('targetPersonId'), notes: val('notes') });
        break;
      case 'advisor':
        result = await fns.addAdvisorLink({
          ...a,
          advisorOrganizationId: val('advisorOrganizationId'),
          clientOrganizationId: val('clientOrganizationId'),
          role: val('role'),
          notes: val('notes'),
          advisorName: companyOptions.find((o) => o.id === val('advisorOrganizationId'))?.label,
          clientName: companyOptions.find((o) => o.id === val('clientOrganizationId'))?.label,
        });
        break;
    }
    setOutcome(result);
    setBusy(false);
    if (result.kind === 'success') onWritten();
  }

  return (
    <div style={styles.backdrop} role="dialog" aria-modal="true" aria-label={TITLES[kind]} data-crm-action-modal={kind}>
      <div style={styles.modal}>
        <div style={styles.modalHead}>
          <div style={styles.modalTitle}>{TITLES[kind]}</div>
          <button type="button" style={styles.modalClose} aria-label="Close" data-crm-action-close onClick={onClose}>✕</button>
        </div>

        {outcome?.kind === 'success' ? (
          <div style={styles.ok} role="status" data-crm-action-success>
            Saved. Verified and audited (ref {outcome.correlationId}).
            {outcome.childErrors.length > 0 && (
              <span data-crm-action-child-errors> {outcome.childErrors.length} contact detail(s) could not be saved.</span>
            )}
            <div style={styles.okActions}>
              <button type="button" style={styles.secondaryBtn} onClick={onClose} data-crm-action-done>Done</button>
            </div>
          </div>
        ) : (
          <>
            <div style={styles.formGrid}>
              {fieldsFor(kind, companyOptions, personOptions).map((f) =>
                f.type === 'naics' ? (
                  <div key={f.key} style={styles.fieldFull}>
                    <NaicsTypeahead
                      label={f.label}
                      value={val('naicsCode') ? { code: val('naicsCode') } : undefined}
                      onSelect={(hit) => set('naicsCode', hit?.code ?? '')}
                    />
                  </div>
                ) : f.type === 'select' ? (
                  <label key={f.key} style={f.full ? styles.fieldFull : styles.field}>
                    <span style={styles.label}>{f.label}{f.required ? ' *' : ''}</span>
                    <select style={styles.input} value={val(f.key)} data-crm-field={f.key} onChange={(e) => set(f.key, e.target.value)}>
                      <option value="">{f.placeholder ?? '—'}</option>
                      {f.options!.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label key={f.key} style={f.full ? styles.fieldFull : styles.field}>
                    <span style={styles.label}>{f.label}{f.required ? ' *' : ''}</span>
                    <input
                      style={styles.input}
                      type={f.type === 'date' ? 'date' : 'text'}
                      value={val(f.key)}
                      data-crm-field={f.key}
                      onChange={(e) => set(f.key, e.target.value)}
                    />
                  </label>
                ),
              )}
            </div>

            {outcome && (
              <div style={styles.err} role="alert" data-crm-action-error>{describeFailure(outcome)}</div>
            )}

            <div style={styles.modalActions}>
              <button type="button" style={styles.ghostBtn} onClick={onClose} data-crm-action-cancel>Cancel</button>
              <button
                type="button"
                style={busy ? styles.disabledBtn : styles.primaryBtn}
                disabled={busy}
                data-crm-action-submit
                onClick={() => void submit()}
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface FieldSpec {
  key: string;
  label: string;
  type: 'text' | 'date' | 'select' | 'naics';
  required?: boolean;
  full?: boolean;
  placeholder?: string;
  options?: ReadonlyArray<{ value: string; label: string }>;
}

function toOptions(opts: readonly CrmOption[]): Array<{ value: string; label: string }> {
  return opts.map((o) => ({ value: o.id, label: o.label }));
}

function fieldsFor(kind: CrmActionKind, companies: readonly CrmOption[], people: readonly CrmOption[]): FieldSpec[] {
  const companySel = toOptions(companies);
  const peopleSel = toOptions(people);
  switch (kind) {
    case 'company':
      return [
        { key: 'name', label: 'Company name', type: 'text', required: true, full: true },
        { key: 'organizationType', label: 'Type', type: 'select', options: CRM_PARTY_TYPE_OPTIONS, placeholder: 'Select a type' },
        // NAICS is the primary structured industry field; the free-text below is a
        // clearly-optional plain-language note subordinate to it (v3 FIX 4).
        { key: 'naics', label: 'Industry (NAICS)', type: 'naics', full: true },
        { key: 'industry', label: 'Industry note (optional)', type: 'text', full: true },
        { key: 'website', label: 'Website', type: 'text' },
        { key: 'notes', label: 'Notes', type: 'text', full: true },
      ];
    case 'contact':
      return [
        { key: 'firstName', label: 'First name', type: 'text' },
        { key: 'lastName', label: 'Last name', type: 'text' },
        { key: 'title', label: 'Title / role', type: 'text' },
        { key: 'email', label: 'Email', type: 'text' },
        { key: 'phone', label: 'Phone', type: 'text' },
        { key: 'employerOrganizationId', label: 'Company', type: 'select', options: companySel, placeholder: 'Link a company (optional)' },
        { key: 'notes', label: 'Notes', type: 'text', full: true },
      ];
    case 'activity':
      return [
        { key: 'activityType', label: 'Type', type: 'select', required: true, options: [
          { value: 'call', label: 'Call' }, { value: 'email', label: 'Email' }, { value: 'meeting', label: 'Meeting' }, { value: 'note', label: 'Note' },
        ], placeholder: 'Call' },
        { key: 'occurredAt', label: 'Date', type: 'date' },
        { key: 'summary', label: 'What happened', type: 'text', required: true, full: true },
        { key: 'outcome', label: 'Outcome', type: 'text' },
        { key: 'nextFollowUpDate', label: 'Next follow-up date', type: 'date' },
        { key: 'organizationId', label: 'Company', type: 'select', options: companySel, placeholder: 'Link a company (optional)' },
        { key: 'personId', label: 'Contact', type: 'select', options: peopleSel, placeholder: 'Link a contact (optional)' },
      ];
    case 'task':
      return [
        { key: 'title', label: 'Task', type: 'text', required: true, full: true },
        { key: 'dueDate', label: 'Due date', type: 'date' },
        { key: 'personId', label: 'Contact', type: 'select', options: peopleSel, placeholder: 'Link a contact (optional)' },
        { key: 'organizationId', label: 'Company', type: 'select', options: companySel, placeholder: 'Link a company (optional)' },
        { key: 'notes', label: 'Notes', type: 'text', full: true },
      ];
    case 'relationship':
      return [
        { key: 'name', label: 'Relationship name', type: 'text', required: true, full: true },
        { key: 'relationshipType', label: 'Type', type: 'text' },
        { key: 'role', label: 'Role', type: 'text' },
        { key: 'sourceOrganizationId', label: 'Company', type: 'select', options: companySel, placeholder: 'Company (optional)' },
        { key: 'targetPersonId', label: 'Person', type: 'select', options: peopleSel, placeholder: 'Person (optional)' },
        { key: 'notes', label: 'Notes', type: 'text', full: true },
      ];
    case 'advisor':
      return [
        { key: 'advisorOrganizationId', label: 'Advisor / professional', type: 'select', required: true, options: companySel, placeholder: 'Select the advisor party' },
        { key: 'role', label: 'Role', type: 'select', required: true, options: ADVISOR_ROLE_OPTIONS, placeholder: 'Select a role' },
        { key: 'clientOrganizationId', label: 'Serves client', type: 'select', required: true, options: companySel, placeholder: 'Select the client' },
        { key: 'notes', label: 'Notes', type: 'text', full: true },
      ];
  }
}

function describeFailure(o: Exclude<CrmWriteOutcome, { kind: 'success' }>): string {
  switch (o.kind) {
    case 'invalid-input': return o.reason;
    case 'unauthorized': return o.reason;
    case 'identity-unresolved': return o.reason;
    case 'write-failed': return `Could not save — the write failed. ${o.error}`;
    case 'readback-mismatch': return 'Could not save — the record did not verify on readback. Please retry.';
    case 'audit-failed': return 'Saved, but its audit entry failed — an operator must reattempt the audit.';
  }
}

const styles: Record<string, CSSProperties> = {
  bar: { display: 'flex', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap', justifyContent: 'flex-end' },
  // The single Seal-Red primary action (Intaglio: one primary per context).
  primaryBtn: { background: palette.accent, color: '#fffdf9', border: 'none', borderRadius: radius.md, padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, fontFamily: typography.family, cursor: 'pointer' },
  secondaryBtn: { background: palette.surface, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, fontFamily: typography.family, cursor: 'pointer' },
  ghostBtn: { background: 'transparent', color: palette.textMuted, border: `1px solid ${palette.border}`, borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, fontFamily: typography.family, cursor: 'pointer' },
  disabledBtn: { background: palette.surfaceAlt, color: palette.textSubtle, border: `1px solid ${palette.border}`, borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, fontFamily: typography.family, cursor: 'not-allowed' },
  disabledNote: { fontSize: typography.size.xs, color: palette.textSubtle, maxWidth: 260 },
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: spacing.xxl, zIndex: 50 },
  modal: { background: palette.surface, border: `1px solid ${palette.panelBorder}`, borderRadius: radius.lg, boxShadow: shadow.elevated, padding: `${spacing.lg} ${spacing.xl}`, width: 'min(720px, 96vw)', maxHeight: '86vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: spacing.md },
  modalHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: palette.text },
  modalClose: { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: typography.size.md, color: palette.textMuted },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: spacing.sm },
  field: { display: 'flex', flexDirection: 'column', gap: 2 },
  fieldFull: { display: 'flex', flexDirection: 'column', gap: 2, gridColumn: '1 / -1' },
  label: { fontSize: typography.size.xs, color: palette.textSubtle, fontWeight: typography.weight.semibold },
  input: { padding: `${spacing.xs} ${spacing.sm}`, border: `1px solid ${palette.border}`, borderRadius: radius.sm, fontSize: typography.size.sm, fontFamily: typography.family, background: palette.surface, color: palette.text },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: spacing.sm },
  ok: { background: palette.clearBg, border: `1px solid ${palette.clear}`, borderRadius: radius.sm, padding: `${spacing.md} ${spacing.md}`, color: palette.text, fontSize: typography.size.sm, display: 'flex', flexDirection: 'column', gap: spacing.sm },
  okActions: { display: 'flex', justifyContent: 'flex-end' },
  err: { background: palette.atRiskBg, border: `1px solid ${palette.atRisk}`, borderRadius: radius.sm, padding: `${spacing.sm} ${spacing.md}`, color: palette.text, fontSize: typography.size.sm },
};
