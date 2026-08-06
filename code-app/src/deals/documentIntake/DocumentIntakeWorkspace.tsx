import type { ReactNode } from 'react';
import type { UnderwritingIntakeReadiness } from './documentIntakeReadiness';
import { DocumentIntakeSummary } from './DocumentIntakeSummary';
import { SharePointLoanFolderCard, type SharePointDryRunUiState } from './SharePointLoanFolderCard';
import { DueDiligenceChecklist } from './DueDiligenceChecklist';
import { spacing } from '../../shared/theme';
export function DocumentIntakeWorkspace({ companyLegalName, dealNumber, readiness, children, sharePointDryRun }: { readonly companyLegalName?: string; readonly dealNumber?: string; readonly readiness: UnderwritingIntakeReadiness; readonly children: ReactNode; readonly sharePointDryRun?: SharePointDryRunUiState }) {
  return <section aria-label="Document Intake" data-document-intake-workspace style={{ display: 'grid', gap: spacing.md }}>
    <DocumentIntakeSummary companyLegalName={companyLegalName} dealNumber={dealNumber} readiness={readiness} />
    <SharePointLoanFolderCard status="CONFIGURATION_REQUIRED" canCreate={false} dryRun={sharePointDryRun} />
    {children}
    <DueDiligenceChecklist />
  </section>;
}
