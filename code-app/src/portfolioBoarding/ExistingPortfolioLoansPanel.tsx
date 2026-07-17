import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Badge } from '../shared/Badge';
import { palette, radius, shadow, spacing, typography } from '../shared/theme';
import { loadBoardedLoans, getExtendedColumnProvisioning, type BoardedLoanRow } from './boardedLoansList';
import { loadPortfolioManagerOptions, type PortfolioManagerOption } from './portfolioManagerOptions';
import { PortfolioImportWizard } from './PortfolioImportWizard';
import { formatCurrency } from '../shared/formatters';
import { LOAN_PRODUCTS, INTEREST_RATE_TYPES, RATE_INDEX_OPTIONS } from './loanProducts';
import { EXTENDED_LOAN_ATTRIBUTES_PERSISTENCE_ENABLED } from './extendedLoanAttributes';
import { PAYMENT_61_PRESET, isVariableRate } from '../portfolio/variableRate/variableRateModel';
import {
  boardExistingLoan,
  buildLiveExistingLoanDeps,
  EXISTING_LOAN_CHILD_KEYS,
  type BoardExistingLoanOutcome,
  type ExistingLoanChildKey,
  type ExistingLoanInput,
} from './existingLoanEntryAdapter';
import { loadBoardedLoanRecordCounts, type BoardedLoanChildCounts } from './loadBoardedLoanRecordCounts';
import {
  deriveBoardedLoanRecordCompleteness,
  type PortfolioBoardedLoanRecordCompleteness,
} from './portfolioBoardedLoanRecordCompleteness';

/**
 * Phase 259 — Existing Portfolio Loans panel.
 *
 * Lists boarded portfolio loans and provides a governed "Add Existing Loan"
 * form to manually board a loan already in the bank's portfolio (not
 * originated through the LOS). On board: readback-verified, audited, and the
 * new loan opens in a detail drawer and appears in the list. Fail-closed.
 */

interface Identity {
  readonly actorEmail: string | undefined;
  readonly actorSystemUserId: string | undefined;
  readonly writeDisabledReason: string | undefined;
}

interface Props extends Identity {
  /** Injected for tests; defaults to the live read. */
  loadLoans?: () => Promise<readonly BoardedLoanRow[]>;
  /** Injected for tests; defaults to the live governed board. */
  boardLoan?: (input: ExistingLoanInput) => Promise<BoardExistingLoanOutcome>;
  /** PM-1 — assignable portfolio managers; injected for tests, defaults to the live systemuser read. */
  loadManagers?: () => Promise<readonly PortfolioManagerOption[]>;
  /** Factory Arc Phase 9 — per-loan child-record counts for the detail drawer; injected for tests, defaults to the live read. */
  loadRecordCounts?: (loanId: string) => Promise<BoardedLoanChildCounts>;
}

/** PM-1 — load state for the portfolio-manager picker (honest failure; no fabrication). */
type ManagerOptionsState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; options: readonly PortfolioManagerOption[] }
  | { kind: 'failed'; message: string };

type ListState =
  | { kind: 'loading' }
  | { kind: 'ready'; rows: readonly BoardedLoanRow[] }
  | { kind: 'failed'; message: string };

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'done'; outcome: BoardExistingLoanOutcome };

const TEXT_FIELDS: ReadonlyArray<{ key: keyof FormFields; label: string; required?: boolean; type?: 'number' | 'date' }> = [
  { key: 'loanNumber', label: 'Loan number', required: true },
  { key: 'borrowerLegalName', label: 'Borrower legal name', required: true },
  { key: 'borrowerDba', label: 'Borrower DBA' },
  { key: 'relationshipName', label: 'Relationship name' },
  { key: 'loanStatus', label: 'Current loan status' },
  { key: 'legacySystemId', label: 'Legacy / core system loan ID' },
  { key: 'originalCommitmentAmount', label: 'Original commitment amount', type: 'number' },
  { key: 'currentOutstandingPrincipal', label: 'Current outstanding principal', type: 'number' },
  { key: 'availableBalance', label: 'Available balance', type: 'number' },
  { key: 'paymentFrequency', label: 'Payment frequency' },
  { key: 'amortizationMonths', label: 'Amortization (months)', type: 'number' },
  { key: 'termMonths', label: 'Term (months)', type: 'number' },
  { key: 'bookingDate', label: 'Booking date', type: 'date' },
  { key: 'maturityDate', label: 'Maturity date', type: 'date' },
  { key: 'currentRiskRating', label: 'Current risk rating' },
  { key: 'nextReviewDate', label: 'Next review date', type: 'date' },
  { key: 'accrualStatus', label: 'Accrual status' },
  { key: 'pastDueDays', label: 'Past due days', type: 'number' },
];

/**
 * Phase 262 — ownership / product context fields.
 * PM-1: "Assigned portfolio manager" is no longer a free-text field here — it is
 * a real systemuser lookup rendered as a dedicated picker (see the manager
 * <select> below) and bound through cr664_PortfolioManager@odata.bind.
 */
