import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { palette, radius, shadow, spacing, typography } from '../shared/theme';
import { buildImportTemplateCsv } from './portfolioImportColumns';
import {
  parseAndValidateCsv,
  buildImportErrorReportCsv,
  buildImportValidRowsCsv,
  type ParsedImport,
} from './portfolioImportParser';
import {
  runPortfolioImport,
  buildLiveImportRunnerDeps,
  buildImportFailureReportCsv,
  describeImportOutcome,
  type ImportSummary,
} from './portfolioImportRunner';
import { formatCurrency } from '../shared/formatters';

/** Triggers a browser download of `content` as `fileName`; a no-op in non-DOM/test environments. */
function downloadCsv(fileName: string, content: string) {
  try {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    // Download is a no-op in non-DOM/test environments.
  }
}

/**
 * Phase 261 (C) — Upload Existing Portfolio wizard.
 *
 * Upload a CSV → parse → preview the auto-mapped columns + validation (valid
 * rows + a per-row error report) → confirm → batch-board every valid row
 * through the governed `boardExistingLoan` adapter (readback + per-loan audit)
 * → show a results summary. Duplicate loan numbers (existing book or in-file)
 * are flagged in the preview and never silently boarded. CSV is the supported
 * format; an XLSX book should be saved as CSV first.
 */

interface Props {
  readonly authorized: boolean;
  readonly actorEmail: string | undefined;
  readonly actorSystemUserId: string | undefined;
  /** Loan numbers already in the portfolio, for duplicate detection. */
  readonly existingLoanNumbers: readonly string[];
  /** Called after a completed import so the caller can reload its list. */
  readonly onImported?: () => void;
  /** Injected for tests; defaults to the live governed batch import. */
  readonly runImport?: (
    rows: ParsedImport['valid'],
    actor: { actorEmail: string | undefined; actorSystemUserId: string | undefined; authorized: boolean },
    fileName: string,
  ) => Promise<ImportSummary>;
}

type Step =
  | { kind: 'upload' }
  | { kind: 'preview'; fileName: string; parsed: ParsedImport }
  | { kind: 'importing'; fileName: string }
  | { kind: 'done'; summary: ImportSummary };

function liveRunImport(
  rows: ParsedImport['valid'],
  actor: { actorEmail: string | undefined; actorSystemUserId: string | undefined; authorized: boolean },
  fileName: string,
): Promise<ImportSummary> {
  return runPortfolioImport(rows, actor, buildLiveImportRunnerDeps(), fileName);
}

