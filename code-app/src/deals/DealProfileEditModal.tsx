import { useMemo, useState, type CSSProperties } from 'react';
import { useDealData } from './DealDataProvider';
import { useOptionalBanker } from '../banker/BankerContext';
import { palette, radius, spacing, typography } from '../shared/theme';
import type { DealDetail } from './dealQueries';
import {
  Cr664_loandealscr664_customertype,
  Cr664_loandealscr664_industry,
  Cr664_loandealscr664_guarantorstructure,
} from '../generated/models/Cr664_loandealsModel';
import {
  updateDealProfile,
  type DealProfileField,
  type DealProfilePatch,
  type UpdateDealProfileOutcome,
} from './write/updateDealProfile';
import { buildLiveUpdateDealProfileDeps } from './write/buildLiveUpdateDealProfileDeps';

/**
 * Governed Deal Profile completion — banker-facing entry point + modal.
 *
 * `DealProfileEditLauncher` renders the visible "Complete / Edit Deal Profile"
 * button (used from the Missing Fields drill-through, the Attention Console
 * missing-data panel, and the Deal Summary card). Clicking it opens the modal,
 * which edits ONLY the approved, schema-backed profile fields via the governed
 * `updateDealProfile` adapter (validate → update → readback → audit) and, on a
 * verified success, merges the readback-confirmed values into the cockpit's deal
 * row so every surface updates without a full browser reload.
 *
 * Honest scope: productType / loanStructure / pricingType are reference lookups
 * with no reference list yet, so they are shown READ-ONLY here rather than as a
 * fabricated dropdown. Nothing is created; amount / stage / status / banker /
 * client are never written.
 */

/** The five fields this modal edits (schema-backed, safely writable). */
const EDITABLE_CHOICE_FIELDS: ReadonlyArray<{
  field: 'customerType' | 'industry' | 'guarantorStructure';
  label: string;
  options: readonly string[];
}> = [
  { field: 'customerType', label: 'Customer type', options: Object.values(Cr664_loandealscr664_customertype) },
  { field: 'industry', label: 'Industry', options: Object.values(Cr664_loandealscr664_industry) },
  { field: 'guarantorStructure', label: 'Guarantor structure', options: Object.values(Cr664_loandealscr664_guarantorstructure) },
];

/** Reference-lookup fields shown read-only (no reference list to pick from). */
const READ_ONLY_FIELDS: ReadonlyArray<{ field: keyof DealDetail; label: string }> = [
  { field: 'productType', label: 'Product type' },
  { field: 'loanStructure', label: 'Loan structure' },
  { field: 'pricingType', label: 'Pricing type' },
];

function dateInputValue(iso: string | undefined): string {
  return iso ? iso.slice(0, 10) : '';
}

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'done'; outcome: UpdateDealProfileOutcome };