const OWNERSHIP_FIELDS: ReadonlyArray<{ key: keyof FormFields; label: string }> = [
  { key: 'loanPurpose', label: 'Loan purpose' },
  { key: 'branchNumber', label: 'Branch number' },
  { key: 'assignedLoanOfficer', label: 'Assigned loan officer' },
];

/** Phase 262 — pricing / rate-term fields. `variableOnly` ones disable for Fixed. */
const RATE_FIELDS: ReadonlyArray<{ key: keyof FormFields; label: string; type?: 'number' | 'date'; variableOnly?: boolean }> = [
  { key: 'spread', label: 'Spread / margin', type: 'number', variableOnly: true },
  { key: 'currentNoteRate', label: 'Current note rate', type: 'number' },
  { key: 'floor', label: 'Floor rate', type: 'number' },
  { key: 'ceiling', label: 'Ceiling rate', type: 'number' },
  { key: 'firstResetDate', label: 'First reset date', type: 'date' },
  { key: 'firstResetPaymentNumber', label: 'First reset payment #', type: 'number' },
  { key: 'resetFrequency', label: 'Reset frequency' },
  { key: 'nextRateChangeDate', label: 'Next rate change date', type: 'date' },
];

interface FormFields {
  loanNumber: string;
  borrowerLegalName: string;
  borrowerDba: string;
  relationshipName: string;
  loanStatus: string;
  legacySystemId: string;
  originalCommitmentAmount: string;
  currentOutstandingPrincipal: string;
  availableBalance: string;
  interestRateType: string;
  paymentFrequency: string;
  amortizationMonths: string;
  termMonths: string;
  bookingDate: string;
  maturityDate: string;
  currentRiskRating: string;
  nextReviewDate: string;
  accrualStatus: string;
  pastDueDays: string;
  // Phase 262 — product + pricing/rate terms + ownership.
  loanProduct: string;
  loanPurpose: string;
  branchNumber: string;
  assignedLoanOfficer: string;
  /** PM-1 — selected portfolio-manager systemuserid (bound as a lookup, not free text). */
  portfolioManagerId: string;
  index: string;
  spread: string;
  floor: string;
  ceiling: string;
  currentNoteRate: string;
  firstResetDate: string;
  firstResetPaymentNumber: string;
  resetFrequency: string;
  nextRateChangeDate: string;
}

const CHILD_LABELS: Readonly<Record<ExistingLoanChildKey, string>> = {
  borrowers: 'Borrowers',
  collateral: 'Collateral',
  guarantors: 'Guarantors',
  covenants: 'Covenants',
  ticklers: 'Ticklers',
  insurance: 'Insurance',
  documents: 'Documents',
  exceptions: 'Exceptions',
  reviews: 'Reviews',
  examinerNotes: 'Examiner notes',
};

function emptyForm(): FormFields {
  return {
    loanNumber: '', borrowerLegalName: '', borrowerDba: '', relationshipName: '', loanStatus: '',
    legacySystemId: '', originalCommitmentAmount: '', currentOutstandingPrincipal: '', availableBalance: '',
    interestRateType: '', paymentFrequency: '', amortizationMonths: '', termMonths: '', bookingDate: '',
    maturityDate: '', currentRiskRating: '', nextReviewDate: '', accrualStatus: '', pastDueDays: '',
    loanProduct: '', loanPurpose: '', branchNumber: '', assignedLoanOfficer: '', portfolioManagerId: '',
    index: '', spread: '', floor: '', ceiling: '', currentNoteRate: '', firstResetDate: '',
    firstResetPaymentNumber: '', resetFrequency: '', nextRateChangeDate: '',
  };
}

function numOrUndef(v: string): number | undefined {
  const t = v.trim();
  if (t.length === 0) return undefined;
  const n = Number(t);
  return Number.isNaN(n) ? undefined : n;
}

