import { useState, type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../../shared/Card';
import { palette, radius, spacing, typography } from '../../shared/theme';
import { formatCurrency } from '../../shared/formatters';
import { deriveStressTestSnapshot, type StressTestLoanInput, type PortfolioStressTestSnapshot } from './stressTesting';
import type { StressSensitivity } from '../earlyWarning/earlyWarning';
import type { FacilityBand } from '../riskRating/dualRiskRating';

/**
 * Phase 264 (P3) — Stress Test (What-If) panel.
 *
 * A READ-ONLY-IN-EFFECT display over the PURE `deriveStressTestSnapshot`
 * engine: the user enters a rate shock (bps) and a collateral-value shock (%)
 * and clicks "Run scenario" — the component owns the local scenario-input
 * state and calls the pure deriver directly. This is NOT a governed write
 * surface: running a scenario is a client-side computation only. There is no
 * Dataverse call, no persistence, and no audit trail — the footer says so
 * explicitly. Re-running with different inputs simply discards the prior
 * result; nothing here is ever saved.
 */

const FACILITY_BAND_LABEL: Record<FacilityBand, string> = {
  strongly_secured: 'Strongly secured',
  well_secured: 'Well secured',
  partially_secured: 'Partially secured',
  unsecured: 'Unsecured',
};

const SENSITIVITY_LABEL: Record<StressSensitivity, string> = {
  high: 'High',
  moderate: 'Moderate',
  low: 'Low',
};

const SENSITIVITY_TONE: Record<StressSensitivity, CSSProperties> = {
  high: { color: palette.blocked },
  moderate: { color: palette.atRisk },
  low: { color: palette.textMuted },
};

interface Props {
  readonly loans: readonly StressTestLoanInput[];
}

const DEFAULT_RATE_SHOCK_BPS = 200;
const DEFAULT_COLLATERAL_SHOCK_PCT = -20;

export function StressTestScenarioPanel({ loans }: Props) {
  // Kept as raw strings (not numbers) while the user is typing: coercing via
  // `Number(e.target.value)` on every keystroke turns a partial value like the
  // leading "-" of "-20" into NaN, which corrupts a controlled number input
  // mid-entry. The strings are parsed once, when the scenario actually runs.
  const [rateShockBpsInput, setRateShockBpsInput] = useState<string>(String(DEFAULT_RATE_SHOCK_BPS));
  const [collateralShockPctInput, setCollateralShockPctInput] = useState<string>(String(DEFAULT_COLLATERAL_SHOCK_PCT));
  const [snapshot, setSnapshot] = useState<PortfolioStressTestSnapshot | undefined>(undefined);

  const hasLoans = loans.length > 0;

  function runScenario() {
    if (!hasLoans) return;
    const parsedRateShockBps = Number(rateShockBpsInput);
    const parsedCollateralShockPct = Number(collateralShockPctInput);
    const rateShockBps = Number.isFinite(parsedRateShockBps) ? parsedRateShockBps : 0;
    const collateralValueShockPct = Number.isFinite(parsedCollateralShockPct) ? parsedCollateralShockPct : 0;
    setSnapshot(
      deriveStressTestSnapshot(
        {
          scenarioName: `Rate ${rateShockBps >= 0 ? '+' : ''}${rateShockBps}bps / Collateral ${collateralValueShockPct >= 0 ? '+' : ''}${collateralValueShockPct}%`,
          interestRateShockBps: rateShockBps,
          collateralValueShockPct,
        },
        loans,
      ),
    );
  }

  return (
    <Card>
      <CardHeader
        title="Stress Test (What-If)"
        subtitle="Ephemeral scenario — never persisted. Runs against the real boarded-loan book."
      />

      {!hasLoans && (
        <div role="status" style={styles.emptyState} data-stress-test-empty>
          <p style={styles.emptyTitle}>No boarded loans available to stress test</p>
          <p style={styles.emptyDetail}>
            Board loans into the portfolio before running a rate/collateral shock scenario.
          </p>
        </div>
      )}

      {hasLoans && (
        <div style={styles.form} data-stress-test-form>
          <label style={styles.label}>
            Interest rate shock (bps)
            <input
              type="number"
              step={25}
              value={rateShockBpsInput}
              onChange={(e) => setRateShockBpsInput(e.target.value)}
              style={styles.input}
              data-stress-test-rate-input
            />
          </label>
          <label style={styles.label}>
            Collateral value shock (%)
            <input
              type="number"
              step={5}
              value={collateralShockPctInput}
              onChange={(e) => setCollateralShockPctInput(e.target.value)}
              style={styles.input}
              data-stress-test-collateral-input
            />
          </label>
          <button type="button" style={styles.runButton} onClick={runScenario} data-stress-test-run>
            Run scenario
          </button>
        </div>
      )}

      {hasLoans && snapshot && (
        <div style={styles.results} data-stress-test-results>
          <div style={styles.summaryRow} data-stress-test-summary>
            <SummaryStat label="Total exposure" value={formatCurrency(snapshot.totalExposure)} />
            <SummaryStat label="High sensitivity" value={formatCurrency(snapshot.exposureBySensitivity.high)} sub={`${snapshot.loanCountBySensitivity.high} loan(s)`} tone={SENSITIVITY_TONE.high} />
            <SummaryStat label="Moderate sensitivity" value={formatCurrency(snapshot.exposureBySensitivity.moderate)} sub={`${snapshot.loanCountBySensitivity.moderate} loan(s)`} tone={SENSITIVITY_TONE.moderate} />
            <SummaryStat label="Low sensitivity" value={formatCurrency(snapshot.exposureBySensitivity.low)} sub={`${snapshot.loanCountBySensitivity.low} loan(s)`} tone={SENSITIVITY_TONE.low} />
          </div>
          {snapshot.excludedLoanCount > 0 && (
            <p style={styles.excludedNote} data-stress-test-excluded>
              {snapshot.excludedLoanCount} loan(s) excluded from this scenario — outstanding exposure is missing or not a positive number.
            </p>
          )}

          <table style={styles.table} data-stress-test-table>
            <thead>
              <tr>
                <th style={styles.th}>Borrower</th>
                <th style={styles.th}>Exposure</th>
                <th style={styles.th}>Sensitivity</th>
                <th style={styles.th}>Facility band</th>
                <th style={styles.th}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.loanResults.map((r) => (
                <tr key={r.loanId} data-stress-test-row data-stress-test-sensitivity={r.sensitivity}>
                  <td style={styles.td}>{r.borrowerName ?? r.loanId}</td>
                  <td style={styles.td}>{formatCurrency(r.exposure)}</td>
                  <td style={{ ...styles.td, ...SENSITIVITY_TONE[r.sensitivity], fontWeight: typography.weight.semibold }}>
                    {SENSITIVITY_LABEL[r.sensitivity]}
                  </td>
                  <td style={styles.td}>
                    {r.facilityBandBefore && r.facilityBandAfter ? (
                      <span data-stress-test-facility-band>
                        {r.facilityBandBefore === r.facilityBandAfter
                          ? FACILITY_BAND_LABEL[r.facilityBandBefore]
                          : `${FACILITY_BAND_LABEL[r.facilityBandBefore]} → ${FACILITY_BAND_LABEL[r.facilityBandAfter]}`}
                      </span>
                    ) : (
                      <span style={styles.mutedCell}>Not computable</span>
                    )}
                  </td>
                  <td style={styles.tdNotes}>
                    {r.notComputableReasons.length > 0 ? r.notComputableReasons.join(' ') : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CardFooter>
        <span>No Dataverse call. No persistence. Re-running with different inputs discards the prior result.</span>
      </CardFooter>
    </Card>
  );
}

function SummaryStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: CSSProperties }) {
  return (
    <div style={styles.summaryStat}>
      <span style={styles.summaryLabel}>{label}</span>
      <span style={{ ...styles.summaryValue, ...tone }}>{value}</span>
      {sub && <span style={styles.summarySub}>{sub}</span>}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  emptyState: { display: 'flex', flexDirection: 'column', gap: spacing.sm, padding: spacing.lg, textAlign: 'center' },
  emptyTitle: { margin: 0, fontSize: typography.size.md, fontWeight: typography.weight.semibold, color: palette.text },
  emptyDetail: { margin: 0, fontSize: typography.size.sm, color: palette.textMuted },
  form: { display: 'flex', flexWrap: 'wrap', gap: spacing.md, alignItems: 'flex-end' },
  label: { display: 'flex', flexDirection: 'column', gap: spacing.xs, fontSize: typography.size.sm, color: palette.text },
  input: { padding: spacing.xs, borderRadius: 4, border: `1px solid ${palette.border}`, fontFamily: typography.family, width: 140 },
  runButton: {
    padding: `${spacing.xs} ${spacing.lg}`,
    borderRadius: radius.sm,
    border: 'none',
    background: palette.primary,
    color: palette.textInverse,
    fontWeight: typography.weight.semibold,
    fontSize: typography.size.sm,
    cursor: 'pointer',
  },
  results: { display: 'flex', flexDirection: 'column', gap: spacing.md },
  summaryRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: spacing.sm },
  summaryStat: { display: 'flex', flexDirection: 'column', gap: 2, background: palette.surfaceAlt, border: `1px solid ${palette.divider}`, borderRadius: radius.sm, padding: `${spacing.sm} ${spacing.md}` },
  summaryLabel: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.bold },
  summaryValue: { fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: palette.text },
  summarySub: { fontSize: typography.size.xs, color: palette.textMuted },
  excludedNote: { margin: 0, fontSize: typography.size.xs, color: palette.textMuted, fontStyle: 'italic' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: typography.size.sm },
  th: { textAlign: 'left', padding: `${spacing.xs} ${spacing.sm}`, borderBottom: `1px solid ${palette.border}`, color: palette.textSubtle, fontSize: typography.size.xs, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label },
  td: { padding: `${spacing.xs} ${spacing.sm}`, borderBottom: `1px solid ${palette.divider}`, color: palette.text },
  tdNotes: { padding: `${spacing.xs} ${spacing.sm}`, borderBottom: `1px solid ${palette.divider}`, color: palette.textMuted, fontSize: typography.size.xs, maxWidth: 320 },
  mutedCell: { color: palette.textMuted, fontStyle: 'italic' },
};
