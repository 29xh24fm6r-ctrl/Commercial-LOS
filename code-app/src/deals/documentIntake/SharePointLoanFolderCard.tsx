import type { CSSProperties } from 'react';
import type { DealFolderStatus, DealSharePointFolderIdentity } from '../documentStorage/dealDocumentStorageTypes';
import { palette, radius, spacing, typography } from '../../shared/theme';

const LABEL: Record<DealFolderStatus, string> = { NOT_CREATED: 'Not Created', CREATING: 'Creating', READY: 'Ready', UNAVAILABLE: 'Unavailable', CONFIGURATION_REQUIRED: 'Configuration Required', FAILED: 'Failed' };
export interface SharePointDryRunUiState {
  readonly available: boolean;
  readonly running?: boolean;
  readonly detail?: string;
  readonly outcome?: 'validated' | 'blocked';
  readonly onValidate?: () => void;
}
export function SharePointLoanFolderCard({ status, folder, canCreate, onCreate, onRetry, dryRun }: { readonly status: DealFolderStatus; readonly folder?: DealSharePointFolderIdentity; readonly canCreate: boolean; readonly onCreate?: () => void; readonly onRetry?: () => void; readonly dryRun?: SharePointDryRunUiState }) {
  const open = () => { if (folder?.status === 'READY' && folder.folderUrl) window.open(folder.folderUrl, '_blank', 'noopener,noreferrer'); };
  const copy = async () => { if (folder?.status === 'READY' && folder.folderUrl) await navigator.clipboard.writeText(folder.folderUrl); };
  return <section style={styles.card} aria-label="SharePoint loan folder" data-sharepoint-loan-folder-status={status}>
    <div><p style={styles.eyebrow}>SharePoint loan folder</p><h3 style={styles.title}>{LABEL[status]}</h3><p style={styles.detail}>{folder?.companyFolderPath ?? 'Business Lending / Documents / (a) Loans — list data source registered; live file transport not configured.'}</p>
      {dryRun ? <p role={'status'} style={styles.detail} data-sharepoint-dry-run-outcome={dryRun.outcome ?? 'not-run'}><strong>DRY_RUN validation only.</strong> {dryRun.detail ?? 'No folder or file will be created, and no document requirement will be satisfied.'}</p> : null}
    </div>
    <div style={styles.actions}>
      {status === 'NOT_CREATED' && <button disabled={!canCreate} onClick={onCreate}>Create SharePoint Loan Folder</button>}
      {status === 'FAILED' && <button disabled={!canCreate} onClick={onRetry}>Retry Folder Creation</button>}
      {dryRun ? <button disabled={!dryRun.available || dryRun.running} onClick={dryRun.onValidate}>{dryRun.running ? 'Validating…' : 'Validate SharePoint Setup (No Write)'}</button> : null}
      <button disabled={status !== 'READY'} onClick={open}>Open SharePoint Loan Folder</button>
      <button disabled={status !== 'READY'} onClick={() => void copy()}>Copy Folder Link</button>
    </div>
  </section>;
}
const styles: Record<string, CSSProperties> = { card: { display: 'flex', justifyContent: 'space-between', gap: spacing.lg, padding: spacing.lg, background: palette.surfaceAlt, border: `1px solid ${palette.border}`, borderRadius: radius.md }, eyebrow: { margin: 0, fontSize: typography.size.xs, textTransform: 'uppercase', color: palette.textSubtle }, title: { margin: `${spacing.xxs} 0`, color: palette.text }, detail: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm }, actions: { display: 'flex', flexWrap: 'wrap', gap: spacing.xs, alignItems: 'center' } };
