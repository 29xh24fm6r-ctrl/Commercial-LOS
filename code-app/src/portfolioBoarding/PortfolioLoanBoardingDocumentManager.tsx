import type { CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { PortfolioLoanBoardingPackage } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';
import { PortfolioLoanBoardingDocumentInventory } from './PortfolioLoanBoardingDocumentInventory';
import {
  usePortfolioLoanDocumentPersistence,
  type PortfolioBoardingDocumentAdapter,
} from './usePortfolioLoanDocumentPersistence';

interface Props {
  package: PortfolioLoanBoardingPackage;
  loanId: string | undefined;
  documentAdapter: PortfolioBoardingDocumentAdapter;
  documentMetadataEnabled: boolean;
}

/**
 * Phase 140N — document metadata manager. Composes the read-only inventory and
 * exposes a governed "record metadata" action that goes ONLY through the
 * injected document adapter. Binary upload is never faked.
 */
export function PortfolioLoanBoardingDocumentManager({
  package: pkg,
  loanId,
  documentAdapter,
  documentMetadataEnabled,
}: Props) {
  const docs = usePortfolioLoanDocumentPersistence(documentAdapter, {
    documentMetadataEnabled,
  });

  const firstDoc = pkg.documents?.documents?.[0];

  return (
    <Card>
      <CardHeader title="Documents" subtitle="Metadata persistence (no binary upload)" />
      <PortfolioLoanBoardingDocumentInventory package={pkg} />
      <div style={statusStyle}>
        <span style={docs.uploadConfigured ? okStyle : warnStyle}>
          {docs.uploadConfigured ? 'File upload configured' : 'File upload not configured'}
        </span>
        <button
          type="button"
          disabled={!docs.enabled || !loanId || !firstDoc}
          aria-disabled={!docs.enabled || !loanId || !firstDoc}
          style={docs.enabled && loanId && firstDoc ? buttonStyle : disabledButtonStyle}
          onClick={() => {
            if (loanId && firstDoc) void docs.addDocument(loanId, firstDoc);
          }}
        >
          Record document metadata
        </button>
        {docs.state.kind === 'failure' && (
          <span style={failureStyle} role="alert">
            {docs.state.message ?? docs.state.errorCode}
          </span>
        )}
        {docs.state.kind === 'success' && (
          <span style={okStyle} role="status">Document metadata recorded.</span>
        )}
      </div>
      <CardFooter>
        <span>Metadata only — no file binary is uploaded and no file link is faked.</span>
      </CardFooter>
    </Card>
  );
}

const statusStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap', marginTop: spacing.sm };
const okStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.clearFg };
const warnStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.atRiskFg, fontStyle: 'italic' };
const failureStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.blockedFg };
const buttonStyle: CSSProperties = {
  fontSize: typography.size.sm,
  fontWeight: typography.weight.semibold,
  color: palette.clearFg,
  background: palette.clearBg,
  border: `1px solid ${palette.border}`,
  borderRadius: 6,
  padding: `${spacing.xs} ${spacing.md}`,
  cursor: 'pointer',
};
const disabledButtonStyle: CSSProperties = {
  ...buttonStyle,
  color: palette.textSubtle,
  background: palette.surface,
  cursor: 'not-allowed',
};