export function ExistingPortfolioLoansPanel({
  actorEmail,
  actorSystemUserId,
  writeDisabledReason,
  loadLoans = loadBoardedLoans,
  boardLoan = (input) => boardExistingLoan(input, buildLiveExistingLoanDeps()),
  loadManagers = loadPortfolioManagerOptions,
  loadRecordCounts = loadBoardedLoanRecordCounts,
}: Props) {
  const authorized = !writeDisabledReason && Boolean(actorSystemUserId);
  const [list, setList] = useState<ListState>({ kind: 'loading' });
  const [managerOptions, setManagerOptions] = useState<ManagerOptionsState>({ kind: 'idle' });
  // One load per form-open; reset when the form closes so a reopen can retry.
  const managersRequestedRef = useRef(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormFields>(emptyForm);
  const [children, setChildren] = useState<Record<ExistingLoanChildKey, string[]>>(() =>
    Object.fromEntries(EXISTING_LOAN_CHILD_KEYS.map((k) => [k, []])) as unknown as Record<ExistingLoanChildKey, string[]>,
  );
  const [submit, setSubmit] = useState<SubmitState>({ kind: 'idle' });
  const [payment61, setPayment61] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [selected, setSelected] = useState<BoardedLoanRow | undefined>(undefined);
  const [reloadKey, setReloadKey] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [extendedUnprovisioned, setExtendedUnprovisioned] = useState(false);

  const existingLoanNumbers = useMemo(
    () => (list.kind === 'ready' ? list.rows.map((r) => r.loanNumber).filter((n): n is string => Boolean(n)) : []),
    [list],
  );

  useEffect(() => {
    let cancelled = false;
    setList({ kind: 'loading' });
    loadLoans()
      .then((rows) => {
        if (cancelled) return;
        setList({ kind: 'ready', rows });
        setExtendedUnprovisioned(getExtendedColumnProvisioning() === 'absent');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setList({ kind: 'failed', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [loadLoans, reloadKey]);

  // PM-1 — load the assignable portfolio managers when the form first opens (and
  // the operator is authorized to board). Loaded lazily so a read-only viewer
  // never triggers the systemuser read. Fails closed: on error the picker shows
  // an honest note and boarding proceeds without a manager (no fabrication).
  useEffect(() => {
    if (!formOpen || !authorized || managersRequestedRef.current) return;
    // Load exactly once per open (the ref guard survives the loading→ready
    // re-render, so the in-flight load is never self-cancelled). `kind` is
    // deliberately NOT a dependency for that reason.
    managersRequestedRef.current = true;
    let cancelled = false;
    setManagerOptions({ kind: 'loading' });
    loadManagers()
      .then((options) => {
        if (!cancelled) setManagerOptions({ kind: 'ready', options });
      })
      .catch((err: unknown) => {
        if (!cancelled) setManagerOptions({ kind: 'failed', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [formOpen, authorized, loadManagers]);

  const canSubmit = useMemo(
    () => authorized && form.loanNumber.trim().length > 0 && form.borrowerLegalName.trim().length > 0 && submit.kind !== 'saving',
    [authorized, form.loanNumber, form.borrowerLegalName, submit.kind],
  );

  function buildInput(): ExistingLoanInput {
    return {
      loanNumber: form.loanNumber,
      borrowerLegalName: form.borrowerLegalName,
      borrowerDba: form.borrowerDba || undefined,
      relationshipName: form.relationshipName || undefined,
      loanStatus: form.loanStatus || undefined,
      legacySystemId: form.legacySystemId || undefined,
      originalCommitmentAmount: numOrUndef(form.originalCommitmentAmount),
      currentOutstandingPrincipal: numOrUndef(form.currentOutstandingPrincipal),
      availableBalance: numOrUndef(form.availableBalance),
      interestRateType: form.interestRateType || undefined,
      index: form.index || undefined,
      spread: numOrUndef(form.spread),
      floor: numOrUndef(form.floor),
      ceiling: numOrUndef(form.ceiling),
      paymentFrequency: form.paymentFrequency || undefined,
      amortizationMonths: numOrUndef(form.amortizationMonths),
      termMonths: numOrUndef(form.termMonths),
      bookingDate: form.bookingDate || undefined,
      maturityDate: form.maturityDate || undefined,
      currentRiskRating: form.currentRiskRating || undefined,
      nextReviewDate: form.nextReviewDate || undefined,
      accrualStatus: form.accrualStatus || undefined,
      pastDueDays: numOrUndef(form.pastDueDays),
      // Phase 2 — extended attributes (persist via cr664_extendedloanattributes when enabled).
      product: form.loanProduct || undefined,
      loanOfficer: form.assignedLoanOfficer || undefined,
      branch: form.branchNumber || undefined,
      purpose: form.loanPurpose || undefined,
      // PM-1 — portfolio manager as a real systemuser lookup bind (not free text).
      portfolioManagerId: form.portfolioManagerId || undefined,
      currentNoteRate: numOrUndef(form.currentNoteRate),
      firstResetDate: form.firstResetDate || undefined,
      firstResetPaymentNumber: numOrUndef(form.firstResetPaymentNumber),
      resetFrequency: form.resetFrequency || undefined,
      nextRateChangeDate: form.nextRateChangeDate || undefined,
      payment61Reset: payment61 || undefined,
      ...Object.fromEntries(
        EXISTING_LOAN_CHILD_KEYS.map((k) => [k, children[k].filter((n) => n.trim().length > 0).map((name) => ({ name }))]),
      ),
      actorEmail,
      actorSystemUserId,
      authorized,
    };
  }

  const variable = isVariableRate(form.interestRateType);

  function applyPayment61Preset() {
    setForm((s) => ({
      ...s,
      termMonths: String(PAYMENT_61_PRESET.termMonths),
      firstResetPaymentNumber: String(PAYMENT_61_PRESET.firstResetPaymentNumber),
      resetFrequency: s.resetFrequency || 'Every 60 months (5-year reset)',
    }));
    setPayment61(true);
  }

  async function onBoard() {
    if (!canSubmit) return;
    setSubmit({ kind: 'saving' });
    const outcome = await boardLoan(buildInput());
    setSubmit({ kind: 'done', outcome });
    if (outcome.kind === 'success') {
      // New loan appears in the list; open its detail drawer.
      setReloadKey((n) => n + 1);
      setSelected({
        id: outcome.loanId,
        loanNumber: outcome.loanNumber,
        borrower: form.borrowerLegalName.trim(),
        status: form.loanStatus.trim() || undefined,
        outstanding: numOrUndef(form.currentOutstandingPrincipal),
        riskRating: form.currentRiskRating.trim() || undefined,
        maturityDate: form.maturityDate.trim() || undefined,
        watchlist: false,
        manuallyBoarded: true,
        boardingSource: 'Manual Existing Loan Entry',
      });
      setFormOpen(false);
      setForm(emptyForm());
      setPayment61(false);
      setChildren(Object.fromEntries(EXISTING_LOAN_CHILD_KEYS.map((k) => [k, []])) as unknown as Record<ExistingLoanChildKey, string[]>);
    }
  }

  return (
    <section style={styles.wrap} aria-label="Existing Portfolio Loans" data-existing-portfolio="panel">
      <header style={styles.head}>
        <div style={styles.headRow}>
          <h2 style={styles.title}>Existing Portfolio Loans</h2>
          <div style={styles.headActions}>
            <button
              type="button"
              style={authorized ? styles.uploadBtn : styles.addBtnDisabled}
              disabled={!authorized}
              data-existing-portfolio-upload
              onClick={() => setImportOpen((v) => !v)}
            >
              {importOpen ? 'Close upload' : '↥ Upload Existing Portfolio'}
            </button>
            <button
              type="button"
              style={authorized ? styles.addBtn : styles.addBtnDisabled}
              disabled={!authorized}
              data-existing-loan-add
              onClick={() => {
                const opening = !formOpen;
                setFormOpen(opening);
                setSubmit({ kind: 'idle' });
                setDraftSaved(false);
                // On close, reset the manager picker so reopening reloads it
                // (retries a prior failure; refreshes the assignable-user list).
                if (!opening) {
                  managersRequestedRef.current = false;
                  setManagerOptions({ kind: 'idle' });
                }
              }}
            >
              {formOpen ? 'Close form' : '+ Add Existing Loan'}
            </button>
          </div>
        </div>
        <p style={styles.subtitle}>
          Manually board a loan already in your portfolio (not originated through the LOS). Boarded loans
          appear here and in portfolio servicing.
        </p>
        {!authorized && (
          <div style={styles.note} role="note" data-existing-loan-write-disabled>
            <strong>Read-only:</strong>{' '}
            {writeDisabledReason ?? 'No Dataverse identity is available, so boarding is disabled.'}
          </div>
        )}
      </header>

      {importOpen && (
        <PortfolioImportWizard
          authorized={authorized}
          actorEmail={actorEmail}
          actorSystemUserId={actorSystemUserId}
          existingLoanNumbers={existingLoanNumbers}
          onImported={() => setReloadKey((n) => n + 1)}
        />
      )}

      {formOpen && authorized && (
        <div style={styles.form} data-existing-loan-form>
          <div style={styles.fieldGrid}>
            {TEXT_FIELDS.map((f) => (
              <label key={f.key} style={styles.field}>
                <span style={styles.fieldLabel}>
                  {f.label}
                  {f.required ? ' *' : ''}
                </span>
                <input
                  style={styles.input}
                  type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                  value={form[f.key]}
                  data-xl-field={f.key}
                  onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                />
              </label>
            ))}
          </div>

          {/* Phase 262 — Product, ownership & pricing/rate terms */}
          <div style={styles.rateSection} data-xl-rate-section>
            {!EXTENDED_LOAN_ATTRIBUTES_PERSISTENCE_ENABLED && (
              <div style={styles.note} role="note" data-xl-extended-not-persisted>
                <strong>Not yet persisted:</strong> product, officer, branch, purpose, current note rate, and
                reset terms are captured and used for rate logic this session, but are not yet saved to the
                portfolio record (the extended-attributes column is not provisioned). Index, spread, floor,
                ceiling, and rate type are saved.
              </div>
            )}
            <div style={styles.sectionTitle}>Product & ownership</div>
            <div style={styles.fieldGrid}>
              <label style={styles.field}>
                <span style={styles.fieldLabel}>Loan product</span>
                <select
                  style={styles.input}
                  value={form.loanProduct}
                  data-xl-product
                  onChange={(e) => setForm((s) => ({ ...s, loanProduct: e.target.value }))}
                >
                  <option value="">Select a product…</option>
                  {LOAN_PRODUCTS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </label>
              {OWNERSHIP_FIELDS.map((f) => (
                <label key={f.key} style={styles.field}>
                  <span style={styles.fieldLabel}>{f.label}</span>
                  <input
                    style={styles.input}
                    type="text"
                    value={form[f.key]}
                    data-xl-field={f.key}
                    onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                  />
                </label>
              ))}
              {/* PM-1 — portfolio manager is a real systemuser lookup, not free text. */}
              <label style={styles.field}>
                <span style={styles.fieldLabel}>Assigned portfolio manager</span>
                <select
                  style={managerOptions.kind === 'failed' ? styles.inputDisabled : styles.input}
                  value={form.portfolioManagerId}
                  disabled={managerOptions.kind === 'loading' || managerOptions.kind === 'failed'}
                  data-xl-manager
                  onChange={(e) => setForm((s) => ({ ...s, portfolioManagerId: e.target.value }))}
                >
                  <option value="">
                    {managerOptions.kind === 'loading'
                      ? 'Loading managers…'
                      : managerOptions.kind === 'failed'
                        ? 'Managers unavailable'
                        : 'Unassigned'}
                  </option>
                  {managerOptions.kind === 'ready' &&
                    managerOptions.options.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.email ? `${m.name} · ${m.email}` : m.name}
                      </option>
                    ))}
                </select>
                {managerOptions.kind === 'failed' && (
                  <span style={styles.draftNote} data-xl-manager-error>
                    Could not load users. You can still board the loan; assign a manager later.
                  </span>
                )}
              </label>
            </div>

            <div style={styles.sectionTitle}>Pricing & rate terms</div>
            <div style={styles.fieldGrid}>
              <label style={styles.field}>
                <span style={styles.fieldLabel}>Interest rate type</span>
                <select
                  style={styles.input}
                  value={form.interestRateType}
                  data-xl-ratetype
                  onChange={(e) => setForm((s) => ({ ...s, interestRateType: e.target.value }))}
                >
                  <option value="">Select…</option>
                  {INTEREST_RATE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label style={styles.field}>
                <span style={styles.fieldLabel}>Index{variable ? ' *' : ''}</span>
                <select
                  style={variable ? styles.input : styles.inputDisabled}
                  value={form.index}
                  disabled={!variable}
                  data-xl-index
                  onChange={(e) => setForm((s) => ({ ...s, index: e.target.value }))}
                >
                  <option value="">{variable ? 'Select an index…' : 'N/A for fixed'}</option>
                  {RATE_INDEX_OPTIONS.map((idx) => (
                    <option key={idx} value={idx}>{idx}</option>
                  ))}
                </select>
              </label>
              {RATE_FIELDS.map((f) => {
                const disabled = f.variableOnly === true && !variable;
                return (
                  <label key={f.key} style={styles.field}>
                    <span style={styles.fieldLabel}>{f.label}{f.variableOnly && variable ? ' *' : ''}</span>
                    <input
                      style={disabled ? styles.inputDisabled : styles.input}
                      type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                      value={form[f.key]}
                      disabled={disabled}
                      data-xl-field={f.key}
                      onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                    />
                  </label>
                );
              })}
            </div>

            {variable && (form.index.trim().length === 0 || form.spread.trim().length === 0) && (
              <div style={styles.note} role="note" data-xl-variable-hint>
                Variable / adjustable loans need an <strong>index</strong> and a <strong>spread</strong> to compute the
                fully-indexed rate in the Variable Rate Control Center.
              </div>
            )}

            <div style={styles.presetRow}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={payment61}
                  data-xl-payment61
                  onChange={(e) => setPayment61(e.target.checked)}
                />
                Payment-61 rate reset
              </label>
              <button type="button" style={styles.presetBtn} data-xl-payment61-preset onClick={applyPayment61Preset}>
                Apply 10-yr term / 5-yr reset / payment 61
              </button>
            </div>
          </div>

          <div style={styles.childGroups}>
            {EXISTING_LOAN_CHILD_KEYS.map((key) => (
              <div key={key} style={styles.childGroup} data-xl-child-group={key}>
                <div style={styles.childHeader}>
                  <span style={styles.childTitle}>{CHILD_LABELS[key]}</span>
                  <button
                    type="button"
                    style={styles.childAdd}
                    data-xl-child-add={key}
                    onClick={() => setChildren((c) => ({ ...c, [key]: [...c[key], ''] }))}
                  >
                    + Add
                  </button>
                </div>
                {children[key].map((val, i) => (
                  <input
                    key={i}
                    style={styles.childInput}
                    placeholder={`${CHILD_LABELS[key]} name / description`}
                    value={val}
                    data-xl-child-input={`${key}-${i}`}
                    onChange={(e) =>
                      setChildren((c) => {
                        const next = c[key].slice();
                        next[i] = e.target.value;
                        return { ...c, [key]: next };
                      })
                    }
                  />
                ))}
              </div>
            ))}
          </div>

          <div style={styles.formActions}>
            <button
              type="button"
              style={styles.draftBtn}
              data-existing-loan-draft
              onClick={() => setDraftSaved(true)}
            >
              Save draft
            </button>
            <button
              type="button"
              style={canSubmit ? styles.boardBtn : styles.boardBtnDisabled}
              disabled={!canSubmit}
              data-existing-loan-submit
              onClick={() => void onBoard()}
            >
              {submit.kind === 'saving' ? 'Boarding…' : 'Board loan'}
            </button>
            {draftSaved && <span style={styles.draftNote} data-existing-loan-draft-saved>Draft kept in this form (not yet boarded).</span>}
          </div>

          {submit.kind === 'done' && <OutcomeBanner outcome={submit.outcome} />}
        </div>
      )}

      {extendedUnprovisioned && (
        <div style={styles.note} role="note" data-extended-attrs-unprovisioned>
          Extended attributes not provisioned — showing core fields. Note rate, reset terms, product, and
          officer are not stored until the operator provisions the extended-attributes column.
        </div>
      )}

      <BoardedList list={list} onOpen={setSelected} />

      {selected && (
        <BoardedDetailDrawer row={selected} onClose={() => setSelected(undefined)} loadRecordCounts={loadRecordCounts} />
      )}
    </section>
  );
}

function OutcomeBanner({ outcome }: { outcome: BoardExistingLoanOutcome }) {
  if (outcome.kind === 'success') {
    return (
      <div style={styles.ok} role="status" data-existing-loan-outcome="success">
        ✓ Existing loan {outcome.loanNumber} boarded ({outcome.childCreated} related record
        {outcome.childCreated === 1 ? '' : 's'}). Verified and audited (ref {outcome.correlationId}).
        {outcome.childErrors.length > 0 && (
          <span data-existing-loan-child-errors> {outcome.childErrors.length} related record(s) failed and must be re-entered.</span>
        )}
      </div>
    );
  }
  return (
    <div style={styles.err} role="alert" data-existing-loan-outcome={outcome.kind}>
      {describeFailure(outcome)}
    </div>
  );
}

function describeFailure(o: Exclude<BoardExistingLoanOutcome, { kind: 'success' }>): string {
  switch (o.kind) {
    case 'unauthorized':
    case 'identity-unresolved':
    case 'invalid-input':
      return `Not boarded — ${o.reason}`;
    case 'duplicate':
      return `Not boarded — ${o.reason}`;
    case 'write-failed':
      return `Not boarded — the loan could not be written. ${o.error}`;
    case 'readback-mismatch':
      return 'Not boarded — the loan did not verify on readback. No confirmed record; please retry.';
    case 'audit-failed':
      return 'The loan was boarded but its audit entry failed — an operator must reattempt the audit. This is not a clean boarding.';
    default:
      return o.message;
  }
}

function BoardedList({ list, onOpen }: { list: ListState; onOpen: (r: BoardedLoanRow) => void }) {
  if (list.kind === 'loading') return <div style={styles.muted}>Loading portfolio loans…</div>;
  if (list.kind === 'failed') {
    return (
      <div style={styles.failNote} role="alert" data-existing-portfolio-failure>
        Portfolio loans are not available right now. {list.message} Refresh to retry.
      </div>
    );
  }
  if (list.rows.length === 0) {
    return <div style={styles.muted}>No portfolio loans boarded yet.</div>;
  }
  return (
    <table style={styles.table} data-boarded-loans-table>
      <thead>
        <tr>
          <th style={styles.th}>Loan #</th>
          <th style={styles.th}>Borrower</th>
          <th style={styles.th}>Status</th>
          <th style={styles.th}>Outstanding</th>
          <th style={styles.th}>Source</th>
        </tr>
      </thead>
      <tbody>
        {list.rows.map((r) => (
          <tr
            key={r.id}
            style={styles.row}
            data-boarded-loan-row={r.id}
            role="button"
            tabIndex={0}
            aria-label={`Open ${r.loanNumber ?? 'loan'}`}
            onClick={() => onOpen(r)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen(r);
              }
            }}
          >
            <td style={styles.tdStrong}>{r.loanNumber ?? '—'}</td>
            <td style={styles.td}>{r.borrower ?? '—'}</td>
            <td style={styles.td}>{r.status ?? '—'}</td>
            <td style={styles.td}>{formatAmount(r.outstanding)}</td>
            <td style={styles.td}>
              <Badge variant={r.manuallyBoarded ? 'clear' : 'neutral'} appearance="outline">
                {r.manuallyBoarded ? 'Manually boarded loan' : 'Boarded'}
              </Badge>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type RecordCompletenessResult =
  | { kind: 'ready'; completeness: PortfolioBoardedLoanRecordCompleteness }
  | { kind: 'failed' };

function BoardedDetailDrawer({
  row,
  onClose,
  loadRecordCounts,
}: {
  row: BoardedLoanRow;
  onClose: () => void;
  loadRecordCounts: (loanId: string) => Promise<BoardedLoanChildCounts>;
}) {
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Loan number', value: row.loanNumber ?? '—' },
    { label: 'Borrower', value: row.borrower ?? '—' },
    { label: 'Status', value: row.status ?? '—' },
    { label: 'Outstanding principal', value: formatAmount(row.outstanding) },
    { label: 'Risk rating', value: row.riskRating ?? '—' },
    { label: 'Maturity', value: row.maturityDate ?? '—' },
    { label: 'Boarding source', value: row.boardingSource ?? '—' },
  ];

  // Keyed result, not a tri-state 'loading' flag: the effect below only calls setState from its
  // async callback (never synchronously in the effect body). "Loading" is DERIVED by comparing
  // the current loan id against the key the latest committed result belongs to, matching
  // DealPortfolioBoardingStatusPanel.tsx's established pattern.
  const [recordResult, setRecordResult] = useState<{ loanId: string; result: RecordCompletenessResult } | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadRecordCounts(row.id)
      .then((counts) => {
        if (!cancelled) setRecordResult({ loanId: row.id, result: { kind: 'ready', completeness: deriveBoardedLoanRecordCompleteness(counts) } });
      })
      .catch(() => {
        if (!cancelled) setRecordResult({ loanId: row.id, result: { kind: 'failed' } });
      });
    return () => {
      cancelled = true;
    };
  }, [row.id, loadRecordCounts]);

  const hasFreshRecordResult = recordResult?.loanId === row.id;
  const recordState: { kind: 'loading' } | RecordCompletenessResult =
    hasFreshRecordResult && recordResult ? recordResult.result : { kind: 'loading' };

  return (
    <aside style={styles.drawer} role="dialog" aria-label="Portfolio loan detail" data-boarded-loan-detail>
      <div style={styles.drawerHead}>
        <div>
          <div style={styles.drawerTitle}>{row.loanNumber ?? 'Portfolio loan'}</div>
          <div style={styles.drawerSub}>{row.manuallyBoarded ? 'Existing portfolio loan (manually boarded)' : 'Portfolio loan'}</div>
        </div>
        <button type="button" style={styles.drawerClose} aria-label="Close detail" data-boarded-loan-close onClick={onClose}>
          ✕
        </button>
      </div>
      <dl style={styles.detailList}>
        {rows.map((r) => (
          <div key={r.label} style={styles.detailRow}>
            <dt style={styles.detailLabel}>{r.label}</dt>
            <dd style={styles.detailValue}>{r.value}</dd>
          </div>
        ))}
      </dl>
      <div style={styles.recordCompletenessSection} data-boarded-loan-record-completeness>
        <div style={styles.recordCompletenessTitle}>Related records</div>
        {recordState.kind === 'loading' && (
          <p style={styles.recordCompletenessNote}>Loading related records…</p>
        )}
        {recordState.kind === 'failed' && (
          <p style={styles.recordCompletenessNote} role="alert">
            Related-record counts could not be loaded right now.
          </p>
        )}
        {recordState.kind === 'ready' && (
          <>
            <p style={styles.recordCompletenessNote}>
              {recordState.completeness.totalRecords} record{recordState.completeness.totalRecords === 1 ? '' : 's'} across{' '}
              {recordState.completeness.groupsWithRecords} of {recordState.completeness.groups.length} groups.
              {recordState.completeness.groupsFailedToLoad > 0 &&
                ` ${recordState.completeness.groupsFailedToLoad} group${recordState.completeness.groupsFailedToLoad === 1 ? '' : 's'} could not be read.`}
            </p>
            <dl style={styles.detailList}>
              {recordState.completeness.groups.map((g) => (
                <div key={g.key} style={styles.detailRow} data-record-group={g.key}>
                  <dt style={styles.detailLabel}>{g.label}</dt>
                  <dd style={styles.detailValue}>{g.count === null ? 'Could not load' : g.count}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </div>
    </aside>
  );
}

function formatAmount(amount: number | null | undefined): string {
  return formatCurrency(amount, { abbreviate: true, empty: '—' });
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: spacing.lg, width: '100%' },
  head: { display: 'flex', flexDirection: 'column', gap: spacing.xs },
  headRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  headActions: { display: 'flex', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap' },
  uploadBtn: { background: palette.surface, color: palette.cobalt, border: `1px solid ${palette.cobalt}`, borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, fontFamily: typography.family, cursor: 'pointer' },
  title: { margin: 0, fontSize: typography.size.xl, fontWeight: typography.weight.bold, color: palette.text },
  subtitle: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm, lineHeight: typography.lineHeight.snug, maxWidth: 760 },
  note: { background: palette.surfaceAlt, border: `1px solid ${palette.borderStrong}`, borderRadius: radius.sm, padding: `${spacing.sm} ${spacing.md}`, color: palette.text, fontSize: typography.size.sm },
  muted: { color: palette.textMuted, fontSize: typography.size.sm, fontStyle: 'italic', padding: `${spacing.md} 0` },
  failNote: { background: palette.surfaceAlt, border: `1px solid ${palette.borderStrong}`, borderRadius: radius.sm, padding: `${spacing.sm} ${spacing.md}`, color: palette.text, fontSize: typography.size.sm },
  addBtn: { background: palette.primary, color: palette.surface, border: `1px solid ${palette.primary}`, borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, fontFamily: typography.family, cursor: 'pointer' },
  addBtnDisabled: { background: palette.surfaceAlt, color: palette.textSubtle, border: `1px solid ${palette.border}`, borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, fontFamily: typography.family, cursor: 'not-allowed' },
  form: { display: 'flex', flexDirection: 'column', gap: spacing.md, background: palette.surface, border: `1px solid ${palette.panelBorder}`, borderRadius: radius.md, boxShadow: shadow.card, padding: `${spacing.md} ${spacing.lg}` },
  fieldGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: spacing.sm },
  field: { display: 'flex', flexDirection: 'column', gap: 2 },
  fieldLabel: { fontSize: typography.size.xs, color: palette.textSubtle, fontWeight: typography.weight.semibold },
  input: { padding: `${spacing.xs} ${spacing.sm}`, border: `1px solid ${palette.border}`, borderRadius: radius.sm, fontSize: typography.size.sm, fontFamily: typography.family, background: palette.surface, color: palette.text },
  inputDisabled: { padding: `${spacing.xs} ${spacing.sm}`, border: `1px solid ${palette.border}`, borderRadius: radius.sm, fontSize: typography.size.sm, fontFamily: typography.family, background: palette.surfaceAlt, color: palette.textSubtle },
  rateSection: { display: 'flex', flexDirection: 'column', gap: spacing.sm, paddingTop: spacing.sm, borderTop: `1px solid ${palette.divider}` },
  sectionTitle: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.bold },
  presetRow: { display: 'flex', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  checkboxLabel: { display: 'inline-flex', alignItems: 'center', gap: spacing.xs, fontSize: typography.size.sm, color: palette.text },
  presetBtn: { background: palette.surfaceAlt, color: palette.cobalt, border: `1px solid ${palette.border}`, borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, fontFamily: typography.family, cursor: 'pointer' },
  childGroups: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: spacing.sm },
  childGroup: { display: 'flex', flexDirection: 'column', gap: spacing.xs, padding: spacing.sm, background: palette.surfaceAlt, border: `1px solid ${palette.divider}`, borderRadius: radius.sm },
  childHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  childTitle: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.bold },
  childAdd: { background: 'transparent', border: 'none', color: palette.cobalt, cursor: 'pointer', fontSize: typography.size.xs, fontWeight: typography.weight.semibold },
  childInput: { padding: `${spacing.xs} ${spacing.sm}`, border: `1px solid ${palette.border}`, borderRadius: radius.sm, fontSize: typography.size.sm, fontFamily: typography.family },
  formActions: { display: 'flex', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap' },
  draftBtn: { background: palette.surfaceAlt, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, fontFamily: typography.family, cursor: 'pointer' },
  draftNote: { fontSize: typography.size.xs, color: palette.textSubtle },
  boardBtn: { background: palette.cobalt, color: palette.cobaltFg, border: 'none', borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.lg}`, fontSize: typography.size.sm, fontWeight: typography.weight.bold, fontFamily: typography.family, cursor: 'pointer' },
  boardBtnDisabled: { background: palette.surfaceAlt, color: palette.textSubtle, border: `1px solid ${palette.border}`, borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.lg}`, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, fontFamily: typography.family, cursor: 'not-allowed' },
  ok: { background: palette.clearBg, border: `1px solid ${palette.clear}`, borderRadius: radius.sm, padding: `${spacing.sm} ${spacing.md}`, color: palette.text, fontSize: typography.size.sm },
  err: { background: palette.atRiskBg, border: `1px solid ${palette.atRisk}`, borderRadius: radius.sm, padding: `${spacing.sm} ${spacing.md}`, color: palette.text, fontSize: typography.size.sm },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: typography.size.sm, background: palette.surface, border: `1px solid ${palette.panelBorder}`, borderRadius: radius.md, boxShadow: shadow.card },
  th: { textAlign: 'left', padding: `${spacing.sm} ${spacing.md}`, color: palette.textSubtle, textTransform: 'uppercase', fontSize: typography.size.xs, letterSpacing: typography.letterSpacing.label, borderBottom: `1px solid ${palette.divider}` },
  row: { cursor: 'pointer', borderBottom: `1px solid ${palette.divider}` },
  td: { padding: `${spacing.sm} ${spacing.md}`, color: palette.text, borderBottom: `1px solid ${palette.divider}` },
  tdStrong: { padding: `${spacing.sm} ${spacing.md}`, color: palette.text, fontWeight: typography.weight.semibold, borderBottom: `1px solid ${palette.divider}` },
  drawer: { background: palette.surface, border: `1px solid ${palette.panelBorder}`, borderRadius: radius.md, boxShadow: shadow.elevated, padding: `${spacing.md} ${spacing.lg}`, display: 'flex', flexDirection: 'column', gap: spacing.sm },
  drawerHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  drawerTitle: { fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: palette.text },
  drawerSub: { fontSize: typography.size.sm, color: palette.textMuted },
  drawerClose: { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: typography.size.md, color: palette.textMuted },
  detailList: { margin: 0, display: 'flex', flexDirection: 'column', gap: spacing.xs },
  detailRow: { display: 'grid', gridTemplateColumns: '180px 1fr', gap: spacing.sm },
  detailLabel: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold },
  detailValue: { margin: 0, fontSize: typography.size.sm, color: palette.text },
  recordCompletenessSection: { display: 'flex', flexDirection: 'column', gap: spacing.xs, borderTop: `1px solid ${palette.panelBorder}`, paddingTop: spacing.sm },
  recordCompletenessTitle: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: palette.text },
  recordCompletenessNote: { margin: 0, fontSize: typography.size.xs, color: palette.textMuted },
};