export function PortfolioImportWizard({
  authorized,
  actorEmail,
  actorSystemUserId,
  existingLoanNumbers,
  onImported,
  runImport = liveRunImport,
}: Props) {
  const [step, setStep] = useState<Step>({ kind: 'upload' });
  const [readError, setReadError] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const existingSet = useMemo(() => existingLoanNumbers.map((n) => n), [existingLoanNumbers]);

  function downloadTemplate() {
    downloadCsv('existing-portfolio-import-template.csv', buildImportTemplateCsv());
  }

  async function onFile(file: File) {
    setReadError(undefined);
    try {
      const text = await file.text();
      const parsed = parseAndValidateCsv(text, existingSet);
      setStep({ kind: 'preview', fileName: file.name, parsed });
    } catch (err: unknown) {
      setReadError(err instanceof Error ? err.message : String(err));
    }
  }

  async function confirmImport(fileName: string, parsed: ParsedImport) {
    setStep({ kind: 'importing', fileName });
    const summary = await runImport(
      parsed.valid,
      { actorEmail, actorSystemUserId, authorized },
      fileName,
    );
    setStep({ kind: 'done', summary });
    if (summary.successCount > 0) onImported?.();
  }

  function reset() {
    setStep({ kind: 'upload' });
    setReadError(undefined);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section style={styles.wrap} data-portfolio-import="wizard" aria-label="Upload existing portfolio">
      <header style={styles.head}>
        <div>
          <h3 style={styles.title}>Upload Existing Portfolio</h3>
          <p style={styles.subtitle}>
            Load an existing book of loans from a spreadsheet. Save your file as CSV, then upload it
            below. We preview and validate every row before anything is boarded.
          </p>
        </div>
        <button type="button" style={styles.templateBtn} data-portfolio-import-template onClick={downloadTemplate}>
          ↓ Download CSV template
        </button>
      </header>

      {!authorized && (
        <div style={styles.note} role="note" data-portfolio-import-disabled>
          <strong>Read-only:</strong> a Dataverse identity is required to import loans. Open this from
          the Loan Workflow workspace where your identity is resolved.
        </div>
      )}

      {step.kind === 'upload' && (
        <div style={styles.uploadRow}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            data-portfolio-import-file
            disabled={!authorized}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
          <span style={styles.hint}>CSV only. XLSX: use “Save As → CSV” first.</span>
        </div>
      )}

      {readError && (
        <div style={styles.err} role="alert" data-portfolio-import-read-error>
          Could not read the file: {readError}
        </div>
      )}

      {step.kind === 'preview' && (
        <ImportPreview
          fileName={step.fileName}
          parsed={step.parsed}
          authorized={authorized}
          onCancel={reset}
          onConfirm={() => void confirmImport(step.fileName, step.parsed)}
        />
      )}

      {step.kind === 'importing' && (
        <div style={styles.muted} data-portfolio-import-progress>
          Boarding {/* count */}loans from {step.fileName}…
        </div>
      )}

      {step.kind === 'done' && <ImportResult summary={step.summary} onReset={reset} />}
    </section>
  );
}

