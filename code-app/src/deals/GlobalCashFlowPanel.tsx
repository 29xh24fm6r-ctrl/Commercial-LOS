import { useMemo, useState } from 'react';
import {
  computeGlobalCashFlow,
  classifyDscr,
  parseGlobalCashFlowFormState,
  serializeGlobalCashFlowFormState,
  type GlobalCashFlowInput,
  type GlobalCashFlowFormState,
  type PersonalCashFlowInput,
} from './globalCashFlow';
import { updateDealProfile, type UpdateDealProfileOutcome, type VerifiedProfilePatch } from './write/updateDealProfile';
import { buildLiveUpdateDealProfileDeps } from './write/buildLiveUpdateDealProfileDeps';
import type { DealDetail } from './dealQueries';
import { Card } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { WidgetHeader } from '../shared/cockpitPrimitives';
import { palette, radius, spacing, typography, type SeverityKey } from '../shared/theme';

/**
 * PR 105 -- Global Cash Flow calculator. Real DSCR math (see globalCashFlow.ts), mounted so a
 * banker can size a deal's global debt capacity during underwriting.
 *
 * Factory Arc Phase 4 wired real persistence: entered figures serialize to
 * cr664_financialspreadinputs (a PR105-provisioned Memo/JSON column) through the same governed
 * updateDealProfile.ts authorize -> validate -> update -> readback -> audit pipeline used
 * elsewhere in the deal profile, keyed by the raw column name rather than a generated enum (see
 * updateDealProfile.ts's header comment and docs/factory-arc/PR114_LOAN_DEAL_SDK_REGENERATION_ESCALATION.md
 * for why that's safe without waiting on the operator-run SDK regeneration). Values load from the
 * deal on mount and persist explicitly via the Save button -- not on every keystroke.
 */

interface GuarantorRow extends PersonalCashFlowInput {
  readonly key: string;
}

