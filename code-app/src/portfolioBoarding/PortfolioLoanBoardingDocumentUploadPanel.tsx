import { useRef, useState, type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import { PORTFOLIO_LOAN_DOCUMENTS } from '../shared/portfolioBoarding/portfolioLoanDocumentCatalog';
import type { PortfolioLoanDocumentRecord } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';
import type { DocumentUploadResult } from './usePortfolioLoanDocumentPersistence';

/**
 * Phase 264 (P0) — real document upload UI.
 *
 * Replaces the "form will render here when section editors are wired"
 * placeholder with an actual file input + document-type picker, wired to
 * `usePortfolioLoanDocumentPersistence().uploadDocument`. Renders honestly by
 * upload state:
 *   - not configured (flag off): unchanged "not configured" copy.
 *   - configured, DRY_RUN: the real form, with a visible "DRY RUN" badge and
 *     copy stating no file is actually stored yet.
 *   - configured, LIVE: the real form, with a "LIVE" badge.
 * Never claims a file was stored when it wasn't (DRY_RUN's result always has
 * `fileReference: undefined` — the confirmation copy reflects that exactly).
 */

interface Props {
  readonly loanId: string | undefined;
  readonly loanNumber: string | undefined;
  readonly borrowerLegalName: string | undefined;
  readonly uploadConfigured: boolean;
  readonly uploadMode: 'DRY_RUN' | 'LIVE';
  /** Whether a real SharePoint connector is wired. False for DRY_RUN (expected) and for LIVE-not-registered. */
  readonly connectorAvailable: boolean;
  readonly uploadDocument: (
    loanId: string,
    upload: {
      loanNumber: string;
      borrowerLegalName: string | undefined;
      documentType: string;
      fileName: string;
      contentType: string;
      content: Uint8Array;
      correlationId: string;
    },
    doc: PortfolioLoanDocumentRecord,
  ) => Promise<DocumentUploadResult>;
}

type UploadUiState =
  | { kind: 'idle' }
  | { kind: 'uploading' }
  | { kind: 'done'; result: DocumentUploadResult }
  | { kind: 'error'; message: string };

function newCorrelationId(): string {
  return `sp-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export function PortfolioLoanBoardingDocumentUploadPanel({
  loanId,
  loanNumber,
  borrowerLegalName,
  uploadConfigured,
  uploadMode,
  connectorAvailable,
  uploadDocument,
}: Props) {
  const [documentType, setDocumentType] = useState<string>(PORTFOLIO_LOAN_DOCUMENTS[0]?.documentType ?? 'other');
  const [ui, setUi] = useState<UploadUiState>({ kind: 'idle' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // LIVE mode selected + flag on, but no real connector wired: a fail-closed state, explained
  // proactively (never a fake DRY_RUN success, never a crash).
  const liveButNoConnector = uploadConfigured && uploadMode === 'LIVE' && !connectorAvailable;
  const canUpload = uploadConfigured && !liveButNoConnector && Boolean(loanId) && Boolean(loanNumber);

  async function onFileSelected(file: File) {
    if (!loanId || !loanNumber) return;
    if (ui.kind === 'uploading') return; // guard against duplicate submission while a file is in flight
    setUi({ kind: 'uploading' });
    try {
      const buffer = await file.arrayBuffer();
      const result = await uploadDocument(
        loanId,
        {
          loanNumber,
          borrowerLegalName,
          documentType,
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          content: new Uint8Array(buffer),
          correlationId: newCorrelationId(),
        },
        { documentType: documentType as PortfolioLoanDocumentRecord['documentType'], documentName: file.name },
      );
      if (result.ok) setUi({ kind: 'done', result });
      else setUi({ kind: 'error', message: result.message ?? 'Upload failed.' });
    } catch (err: unknown) {
      setUi({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <Card>
      <CardHeader
        title="Document Upload"
        subtitle={canUpload ? `Upload adapter connected — ${uploadMode}` : 'Upload adapter not configured'}
      />
      {liveButNoConnector && (
        <div role="status" style={notConfiguredStyle} data-portfolio-upload-connector-missing>
          <p style={titleStyle}>SharePoint connector not registered</p>
          <p style={detailStyle}>
            LIVE mode is selected, but the SharePoint Online connector has not been registered or wired
            for this app yet. No file can be stored until an operator adds the SharePoint Online data
            source, regenerates the SDK, and wires the connector. Nothing was stored.
          </p>
        </div>
      )}
      {!liveButNoConnector && !canUpload && (
        <div role="status" style={notConfiguredStyle} data-portfolio-upload-not-configured>
          <p style={titleStyle}>Document upload not configured</p>
          <p style={detailStyle}>
            {uploadConfigured
              ? 'A loan must be selected before a document can be uploaded.'
              : 'The document upload feature is not enabled for this environment. Documents cannot be uploaded until it is.'}
          </p>
        </div>
      )}

      {canUpload && (
        <div style={formStyle} data-portfolio-upload-form>
          {uploadMode === 'DRY_RUN' && (
            <p style={dryRunBannerStyle} data-portfolio-upload-dry-run-banner>
              DRY RUN — no SharePoint connector is wired yet. This validates the file and records the
              attempt, but no file is actually stored and no link is created.
            </p>
          )}

          <label style={labelStyle}>
            Document type
            <select
              style={selectStyle}
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              data-portfolio-upload-document-type
            >
              {PORTFOLIO_LOAN_DOCUMENTS.map((d) => (
                <option key={d.documentType} value={d.documentType}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>

          <input
            ref={fileInputRef}
            type="file"
            data-portfolio-upload-file
            disabled={ui.kind === 'uploading'}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFileSelected(f);
            }}
          />

          {ui.kind === 'uploading' && (
            <p style={mutedStyle} data-portfolio-upload-pending>
              Uploading…
            </p>
          )}
          {ui.kind === 'done' && (
            ui.result.fileReference ? (
              // LIVE success: render a real, safe link to the genuine URL the connector returned.
              // The URL is never constructed here — it comes straight from the upload result.
              <p style={okStyle} role="status" data-portfolio-upload-done>
                Uploaded. Stored at{' '}
                <a
                  href={ui.result.fileReference}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-portfolio-upload-link
                >
                  {ui.result.fileReference}
                </a>
              </p>
            ) : (
              <p style={mutedStyle} role="status" data-portfolio-upload-done>
                Recorded (dry-run) — no file was actually stored.
              </p>
            )
          )}
          {ui.kind === 'error' && (
            <p style={errStyle} role="alert" data-portfolio-upload-error>
              Not uploaded — {ui.message}
            </p>
          )}
        </div>
      )}

      <CardFooter>
        <span>No direct Dataverse call bypassing the metadata adapter. Upload goes through the SharePoint port only.</span>
      </CardFooter>
    </Card>
  );
}

const notConfiguredStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.sm, padding: spacing.lg, textAlign: 'center' };
const titleStyle: CSSProperties = { margin: 0, fontSize: typography.size.md, fontWeight: typography.weight.semibold, color: palette.text };
const detailStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textMuted };
const formStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.sm, padding: spacing.md };
const labelStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.xs, fontSize: typography.size.sm, color: palette.text };
const selectStyle: CSSProperties = { padding: spacing.xs, borderRadius: 4, border: `1px solid ${palette.border}`, fontFamily: typography.family };
const dryRunBannerStyle: CSSProperties = { margin: 0, fontSize: typography.size.xs, color: palette.textMuted, background: palette.surfaceAlt, padding: spacing.sm, borderRadius: 4 };
const mutedStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textMuted, fontStyle: 'italic' };
const okStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.text };
const errStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.atRisk };