function ImportPreview({
  fileName,
  parsed,
  authorized,
  onCancel,
  onConfirm,
}: {
  fileName: string;
  parsed: ParsedImport;
  authorized: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const mappedScalars = Object.keys(parsed.mapping.scalar).length;
  const mappedChildren = Object.keys(parsed.mapping.child).length;
  const canImport = authorized && parsed.valid.length > 0;
  return (
    <div style={styles.preview} data-portfolio-import-preview>
      <div style={styles.previewSummary}>
        <strong>{fileName}</strong> — {parsed.totalDataRows} row(s):{' '}
        <span style={styles.okText} data-portfolio-import-valid-count>{parsed.valid.length} ready</span>,{' '}
        <span style={styles.errText} data-portfolio-import-error-count>{parsed.errors.length} need attention</span>.{' '}
        Mapped {mappedScalars} field column(s) and {mappedChildren} related-record column(s).
      </div>

      {parsed.errors.length > 0 && (
        <div style={styles.errorReport} data-portfolio-import-errors>
          <div style={styles.errorReportHead}>Rows that will be skipped</div>
          <ul style={styles.errorList}>
            {parsed.errors.slice(0, 50).map((e) => (
              <li key={e.rowNumber} style={styles.errorItem}>
                <strong>Row {e.rowNumber}{e.loanNumber ? ` (${e.loanNumber})` : ''}:</strong>{' '}
                {e.messages.join(' ')}
              </li>
            ))}
          </ul>
          {parsed.errors.length > 50 && <div style={styles.hint}>…and {parsed.errors.length - 50} more.</div>}
          <button
            type="button"
            style={styles.downloadReportBtn}
            data-portfolio-import-download-errors
            onClick={() => downloadCsv('portfolio-import-errors.csv', buildImportErrorReportCsv(parsed.errors))}
          >
            ↓ Download full error report ({parsed.errors.length} row{parsed.errors.length === 1 ? '' : 's'})
          </button>
        </div>
      )}

      {parsed.valid.length > 0 && (
        <table style={styles.table} data-portfolio-import-preview-table>
          <thead>
            <tr>
              <th style={styles.th}>Row</th>
              <th style={styles.th}>Loan #</th>
              <th style={styles.th}>Borrower</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {parsed.valid.slice(0, 25).map((v) => (
              <tr key={v.rowNumber} style={styles.row} data-portfolio-import-preview-row={v.loanNumber}>
                <td style={styles.td}>{v.rowNumber}</td>
                <td style={styles.tdStrong}>{v.loanNumber}</td>
                <td style={styles.td}>{v.borrowerLegalName}</td>
                <td style={styles.td}>{v.input.loanStatus ?? '—'}</td>
                <td style={styles.td}>{formatAmount(v.input.currentOutstandingPrincipal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {parsed.valid.length > 25 && <div style={styles.hint}>Showing 25 of {parsed.valid.length} ready rows.</div>}
      {parsed.valid.length > 0 && (
        <button
          type="button"
          style={styles.downloadReportBtn}
          data-portfolio-import-download-valid
          onClick={() => downloadCsv('portfolio-import-ready-rows.csv', buildImportValidRowsCsv(parsed.valid))}
        >
          ↓ Download all {parsed.valid.length} ready row{parsed.valid.length === 1 ? '' : 's'}
        </button>
      )}

      <div style={styles.actions}>
        <button type="button" style={styles.cancelBtn} data-portfolio-import-cancel onClick={onCancel}>
          Choose a different file
        </button>
        <button
          type="button"
          style={canImport ? styles.confirmBtn : styles.confirmBtnDisabled}
          disabled={!canImport}
          data-portfolio-import-confirm
          onClick={onConfirm}
        >
          Import {parsed.valid.length} loan{parsed.valid.length === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  );
}

function ImportResult({ summary, onReset }: { summary: ImportSummary; onReset: () => void }) {
  return (
    <div style={styles.result} data-portfolio-import-result>
      <div style={summary.failureCount === 0 ? styles.ok : styles.warn} role="status">
        Imported <strong>{summary.successCount}</strong> of {summary.rowCount} loan(s) from{' '}
        {summary.fileName}.{' '}
        {summary.failureCount > 0 && (
          <span data-portfolio-import-failures>{summary.failureCount} could not be boarded (see below).</span>
        )}{' '}
        Reference {summary.correlationId}.
        {!summary.auditWritten && (
          <span data-portfolio-import-audit-warning> Import summary audit could not be written ({summary.auditError}).</span>
        )}
      </div>

      {summary.failureCount > 0 && (
        <>
          <ul style={styles.errorList} data-portfolio-import-result-failures>
            {summary.results
              .filter((r) => !r.boarded)
              .slice(0, 50)
              .map((r) => (
                <li key={r.rowNumber} style={styles.errorItem}>
                  <strong>Row {r.rowNumber} ({r.loanNumber}):</strong> {describeImportOutcome(r.outcome.kind)}
                </li>
              ))}
          </ul>
          {summary.failureCount > 50 && <div style={styles.hint}>…and {summary.failureCount - 50} more.</div>}
          <button
            type="button"
            style={styles.downloadReportBtn}
            data-portfolio-import-download-failures
            onClick={() => downloadCsv('portfolio-import-failures.csv', buildImportFailureReportCsv(summary.results))}
          >
            ↓ Download full failure report ({summary.failureCount} row{summary.failureCount === 1 ? '' : 's'})
          </button>
        </>
      )}

      <button type="button" style={styles.cancelBtn} data-portfolio-import-reset onClick={onReset}>
        Import another file
      </button>
    </div>
  );
}

function formatAmount(amount: number | null | undefined): string {
  return formatCurrency(amount, { abbreviate: true, empty: '—' });
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: spacing.md, background: palette.surface, border: `1px solid ${palette.panelBorder}`, borderRadius: radius.md, boxShadow: shadow.card, padding: `${spacing.md} ${spacing.lg}` },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md, flexWrap: 'wrap' },
  title: { margin: 0, fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: palette.text },
  subtitle: { margin: `${spacing.xs} 0 0`, color: palette.textMuted, fontSize: typography.size.sm, maxWidth: 640, lineHeight: typography.lineHeight.snug },
  templateBtn: { background: palette.surface, color: palette.cobalt, border: `1px solid ${palette.border}`, borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, fontFamily: typography.family, cursor: 'pointer', whiteSpace: 'nowrap' },
  uploadRow: { display: 'flex', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  hint: { fontSize: typography.size.xs, color: palette.textSubtle },
  note: { background: palette.surfaceAlt, border: `1px solid ${palette.borderStrong}`, borderRadius: radius.sm, padding: `${spacing.sm} ${spacing.md}`, color: palette.text, fontSize: typography.size.sm },
  muted: { color: palette.textMuted, fontSize: typography.size.sm, fontStyle: 'italic', padding: `${spacing.sm} 0` },
  err: { background: palette.atRiskBg, border: `1px solid ${palette.atRisk}`, borderRadius: radius.sm, padding: `${spacing.sm} ${spacing.md}`, color: palette.text, fontSize: typography.size.sm },
  preview: { display: 'flex', flexDirection: 'column', gap: spacing.md },
  previewSummary: { fontSize: typography.size.sm, color: palette.text },
  okText: { color: palette.clear, fontWeight: typography.weight.bold },
  errText: { color: palette.atRisk, fontWeight: typography.weight.bold },
  errorReport: { background: palette.surfaceAlt, border: `1px solid ${palette.borderStrong}`, borderRadius: radius.sm, padding: `${spacing.sm} ${spacing.md}` },
  errorReportHead: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.bold, marginBottom: spacing.xs },
  errorList: { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 },
  errorItem: { fontSize: typography.size.sm, color: palette.text, lineHeight: typography.lineHeight.snug },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: typography.size.sm, border: `1px solid ${palette.panelBorder}`, borderRadius: radius.sm },
  th: { textAlign: 'left', padding: `${spacing.xs} ${spacing.sm}`, color: palette.textSubtle, textTransform: 'uppercase', fontSize: typography.size.xs, letterSpacing: typography.letterSpacing.label, borderBottom: `1px solid ${palette.divider}` },
  row: { borderBottom: `1px solid ${palette.divider}` },
  td: { padding: `${spacing.xs} ${spacing.sm}`, color: palette.text, borderBottom: `1px solid ${palette.divider}` },
  tdStrong: { padding: `${spacing.xs} ${spacing.sm}`, color: palette.text, fontWeight: typography.weight.semibold, borderBottom: `1px solid ${palette.divider}` },
  actions: { display: 'flex', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap' },
  cancelBtn: { background: palette.surfaceAlt, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, fontFamily: typography.family, cursor: 'pointer' },
  downloadReportBtn: { alignSelf: 'flex-start', background: palette.surface, color: palette.cobalt, border: `1px solid ${palette.border}`, borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.size.xs, fontWeight: typography.weight.semibold, fontFamily: typography.family, cursor: 'pointer' },
  confirmBtn: { background: palette.cobalt, color: palette.cobaltFg, border: 'none', borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.lg}`, fontSize: typography.size.sm, fontWeight: typography.weight.bold, fontFamily: typography.family, cursor: 'pointer' },
  confirmBtnDisabled: { background: palette.surfaceAlt, color: palette.textSubtle, border: `1px solid ${palette.border}`, borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.lg}`, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, fontFamily: typography.family, cursor: 'not-allowed' },
  result: { display: 'flex', flexDirection: 'column', gap: spacing.md },
  ok: { background: palette.clearBg, border: `1px solid ${palette.clear}`, borderRadius: radius.sm, padding: `${spacing.sm} ${spacing.md}`, color: palette.text, fontSize: typography.size.sm },
  warn: { background: palette.atRiskBg, border: `1px solid ${palette.atRisk}`, borderRadius: radius.sm, padding: `${spacing.sm} ${spacing.md}`, color: palette.text, fontSize: typography.size.sm },
};
