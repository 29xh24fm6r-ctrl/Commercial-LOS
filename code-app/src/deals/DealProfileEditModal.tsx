import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useDialogDismissal } from '../shared/ui/useDialogDismissal';
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
  type DealReferencePatch,
  type UpdateDealProfileOutcome,
} from './write/updateDealProfile';
import { buildLiveUpdateDealProfileDeps } from './write/buildLiveUpdateDealProfileDeps';
import {
  loadLiveDealReferenceOptionsByCategory,
  DEAL_REFERENCE_LOOKUPS,
  type DealReferenceLookupField,
  type DealReferenceOption,
  type DealReferenceOptionsResult,
  type DealReferenceOptionsByCategory,
} from './write/dealReferenceOptions';
import {
  loadLiveDealIndustryProjection,
  type DealIndustryProjection,
} from '../crm/dealIndustryProjection';
import { buildCrmIndustryProjectionRecord, serializeCrmIndustryProjectionRecord } from './crmIndustryProjectionRecord';

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

/** The three reference-lookup fields, backed by the real registered list. */
const REFERENCE_FIELDS: readonly DealReferenceLookupField[] = ['productType', 'loanStructure', 'pricingType'];
/** Sentinel select value that clears an existing reference lookup. */
const CLEAR_VALUE = '__clear__';

/** Whole-modal load state: loading, or the per-category results. */
type RefLoadState = { kind: 'loading' } | { kind: 'ready'; byCategory: DealReferenceOptionsByCategory };
/** One field's state passed to ReferenceField: loading, or its category result. */
type FieldRefState = { kind: 'loading' } | DealReferenceOptionsResult;

