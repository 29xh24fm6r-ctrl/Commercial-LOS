import type { CSSProperties } from 'react';
import { Card, CardHeader } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { PortfolioLoanBoardingPackage } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';
import { FdicEvidenceIndex } from './FdicEvidenceIndex';
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
 * Phase 140N — evidence manager. Shows the evidence index and persists evidence
 * links ONLY through the injected adapter. No fake evidence.
 */
export function PortfolioLoanBoardingEvidenceManager({
  package: pkg,
  loanId,
  documentAdapter,
  documentMetadataEnabled,
}: Props) {
  const docs = usePortfolioLoanDocumentPersistence(documentAdapter, {
    documentMetadataEnabled,
  });
  const firstEvidence = pkg.evidenceLinks?.[0];

  return (
    <Card>
      <CardHeader title="Evidence" subtitle="Evidence links persisted through the adapter" />
      <FdicEvidenceIndex package={pkg} />
      <div style={statusStyle}>
        <button
          type="button"
          disabled={!docs.enabled || !loanId || !firstEvidence}
          aria-disabled={!docs.enabled || !loanId || !firstEvidence}
          style={docs.enabled && loanId && firstEvidence ? buttonStyle : disabledButtonStyle}
          onClick={() => {
            if (loanId && firstEvidence) void docs.addEvidence(loanId, firstEvidence);
          }}
        >
          Persist evidence link
        </button>
        {docs.state.kind === 'failure' && (
          <span style={failureStyle} role="alert">
            {docs.state.message ?? docs.state.errorCode}
          </span>
        )}
        {docs.state.kind === 'success' && (
          <span style={okStyle} role="status">Evidence link persisted.</span>
        )}
      </div>
    </Card>
  );
}

const statusStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap', marginTop: spacing.sm };
const okStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.clearFg };
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