function n(v: string): number | undefined {
  if (v.trim().length === 0) return undefined;
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Reconstruct the panel's guarantor rows from a parsed saved state (or the one-blank-row default). */
function initialGuarantorRows(saved: GlobalCashFlowFormState): GuarantorRow[] {
  if (saved.guarantors.length === 0) {
    return [{ key: 'g-1', guarantorName: '', grossPersonalIncome: undefined, nonCashAddbacks: undefined, personalLivingExpenses: undefined, otherPersonalDebtService: undefined }];
  }
  return saved.guarantors.map((g, i) => ({
    key: `g-${i}`,
    guarantorName: g.guarantorName,
    grossPersonalIncome: n(g.grossPersonalIncome),
    nonCashAddbacks: n(g.nonCashAddbacks),
    personalLivingExpenses: n(g.personalLivingExpenses),
    otherPersonalDebtService: n(g.otherPersonalDebtService),
  }));
}

export interface GlobalCashFlowPanelProps {
  readonly deal: DealDetail;
  readonly authorized: boolean;
  readonly actorEmail: string | undefined;
  readonly actorSystemUserId: string | undefined;
  /** Factory mission PR B — notifies a DealDataProvider-aware wrapper with the readback-verified
   *  patch so the cockpit's in-context deal updates immediately, without a full browser reload.
   *  See GlobalCashFlowPanelConnected.tsx for the precedent (DealFundingAuthorizationPanelConnected.tsx). */
  readonly onSaved?: (verified: VerifiedProfilePatch) => void;
}

export function GlobalCashFlowPanel({ deal, authorized, actorEmail, actorSystemUserId, onSaved }: GlobalCashFlowPanelProps) {
  const saved = useMemo(() => parseGlobalCashFlowFormState(deal.financialSpreadInputsJson), [deal.financialSpreadInputsJson]);

  const [netIncome, setNetIncome] = useState(saved.netIncome);
  const [interestExpense, setInterestExpense] = useState(saved.interestExpense);
  const [incomeTaxes, setIncomeTaxes] = useState(saved.incomeTaxes);
  const [depreciation, setDepreciation] = useState(saved.depreciation);
  const [amortization, setAmortization] = useState(saved.amortization);
  const [nonRecurringAddbacks, setNonRecurringAddbacks] = useState(saved.nonRecurringAddbacks);
  const [nonRecurringIncome, setNonRecurringIncome] = useState(saved.nonRecurringIncome);
  const [unfinancedCapEx, setUnfinancedCapEx] = useState(saved.unfinancedCapEx);

  const [proposedNewDebtService, setProposedNewDebtService] = useState(saved.proposedNewDebtService);
  const [otherBusinessDebtService, setOtherBusinessDebtService] = useState(saved.otherBusinessDebtService);

  const [guarantors, setGuarantors] = useState<GuarantorRow[]>(() => initialGuarantorRows(saved));

  const [saveState, setSaveState] = useState<
    { kind: 'idle' } | { kind: 'saving' } | { kind: 'done'; outcome: UpdateDealProfileOutcome }
  >({ kind: 'idle' });

  function updateGuarantor(key: string, patch: Partial<GuarantorRow>) {
    setGuarantors((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function addGuarantor() {
    setGuarantors((rows) => [...rows, { key: `g-${rows.length + 1}-${rows.length}`, guarantorName: '' }]);
  }
  function removeGuarantor(key: string) {
    setGuarantors((rows) => rows.filter((r) => r.key !== key));
  }

  const input: GlobalCashFlowInput = useMemo(
    () => ({
      business: {
        netIncome: n(netIncome),
        interestExpense: n(interestExpense),
        incomeTaxes: n(incomeTaxes),
        depreciation: n(depreciation),
        amortization: n(amortization),
        nonRecurringAddbacks: n(nonRecurringAddbacks),
        nonRecurringIncome: n(nonRecurringIncome),
        unfinancedCapEx: n(unfinancedCapEx),
      },
      guarantors: guarantors
        .filter((g) => g.guarantorName.trim().length > 0)
        .map((g) => ({
          guarantorName: g.guarantorName,
          grossPersonalIncome: g.grossPersonalIncome,
          nonCashAddbacks: g.nonCashAddbacks,
          personalLivingExpenses: g.personalLivingExpenses,
          otherPersonalDebtService: g.otherPersonalDebtService,
        })),
      debtService: {
        proposedNewDebtService: n(proposedNewDebtService) ?? 0,
        otherBusinessDebtService: n(otherBusinessDebtService),
      },
    }),
    [netIncome, interestExpense, incomeTaxes, depreciation, amortization, nonRecurringAddbacks, nonRecurringIncome, unfinancedCapEx, guarantors, proposedNewDebtService, otherBusinessDebtService],
  );

  const outcome = computeGlobalCashFlow(input);

  const saving = saveState.kind === 'saving';

  async function onSave() {
    if (!authorized || !actorSystemUserId || saving) return;
    setSaveState({ kind: 'saving' });
    const formState: GlobalCashFlowFormState = {
      netIncome,
      interestExpense,
      incomeTaxes,
      depreciation,
      amortization,
      nonRecurringAddbacks,
      nonRecurringIncome,
      unfinancedCapEx,
      proposedNewDebtService,
      otherBusinessDebtService,
      guarantors: guarantors
        .filter((g) => g.guarantorName.trim().length > 0)
        .map((g) => ({
          guarantorName: g.guarantorName,
          grossPersonalIncome: g.grossPersonalIncome?.toString() ?? '',
          nonCashAddbacks: g.nonCashAddbacks?.toString() ?? '',
          personalLivingExpenses: g.personalLivingExpenses?.toString() ?? '',
          otherPersonalDebtService: g.otherPersonalDebtService?.toString() ?? '',
        })),
    };
    try {
      const result = await updateDealProfile(
        {
          dealId: deal.id,
          actorEmail,
          actorSystemUserId,
          authorized: true,
          patch: { globalCashFlowInputs: serializeGlobalCashFlowFormState(formState) },
        },
        buildLiveUpdateDealProfileDeps(),
      );
      setSaveState({ kind: 'done', outcome: result });
      if (result.kind === 'updated') onSaved?.(result.verified);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setSaveState({ kind: 'done', outcome: { kind: 'write-failed', error: message, correlationId: '' } });
    }
  }

  return (
    <Card>
      <WidgetHeader title="Global Cash Flow" subtitle="DSCR sizing across the business and its guarantors" />
      {authorized ? (
        <p style={styles.localOnlyNote} role="note" data-gcf-save-note>
          Click Save to record these figures on the deal. Unsaved changes reset on reload.
        </p>
      ) : (
        <p style={styles.localOnlyNote} role="note" data-gcf-local-only-note>
          No Dataverse identity is available for your sign-in, so these figures cannot be saved to the deal —
          entries reset on reload. The calculation below is real.
        </p>
      )}

      <fieldset style={styles.fieldset}>
        <legend style={styles.legend}>Business</legend>
        <div style={styles.grid}>
          <NumField label="Net income" value={netIncome} onChange={setNetIncome} testId="net-income" />
          <NumField label="Interest expense" value={interestExpense} onChange={setInterestExpense} testId="interest-expense" />
          <NumField label="Income taxes" value={incomeTaxes} onChange={setIncomeTaxes} testId="income-taxes" />
          <NumField label="Depreciation" value={depreciation} onChange={setDepreciation} testId="depreciation" />
          <NumField label="Amortization" value={amortization} onChange={setAmortization} testId="amortization" />
          <NumField label="Non-recurring addbacks" value={nonRecurringAddbacks} onChange={setNonRecurringAddbacks} testId="nonrecurring-addbacks" />
          <NumField label="Non-recurring income" value={nonRecurringIncome} onChange={setNonRecurringIncome} testId="nonrecurring-income" />
          <NumField label="Unfinanced CapEx" value={unfinancedCapEx} onChange={setUnfinancedCapEx} testId="unfinanced-capex" />
        </div>
      </fieldset>

      <fieldset style={styles.fieldset}>
        <legend style={styles.legend}>Guarantors</legend>
        {guarantors.map((g, i) => (
          <div key={g.key} style={styles.guarantorRow} data-gcf-guarantor-row={i}>
            <label style={styles.field}>
              <span style={styles.label}>Name</span>
              <input style={styles.input} value={g.guarantorName} data-gcf-field={`guarantor-${i}-name`} onChange={(e) => updateGuarantor(g.key, { guarantorName: e.target.value })} />
            </label>
            <NumField label="Gross personal income" value={g.grossPersonalIncome?.toString() ?? ''} onChange={(v) => updateGuarantor(g.key, { grossPersonalIncome: n(v) })} testId={`guarantor-${i}-income`} />
            <NumField label="Non-cash addbacks" value={g.nonCashAddbacks?.toString() ?? ''} onChange={(v) => updateGuarantor(g.key, { nonCashAddbacks: n(v) })} testId={`guarantor-${i}-addbacks`} />
            <NumField label="Personal living expenses" value={g.personalLivingExpenses?.toString() ?? ''} onChange={(v) => updateGuarantor(g.key, { personalLivingExpenses: n(v) })} testId={`guarantor-${i}-expenses`} />
            <NumField label="Other personal debt service" value={g.otherPersonalDebtService?.toString() ?? ''} onChange={(v) => updateGuarantor(g.key, { otherPersonalDebtService: n(v) })} testId={`guarantor-${i}-other-debt`} />
            {guarantors.length > 1 && (
              <button type="button" style={styles.removeBtn} data-gcf-remove-guarantor={i} onClick={() => removeGuarantor(g.key)}>
                Remove
              </button>
            )}
          </div>
        ))}
        <button type="button" style={styles.addBtn} data-gcf-add-guarantor onClick={addGuarantor}>
          + Add guarantor
        </button>
      </fieldset>

      <fieldset style={styles.fieldset}>
        <legend style={styles.legend}>Debt service</legend>
        <div style={styles.grid}>
          <NumField label="Proposed new debt service" value={proposedNewDebtService} onChange={setProposedNewDebtService} testId="proposed-debt-service" />
          <NumField label="Other business debt service" value={otherBusinessDebtService} onChange={setOtherBusinessDebtService} testId="other-business-debt-service" />
        </div>
      </fieldset>

      <div style={styles.saveRow}>
        <button
          type="button"
          style={authorized && !saving ? styles.saveBtn : styles.saveBtnDisabled}
          disabled={!authorized || saving}
          onClick={onSave}
          data-gcf-save
        >
          {saving ? 'Saving…' : 'Save Global Cash Flow'}
        </button>
        {saveState.kind === 'done' && (
          <SaveOutcomeNote outcome={saveState.outcome} />
        )}
      </div>

      <Result outcome={outcome} />
    </Card>
  );
}

function SaveOutcomeNote({ outcome }: { outcome: UpdateDealProfileOutcome }) {
  if (outcome.kind === 'updated') {
    return (
      <span style={styles.saveOk} role="status" data-gcf-save-outcome="updated">
        Saved.
      </span>
    );
  }
  const reason =
    'reason' in outcome && typeof outcome.reason === 'string'
      ? outcome.reason
      : 'error' in outcome && typeof outcome.error === 'string'
        ? outcome.error
        : 'The Global Cash Flow figures could not be saved. Nothing was changed.';
  return (
    <span style={styles.saveError} role="alert" data-gcf-save-outcome={outcome.kind}>
      {reason}
    </span>
  );
}

function NumField({ label, value, onChange, testId }: { label: string; value: string; onChange: (v: string) => void; testId: string }) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      <input style={styles.input} type="text" inputMode="decimal" value={value} data-gcf-field={testId} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function bandTone(band: ReturnType<typeof classifyDscr>): SeverityKey {
  switch (band) {
    case 'strong':
      return 'clear';
    case 'acceptable':
      return 'neutral';
    case 'marginal':
      return 'atRisk';
    case 'insufficient':
      return 'blocked';
  }
}

function Result({ outcome }: { outcome: ReturnType<typeof computeGlobalCashFlow> }) {
  if (outcome.kind === 'insufficient-data') {
    return (
      <div style={styles.insufficient} role="status" data-gcf-result="insufficient-data">
        <strong>Not enough information to compute a DSCR yet.</strong>
        <ul style={styles.missingList}>
          {outcome.missingInputs.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </div>
    );
  }

  const band = classifyDscr(outcome.dscr);
  return (
    <div style={styles.result} data-gcf-result="computed">
      <div style={styles.resultHead}>
        <span style={styles.dscrValue} data-gcf-dscr>{outcome.dscr.toFixed(2)}x</span>
        <Badge variant={bandTone(band)} appearance="outline">{band}</Badge>
      </div>
      <div style={styles.resultGrid}>
        <div>
          <span style={styles.label}>Global cash flow</span>
          <div style={styles.resultAmount} data-gcf-global-cash-flow>{formatCurrency(outcome.globalCashFlow)}</div>
        </div>
        <div>
          <span style={styles.label}>Global debt service</span>
          <div style={styles.resultAmount} data-gcf-global-debt-service>{formatCurrency(outcome.globalDebtService)}</div>
        </div>
      </div>
      <details style={styles.details}>
        <summary style={styles.summary}>Line-item detail</summary>
        <div style={styles.lineItems}>
          <div style={styles.lineItemGroup}>
            <span style={styles.label}>Business</span>
            {outcome.business.lineItems.map((li) => (
              <div key={li.label} style={styles.lineItemRow}>
                <span>{li.label}</span>
                <span>{formatCurrency(li.amount)}</span>
              </div>
            ))}
          </div>
          {outcome.guarantors.map((g) => (
            <div key={g.guarantorName} style={styles.lineItemGroup}>
              <span style={styles.label}>{g.guarantorName}</span>
              {g.lineItems.map((li) => (
                <div key={li.label} style={styles.lineItemRow}>
                  <span>{li.label}</span>
                  <span>{formatCurrency(li.amount)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function formatCurrency(v: number): string {
  return v.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

const styles: Record<string, React.CSSProperties> = {
  localOnlyNote: {
    margin: 0,
    fontSize: typography.size.xs,
    color: palette.textMuted,
    background: palette.surfaceAlt,
    border: `1px dashed ${palette.borderStrong}`,
    padding: `${spacing.xs} ${spacing.md}`,
    borderRadius: radius.sm,
    lineHeight: typography.lineHeight.snug,
  },
  fieldset: { border: `1px solid ${palette.divider}`, borderRadius: radius.sm, padding: spacing.md, margin: 0 },
  legend: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: palette.textMuted, padding: `0 ${spacing.xs}` },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: spacing.sm },
  guarantorRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: spacing.sm, alignItems: 'end', paddingBottom: spacing.sm, marginBottom: spacing.sm, borderBottom: `1px solid ${palette.divider}` },
  field: { display: 'flex', flexDirection: 'column', gap: 2 },
  label: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold },
  input: { padding: `${spacing.xxs} ${spacing.sm}`, border: `1px solid ${palette.border}`, borderRadius: radius.sm, fontSize: typography.size.sm, fontFamily: typography.family },
  removeBtn: { background: 'transparent', color: palette.textMuted, border: `1px solid ${palette.border}`, borderRadius: radius.sm, padding: `${spacing.xxs} ${spacing.sm}`, fontSize: typography.size.xs, cursor: 'pointer', height: 'fit-content' },
  addBtn: { background: palette.surfaceAlt, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.size.sm, cursor: 'pointer' },
  saveRow: { display: 'flex', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  saveBtn: { background: palette.primary, color: palette.textInverse, border: 'none', borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, cursor: 'pointer' },
  saveBtnDisabled: { background: palette.borderStrong, color: palette.textInverse, border: 'none', borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, cursor: 'not-allowed' },
  saveOk: { fontSize: typography.size.sm, color: palette.clear, fontWeight: typography.weight.semibold },
  saveError: { fontSize: typography.size.sm, color: palette.atRiskFg },
  insufficient: { background: palette.atRiskBg, border: `1px solid ${palette.atRisk}`, borderRadius: radius.sm, padding: spacing.md, color: palette.text, fontSize: typography.size.sm },
  missingList: { margin: `${spacing.xs} 0 0`, paddingLeft: spacing.lg },
  result: { display: 'flex', flexDirection: 'column', gap: spacing.sm, padding: spacing.md, background: palette.surfaceAlt, borderRadius: radius.sm, border: `1px solid ${palette.divider}` },
  resultHead: { display: 'flex', alignItems: 'center', gap: spacing.sm },
  dscrValue: { fontSize: typography.size.xxl, fontWeight: typography.weight.bold, fontVariantNumeric: 'tabular-nums' },
  resultGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: spacing.md },
  resultAmount: { fontSize: typography.size.lg, fontWeight: typography.weight.semibold, fontVariantNumeric: 'tabular-nums' },
  details: { fontSize: typography.size.sm },
  summary: { cursor: 'pointer', color: palette.textMuted, fontWeight: typography.weight.semibold },
  lineItems: { display: 'flex', flexDirection: 'column', gap: spacing.md, marginTop: spacing.sm },
  lineItemGroup: { display: 'flex', flexDirection: 'column', gap: 2 },
  lineItemRow: { display: 'flex', justifyContent: 'space-between', fontSize: typography.size.sm, fontVariantNumeric: 'tabular-nums' },
};