/** The visible entry point. Renders the button (+ modal on click). */
export function DealProfileEditLauncher({
  source,
  compact = false,
}: {
  /** Which surface launched it (data attribute for tests / analytics). */
  source: 'missing-fields' | 'attention-console' | 'deal-summary';
  compact?: boolean;
}) {
  const { deal } = useDealData();
  const banker = useOptionalBanker();
  const [open, setOpen] = useState(false);

  const authorized = !!banker && !!banker.systemUserId && !banker.writeDisabledReason;
  const writeBlockedReason =
    banker?.writeDisabledReason ??
    'No Dataverse identity is available for your sign-in, so the deal profile is read-only.';

  // "Complete" when any completable profile field is still missing, else "Edit".
  const anyMissing =
    !deal.targetCloseDate ||
    !deal.customerType ||
    !deal.industry ||
    !deal.guarantorStructure ||
    !deal.collateralSummary;
  const label = anyMissing ? 'Complete Deal Profile' : 'Edit Deal Profile';

  if (!authorized) {
    return (
      <div style={styles.readonlyNote} data-deal-profile-readonly={source}>
        {writeBlockedReason}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={compact ? styles.launchCompact : styles.launch}
        data-deal-profile-launch={source}
        aria-label={`${label} for this deal`}
      >
        {label}
      </button>
      {open && <DealProfileEditModal onClose={() => setOpen(false)} />}
    </>
  );
}

function DealProfileEditModal({ onClose }: { onClose: () => void }) {
  const { deal, applyVerifiedDealPatch } = useDealData();
  const banker = useOptionalBanker();

  const initial = useMemo(
    () => ({
      targetCloseDate: dateInputValue(deal.targetCloseDate),
      customerType: deal.customerType ?? '',
      industry: deal.industry ?? '',
      guarantorStructure: deal.guarantorStructure ?? '',
      collateralSummary: deal.collateralSummary ?? '',
    }),
    [deal],
  );
  const [fields, setFields] = useState(initial);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });

  const set = (k: keyof typeof fields, v: string) => setFields((s) => ({ ...s, [k]: v }));

  // Build the patch of ONLY changed fields; '' means clear (→ null).
  const patch = useMemo<DealProfilePatch>(() => {
    const p: DealProfilePatch = {};
    (Object.keys(fields) as Array<keyof typeof fields>).forEach((k) => {
      const next = fields[k].trim();
      const prev = initial[k].trim();
      if (next === prev) return;
      p[k as DealProfileField] = next.length === 0 ? null : next;
    });
    return p;
  }, [fields, initial]);

  const hasChanges = Object.keys(patch).length > 0;
  const saving = save.kind === 'saving';

  async function onSave() {
    if (!hasChanges || !banker?.systemUserId) return;
    setSave({ kind: 'saving' });
    const outcome = await updateDealProfile(
      {
        dealId: deal.id,
        actorEmail: banker.email,
        actorSystemUserId: banker.systemUserId,
        authorized: true,
        patch,
      },
      buildLiveUpdateDealProfileDeps(),
    );
    if (outcome.kind === 'updated') {
      // Merge ONLY the readback-verified fields into the cockpit's deal row.
      applyVerifiedDealPatch?.(outcome.verified as Partial<DealDetail>);
    }
    setSave({ kind: 'done', outcome });
  }

  const titleId = 'deal-profile-edit-title';

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} style={styles.overlay}>
      <div style={styles.card} data-deal-profile-modal>
        <header style={styles.header}>
          <h2 id={titleId} style={styles.title}>Deal Profile</h2>
          <p style={styles.subtitle}>
            Complete the approved deal fields. Verified on save and audited. Amount,
            stage, status, banker, and client are not edited here.
          </p>
        </header>

        {save.kind === 'done' ? (
          <OutcomeBlock outcome={save.outcome} onClose={onClose} />
        ) : (
          <div style={styles.body}>
            <FieldLabel text="Target close date" missing={!deal.targetCloseDate}>
              <input
                type="date"
                value={fields.targetCloseDate}
                onChange={(e) => set('targetCloseDate', e.target.value)}
                disabled={saving}
                style={styles.input}
                data-deal-profile-field="targetCloseDate"
              />
            </FieldLabel>

            {EDITABLE_CHOICE_FIELDS.map(({ field, label, options }) => (
              <FieldLabel key={field} text={label} missing={!deal[field]}>
                <select
                  value={fields[field]}
                  onChange={(e) => set(field, e.target.value)}
                  disabled={saving}
                  style={styles.input}
                  data-deal-profile-field={field}
                >
                  <option value="">— Not set —</option>
                  {options.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </FieldLabel>
            ))}

            <FieldLabel text="Collateral" missing={!deal.collateralSummary}>
              <textarea
                value={fields.collateralSummary}
                onChange={(e) => set('collateralSummary', e.target.value)}
                disabled={saving}
                rows={3}
                style={{ ...styles.input, resize: 'vertical' }}
                data-deal-profile-field="collateralSummary"
              />
            </FieldLabel>

            {/* Reference lookups: honest read-only (no reference list to pick from). */}
            <div style={styles.readonlyGroup} data-deal-profile-readonly-group>
              <div style={styles.readonlyGroupLabel}>Managed via reference data (Maker Portal)</div>
              {READ_ONLY_FIELDS.map(({ field, label }) => (
                <div key={String(field)} style={styles.readonlyRow} data-deal-profile-field-readonly={String(field)}>
                  <span style={styles.readonlyFieldLabel}>{label}</span>
                  <span style={deal[field] ? styles.readonlyValue : styles.readonlyValueMissing}>
                    {(deal[field] as string | undefined) ?? 'Not set'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {save.kind !== 'done' && (
          <footer style={styles.footer}>
            <button type="button" onClick={onClose} disabled={saving} style={styles.secondary} data-deal-profile-cancel>
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!hasChanges || saving}
              style={hasChanges && !saving ? styles.primary : styles.primaryDisabled}
              data-deal-profile-save
            >
              {saving ? 'Saving…' : 'Save Deal Profile'}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

function FieldLabel({ text, missing, children }: { text: string; missing: boolean; children: React.ReactNode }) {
  return (
    <label style={styles.field}>
      <span style={styles.fieldLabel}>
        {text}
        {missing && (
          <span style={styles.missingChip} data-deal-profile-missing>
            Missing
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

function OutcomeBlock({ outcome, onClose }: { outcome: UpdateDealProfileOutcome; onClose: () => void }) {
  const ok = outcome.kind === 'updated';
  const auditPartial = outcome.kind === 'audit-failed';
  return (
    <div
      role={ok ? 'status' : 'alert'}
      style={{ ...styles.outcome, ...(ok ? styles.outcomeOk : styles.outcomeBad) }}
      data-deal-profile-outcome={outcome.kind}
    >
      <div style={styles.outcomeTitle}>{outcomeTitle(outcome)}</div>
      <p style={styles.outcomeDetail}>{outcomeDetail(outcome)}</p>
      <div style={styles.footer}>
        <button type="button" onClick={onClose} style={styles.primary} data-deal-profile-done>
          {ok || auditPartial ? 'Close' : 'Back'}
        </button>
      </div>
    </div>
  );
}

function outcomeTitle(o: UpdateDealProfileOutcome): string {
  switch (o.kind) {
    case 'updated': return 'Deal profile saved';
    case 'audit-failed': return 'Saved, but the audit write failed';
    case 'readback-mismatch': return 'Could not confirm the change';
    case 'unauthorized':
    case 'identity-unresolved': return 'Not saved';
    default: return 'Could not save';
  }
}

function outcomeDetail(o: UpdateDealProfileOutcome): string {
  switch (o.kind) {
    case 'updated':
      return `Updated and verified: ${o.changedLabels.join(', ')}. The cockpit is updated.`;
    case 'audit-failed':
      return 'The deal was updated and read back, but the audit entry could not be written. An operator must reattempt the audit — do not retry the save.';
    case 'readback-mismatch':
      return 'The update did not read back as saved, so nothing is shown as changed. Refresh and try again.';
    case 'unauthorized':
    case 'identity-unresolved':
      return o.reason;
    case 'invalid-input':
      return o.reason;
    case 'empty-patch':
      return o.reason;
    case 'write-failed':
      return `Nothing was changed on the deal. ${o.error}`;
  }
}

const styles: Record<string, CSSProperties> = {
  launch: {
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
    background: palette.primary,
    color: palette.textInverse,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
    fontFamily: typography.family,
  },
  launchCompact: {
    alignSelf: 'flex-start',
    background: 'transparent',
    color: palette.primary,
    border: `1px solid ${palette.primary}`,
    borderRadius: radius.sm,
    padding: `${spacing.xxs} ${spacing.sm}`,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
    fontFamily: typography.family,
  },
  readonlyNote: {
    marginTop: spacing.xs,
    fontSize: typography.size.xs,
    color: palette.textSubtle,
    fontStyle: 'italic',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(20, 26, 42, 0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    zIndex: 100,
    fontFamily: typography.family,
  },
  card: {
    background: palette.surface,
    border: `1px solid ${palette.border}`,
    borderRadius: 8,
    boxShadow: '0 12px 32px rgba(20, 26, 42, 0.18)',
    width: '100%',
    maxWidth: 540,
    maxHeight: '90vh',
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    padding: `${spacing.xl} ${spacing.xl}`,
  },
  header: { display: 'flex', flexDirection: 'column', gap: 4 },
  title: { margin: 0, fontSize: typography.size.xl, fontWeight: typography.weight.semibold, color: palette.text },
  subtitle: { margin: 0, fontSize: typography.size.sm, color: palette.textMuted, lineHeight: typography.lineHeight.snug },
  body: { display: 'flex', flexDirection: 'column', gap: spacing.sm },
  field: { display: 'flex', flexDirection: 'column', gap: 2 },
  fieldLabel: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
  },
  missingChip: {
    fontSize: typography.size.xs,
    color: palette.atRiskFg,
    background: palette.atRiskBg,
    border: `1px solid ${palette.atRisk}`,
    borderRadius: radius.pill,
    padding: `0 ${spacing.xs}`,
    textTransform: 'none',
    letterSpacing: 0,
    fontStyle: 'italic',
  },
  input: {
    padding: `${spacing.xs} ${spacing.sm}`,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    fontSize: typography.size.base,
    fontFamily: typography.family,
    background: palette.surface,
    color: palette.text,
  },
  readonlyGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xxs,
    borderTop: `1px solid ${palette.divider}`,
    paddingTop: spacing.sm,
  },
  readonlyGroupLabel: {
    fontSize: typography.size.xs,
    color: palette.textSubtle,
    fontStyle: 'italic',
  },
  readonlyRow: { display: 'flex', justifyContent: 'space-between', gap: spacing.sm, fontSize: typography.size.sm },
  readonlyFieldLabel: { color: palette.textSubtle },
  readonlyValue: { color: palette.text, fontWeight: typography.weight.semibold },
  readonlyValueMissing: { color: palette.textSubtle, fontStyle: 'italic' },
  footer: { display: 'flex', gap: spacing.sm, justifyContent: 'flex-end', paddingTop: spacing.sm, borderTop: `1px solid ${palette.divider}` },
  primary: {
    background: palette.primary,
    color: palette.textInverse,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
    fontFamily: typography.family,
  },
  primaryDisabled: {
    background: palette.borderStrong,
    color: palette.textInverse,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    cursor: 'not-allowed',
    fontFamily: typography.family,
  },
  secondary: {
    background: palette.surface,
    color: palette.text,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    cursor: 'pointer',
    fontFamily: typography.family,
  },
  outcome: { border: '1px solid', borderRadius: radius.sm, padding: spacing.md, display: 'flex', flexDirection: 'column', gap: spacing.xs },
  outcomeOk: { background: palette.clearBg, borderColor: palette.clear },
  outcomeBad: { background: palette.atRiskBg, borderColor: palette.atRisk },
  outcomeTitle: { fontSize: typography.size.lg, fontWeight: typography.weight.semibold, color: palette.text },
  outcomeDetail: { margin: 0, fontSize: typography.size.md, color: palette.text, lineHeight: typography.lineHeight.snug },
};