function ciEquals(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

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
    deal.amount == null ||
    !deal.targetCloseDate ||
    !deal.customerType ||
    !deal.industry ||
    !deal.guarantorStructure ||
    !deal.collateralSummary ||
    !deal.productType ||
    !deal.loanStructure ||
    !deal.pricingType;
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
      amount: deal.amount != null ? String(deal.amount) : '',
      targetCloseDate: dateInputValue(deal.targetCloseDate),
      customerType: deal.customerType ?? '',
      industry: deal.industry ?? '',
      guarantorStructure: deal.guarantorStructure ?? '',
      collateralSummary: deal.collateralSummary ?? '',
      loanPurpose: deal.loanPurpose ?? '',
      loanTermMonths: deal.loanTermMonths != null ? String(deal.loanTermMonths) : '',
      ownershipStructure: deal.ownershipStructure ?? '',
    }),
    [deal],
  );
  const [fields, setFields] = useState(initial);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  // Reference lookups load from the real registered list, split by category so
  // each field shows only its own values. `refSel` holds the banker's per-field
  // selection (option id, or CLEAR_VALUE, or '' = keep current).
  const [refState, setRefState] = useState<RefLoadState>({ kind: 'loading' });
  const [refSel, setRefSel] = useState<Partial<Record<DealReferenceLookupField, string>>>({});

  useEffect(() => {
    let alive = true;
    loadLiveDealReferenceOptionsByCategory()
      .then((byCategory) => alive && setRefState({ kind: 'ready', byCategory }))
      .catch(() => {
        // The loader is fail-closed and never rejects; this is belt-and-braces.
        if (alive) setRefState({ kind: 'loading' });
      });
    return () => {
      alive = false;
    };
  }, []);

  // CRM/NAICS industry projection (Phase 4B): derived from the linked client's
  // organization NAICS. Drives the Industry field's source / conflict banners and
  // the governed "Apply CRM/NAICS industry" action. Fail-closed: any missing hop
  // is an honest state and Industry stays banker-editable.
  const [industryProj, setIndustryProj] = useState<{ kind: 'loading' } | DealIndustryProjection>({ kind: 'loading' });
  const [applyState, setApplyState] = useState<{ kind: 'idle' } | { kind: 'applying' } | { kind: 'error'; reason: string }>({ kind: 'idle' });

  useEffect(() => {
    let alive = true;
    loadLiveDealIndustryProjection(deal.clientId)
      .then((p) => alive && setIndustryProj(p))
      .catch(() => {
        if (alive) setIndustryProj({ kind: 'unavailable', reason: 'projection load failed' });
      });
    return () => {
      alive = false;
    };
  }, [deal.clientId]);

  const set = (k: keyof typeof fields, v: string) => setFields((s) => ({ ...s, [k]: v }));
  const setRef = (f: DealReferenceLookupField, v: string) => setRefSel((s) => ({ ...s, [f]: v }));

  // Explicit, governed apply of the CRM/NAICS-derived industry (reuses
  // updateDealProfile: validate → write → readback → audit). Writes only on this
  // deliberate action; on success the verified value merges into the cockpit.
  async function onApplyCrmIndustry(industryLabel: string) {
    if (!banker?.systemUserId || applyState.kind === 'applying') return;
    setApplyState({ kind: 'applying' });
    // N-22/N-23 remediation (Production Remediation Factory Arc Phase 7) — persist the durable
    // exact NAICS/sector/provenance facts in the SAME governed write as the coarse label, so this
    // surface's apply action carries the same durable record CrmRelationshipPanel's does.
    const projectionRecord =
      industryProj.kind !== 'loading' ? buildCrmIndustryProjectionRecord(industryProj, 'crm-derived', new Date().toISOString()) : undefined;
    const outcome = await updateDealProfile(
      {
        dealId: deal.id,
        actorEmail: banker.email,
        actorSystemUserId: banker.systemUserId,
        authorized: true,
        patch: {
          industry: industryLabel,
          ...(projectionRecord ? { crmIndustryProjectionInputs: serializeCrmIndustryProjectionRecord(projectionRecord) } : {}),
        },
      },
      buildLiveUpdateDealProfileDeps(),
    );
    if (outcome.kind === 'updated') {
      // crmIndustryProjectionInputs (the write-path field key) is translated to
      // crmIndustryProjectionJson (the DealDetail read-path key) so the merged patch actually
      // updates the field the rest of the cockpit reads.
      const { crmIndustryProjectionInputs, ...rest } = outcome.verified;
      applyVerifiedDealPatch?.({
        ...(rest as Partial<DealDetail>),
        ...(crmIndustryProjectionInputs !== undefined ? { crmIndustryProjectionJson: crmIndustryProjectionInputs } : {}),
      });
      set('industry', industryLabel);
      setApplyState({ kind: 'idle' });
    } else {
      const reason =
        'reason' in outcome && typeof outcome.reason === 'string'
          ? outcome.reason
          : 'error' in outcome && typeof outcome.error === 'string'
            ? outcome.error
            : 'The CRM/NAICS industry could not be applied. Nothing was changed.';
      setApplyState({ kind: 'error', reason });
    }
  }

  // One combined id→option map across all categories (for validating selections
  // and for the readback allow-list). Categories are enforced by the per-field
  // dropdowns, so a value can only be picked from its own category's list.
  const refOptionById = useMemo(() => {
    const m = new Map<string, DealReferenceOption>();
    if (refState.kind === 'ready') {
      for (const f of REFERENCE_FIELDS) {
        const r = refState.byCategory[f];
        if (r.kind === 'ready') for (const o of r.options) m.set(o.id, o);
      }
    }
    return m;
  }, [refState]);
  const allowedReferenceIds = useMemo(() => Array.from(refOptionById.keys()), [refOptionById]);

  // Build the scalar patch of ONLY changed fields; '' means clear (→ null).
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

  // Build the reference patch from active selections (only when options loaded).
  const referencePatch = useMemo<DealReferencePatch>(() => {
    const p: DealReferencePatch = {};
    for (const f of REFERENCE_FIELDS) {
      const sel = refSel[f];
      if (sel === undefined || sel === '') continue; // keep current
      if (sel === CLEAR_VALUE) {
        p[f] = null;
      } else {
        const opt = refOptionById.get(sel);
        if (opt) p[f] = { id: opt.id, name: opt.name };
      }
    }
    return p;
  }, [refSel, refOptionById]);

  const hasChanges = Object.keys(patch).length > 0 || Object.keys(referencePatch).length > 0;
  const saving = save.kind === 'saving';

  // D20 / Workstream 3C (final-seven-workstreams) — Escape closes the modal (never while a save is
  // in flight), plus a focus trap and focus-return while open. Click-outside-to-dismiss stays OFF
  // — this form edits real deal-profile fields and an accidental outside click discarding pending
  // edits would be worse than requiring Escape or the Close button.
  const dialogRef = useDialogDismissal<HTMLDivElement>({
    onClose,
    disabled: saving,
    closeOnOutsideClick: false,
  });

  async function onSave() {
    // P2-14 — duplicate-submit guard: ignore re-entry while a save is in flight.
    if (!hasChanges || !banker?.systemUserId || saving) return;
    setSave({ kind: 'saving' });
    try {
      const outcome = await updateDealProfile(
        {
          dealId: deal.id,
          actorEmail: banker.email,
          actorSystemUserId: banker.systemUserId,
          authorized: true,
          patch,
          referencePatch,
          allowedReferenceIds,
        },
        buildLiveUpdateDealProfileDeps(),
      );
      if (outcome.kind === 'updated') {
        // Merge ONLY the readback-verified fields into the cockpit's deal row.
        applyVerifiedDealPatch?.(outcome.verified as Partial<DealDetail>);
      }
      setSave({ kind: 'done', outcome });
    } catch (err: unknown) {
      // P2-14 — never leave the modal stuck at 'saving' if the governed write (or its dep
      // construction) throws. Recover into the outcome block so the pending state clears and the
      // banker can act (Back to edit, or Close). Surfaced as the honest write-failed outcome.
      const message = err instanceof Error ? err.message : String(err);
      setSave({ kind: 'done', outcome: { kind: 'write-failed', error: message, correlationId: '' } });
    }
  }

  const titleId = 'deal-profile-edit-title';

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} style={styles.overlay}>
      <div style={styles.card} data-deal-profile-modal ref={dialogRef}>
        <header style={styles.header}>
          <h2 id={titleId} style={styles.title}>Deal Profile</h2>
          <p style={styles.subtitle}>
            Complete the approved deal fields. Verified on save and audited. Stage, status,
            banker, and client are set through their own governed flows, not here.
          </p>
        </header>

        {save.kind === 'done' ? (
          <OutcomeBlock outcome={save.outcome} onClose={onClose} />
        ) : (
          <div style={styles.body}>
            <FieldLabel text="Loan amount" missing={deal.amount == null}>
              <input
                type="text"
                inputMode="decimal"
                value={fields.amount}
                onChange={(e) => set('amount', e.target.value)}
                disabled={saving}
                style={styles.input}
                placeholder="e.g. 2,500,000"
                aria-describedby="deal-profile-amount-help"
                data-deal-profile-field="amount"
              />
              <span id="deal-profile-amount-help" style={styles.readonlyReason}>
                The approved loan amount. Required to move the deal out of Intake — verified on save
                and recorded in the audit trail.
              </span>
            </FieldLabel>

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

            {EDITABLE_CHOICE_FIELDS.map(({ field, label, options }) =>
              field === 'industry' ? (
                <IndustryField
                  key={field}
                  label={label}
                  options={options}
                  value={fields.industry}
                  onChange={(v) => set('industry', v)}
                  missing={!deal.industry}
                  disabled={saving}
                  projection={industryProj}
                  applyState={applyState}
                  onApply={onApplyCrmIndustry}
                />
              ) : (
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
              ),
            )}

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

            <FieldLabel text="Loan Purpose" missing={!deal.loanPurpose}>
              <input
                type="text"
                value={fields.loanPurpose}
                onChange={(e) => set('loanPurpose', e.target.value)}
                disabled={saving}
                maxLength={200}
                style={styles.input}
                placeholder="e.g. Acquisition of commercial property"
                data-deal-profile-field="loanPurpose"
              />
            </FieldLabel>

            <FieldLabel text="Loan Term (months)" missing={!deal.loanTermMonths}>
              <input
                type="text"
                inputMode="numeric"
                value={fields.loanTermMonths}
                onChange={(e) => set('loanTermMonths', e.target.value)}
                disabled={saving}
                style={styles.input}
                placeholder="e.g. 60"
                data-deal-profile-field="loanTermMonths"
              />
            </FieldLabel>

            <FieldLabel text="Ownership Structure" missing={!deal.ownershipStructure}>
              <input
                type="text"
                value={fields.ownershipStructure}
                onChange={(e) => set('ownershipStructure', e.target.value)}
                disabled={saving}
                maxLength={100}
                style={styles.input}
                placeholder="e.g. LLC, S-Corp, Sole Proprietorship"
                data-deal-profile-field="ownershipStructure"
              />
            </FieldLabel>

            {/* Reference lookups — each field shows only its own category's
                active values, editable ONLY when that category's list loads. */}
            <div style={styles.readonlyGroup} data-deal-profile-reference-group>
              {REFERENCE_FIELDS.map((field) => (
                <ReferenceField
                  key={field}
                  field={field}
                  currentName={deal[field] as string | undefined}
                  fieldState={refState.kind === 'loading' ? { kind: 'loading' } : refState.byCategory[field]}
                  value={refSel[field] ?? ''}
                  onChange={(v) => setRef(field, v)}
                  disabled={saving}
                />
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

/**
 * One reference-lookup field. Renders a real dropdown ONLY when that field's
 * CATEGORY list loaded with active options; otherwise stays read-only and shows
 * the exact reason (loading / empty / unavailable). Never hard-codes values.
 *
 * Honest inactive handling: if the deal already carries a value that is NOT among
 * the field's active options, it is shown with an "inactive" warning — it is kept
 * as-is unless the banker deliberately changes it, and is not offered for new
 * selections elsewhere.
 */
function ReferenceField({
  field,
  currentName,
  fieldState,
  value,
  onChange,
  disabled,
}: {
  field: DealReferenceLookupField;
  currentName: string | undefined;
  fieldState: FieldRefState;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const label = DEAL_REFERENCE_LOOKUPS[field].label;

  if (fieldState.kind === 'ready') {
    const currentIsInactive =
      !!currentName && !fieldState.options.some((o) => ciEquals(o.name, currentName));
    return (
      <FieldLabel text={label} missing={!currentName}>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          style={styles.input}
          data-deal-profile-field={field}
        >
          <option value="">
            {currentName
              ? `— Keep current: ${currentName}${currentIsInactive ? ' (inactive)' : ''} —`
              : '— Not set —'}
          </option>
          {currentName ? <option value={CLEAR_VALUE}>— Clear —</option> : null}
          {fieldState.options.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        {currentIsInactive && (
          <span style={styles.readonlyReason} data-deal-profile-reference-inactive={field}>
            This value is inactive and is no longer offered for new deals. It stays until you change it.
          </span>
        )}
      </FieldLabel>
    );
  }

  // Read-only: loading / empty / unavailable — show the exact reason.
  const reason =
    fieldState.kind === 'loading'
      ? 'Loading reference options…'
      : fieldState.reason;
  return (
    <div style={styles.readonlyRow} data-deal-profile-field-readonly={field}>
      <span style={styles.readonlyFieldLabel}>{label}</span>
      <span style={currentName ? styles.readonlyValue : styles.readonlyValueMissing}>
        {currentName ?? 'Not set'}
      </span>
      <span style={styles.readonlyReason} data-deal-profile-reference-reason={field}>
        {reason}
      </span>
    </div>
  );
}

/**
 * The Industry field + its CRM/NAICS projection. Industry should be consistent
 * with the linked CRM client's NAICS classification, not hand-entered
 * independently. When a mapped industry is derivable we show its source, warn on
 * conflict, and offer a governed "Apply CRM/NAICS industry" action. When CRM has
 * NAICS but no mapped industry we say so honestly; otherwise Industry is a plain
 * governed dropdown. We never fabricate or auto-write an industry.
 */
function IndustryField({
  label,
  options,
  value,
  onChange,
  missing,
  disabled,
  projection,
  applyState,
  onApply,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  missing: boolean;
  disabled: boolean;
  projection: { kind: 'loading' } | DealIndustryProjection;
  applyState: { kind: 'idle' } | { kind: 'applying' } | { kind: 'error'; reason: string };
  onApply: (industryLabel: string) => void;
}) {
  const current = value.trim();
  const derived = projection.kind === 'derived' ? projection : null;
  const applying = applyState.kind === 'applying';

  const applyButton = derived ? (
    <button
      type="button"
      onClick={() => onApply(derived.dealIndustry)}
      disabled={disabled || applying}
      style={applying ? styles.industryApplyBtnDisabled : styles.industryApplyBtn}
      data-deal-industry-apply
    >
      {applying ? 'Applying…' : 'Apply CRM/NAICS industry'}
    </button>
  ) : null;

  let banner: React.ReactNode = null;
  if (derived) {
    const exactClassification = derived.naicsTitle?.trim() || derived.sectorTitle;
    const source = `NAICS ${derived.naicsCode} · ${exactClassification} · ${derived.sectorTitle}`;
    if (current === derived.dealIndustry) {
      banner = (
        <div style={styles.industrySource} data-deal-industry-source="crm-naics">
          CRM classification: <strong>{exactClassification}</strong> ({source}).
          {' '}Deal reporting category: <strong>{derived.dealIndustry}</strong>.
        </div>
      );
    } else if (current.length === 0) {
      banner = (
        <div style={styles.industrySuggest} data-deal-industry-suggest>
          <span>
            CRM classification: <strong>{exactClassification}</strong> ({source}).
            {' '}Suggested deal reporting category: <strong>{derived.dealIndustry}</strong>.
          </span>
          {applyButton}
        </div>
      );
    } else {
      banner = (
        <div style={styles.industryConflict} role="alert" data-deal-industry-conflict>
          <span>
            CRM classification is <strong>{exactClassification}</strong> ({source}); its reporting
            category is <strong>{derived.dealIndustry}</strong>, while the deal says <strong>{current}</strong>.
            Reconcile before proceeding.
          </span>
          {applyButton}
        </div>
      );
    }
  } else if (projection.kind === 'no-mapping') {
    banner = (
      <div style={styles.industryNote} data-deal-industry-nomapping>
        CRM NAICS {projection.naicsCode} ({projection.sectorTitle}) found, but no mapped deal industry
        option exists. Set Industry manually.
      </div>
    );
  } else if (projection.kind === 'no-sector') {
    banner = (
      <div style={styles.industryNote} data-deal-industry-note="no-sector">
        CRM NAICS {projection.naicsCode} is not a recognized sector. Set Industry manually.
      </div>
    );
  }

  return (
    <FieldLabel text={label} missing={missing}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={styles.input}
        data-deal-profile-field="industry"
      >
        <option value="">— Not set —</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      {banner}
      {applyState.kind === 'error' && (
        <span style={styles.industryError} data-deal-industry-apply-error>{applyState.reason}</span>
      )}
    </FieldLabel>
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
  readonlyRow: { display: 'flex', flexDirection: 'column', gap: 2, fontSize: typography.size.sm },
  readonlyFieldLabel: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  readonlyValue: { color: palette.text, fontWeight: typography.weight.semibold },
  readonlyValueMissing: { color: palette.textSubtle, fontStyle: 'italic' },
  readonlyReason: { fontSize: typography.size.xs, color: palette.textSubtle, fontStyle: 'italic' },
  industrySource: {
    marginTop: spacing.xxs,
    fontSize: typography.size.xs,
    color: palette.clear,
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
  },
  industrySuggest: {
    marginTop: spacing.xxs,
    fontSize: typography.size.xs,
    color: palette.text,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  industryConflict: {
    marginTop: spacing.xxs,
    fontSize: typography.size.xs,
    color: palette.atRiskFg,
    background: palette.atRiskBg,
    border: `1px solid ${palette.atRisk}`,
    borderRadius: radius.sm,
    padding: spacing.xs,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  industryNote: { marginTop: spacing.xxs, fontSize: typography.size.xs, color: palette.textSubtle, fontStyle: 'italic' },
  industryError: { marginTop: spacing.xxs, fontSize: typography.size.xs, color: palette.atRiskFg },
  industryApplyBtn: {
    background: palette.primary,
    color: palette.textInverse,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xxs} ${spacing.sm}`,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
    fontFamily: typography.family,
    whiteSpace: 'nowrap',
  },
  industryApplyBtnDisabled: {
    background: palette.borderStrong,
    color: palette.textInverse,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xxs} ${spacing.sm}`,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    cursor: 'not-allowed',
    fontFamily: typography.family,
    whiteSpace: 'nowrap',
  },
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
