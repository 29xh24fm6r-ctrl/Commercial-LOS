import type { CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { PortfolioLoanDocumentUploadAdapter } from './portfolioLoanDocumentUploadAdapter';

interface Props {
  uploadAdapter?: PortfolioLoanDocumentUploadAdapter;
}

export function PortfolioLoanBoardingDocumentUploadPanel({ uploadAdapter }: Props) {
  const enabled = uploadAdapter?.enabled === true;

  return (
    <Card>
      <CardHeader
        title="Document Upload"
        subtitle={enabled ? 'Upload adapter connected' : 'Upload adapter not configured'}
      />
      {!enabled && (
        <div role="status" style={notConfiguredStyle}>
          <p style={titleStyle}>Document upload not configured</p>
          <p style={detailStyle}>
            The document upload adapter has not been registered for this
            environment. Documents cannot be uploaded until the adapter is configured.
          </p>
        </div>
      )}
      {enabled && (
        <p style={readyStyle}>
          Upload adapter connected. Document upload form will render here when
          section editors are wired.
        </p>
      )}
      <CardFooter>
        <span>No direct Dataverse call. No connector call. Upload goes through adapter only.</span>
      </CardFooter>
    </Card>
  );
}

const notConfiguredStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.sm, padding: spacing.lg, textAlign: 'center' };
const titleStyle: CSSProperties = { margin: 0, fontSize: typography.size.md, fontWeight: typography.weight.semibold, color: palette.text };
const detailStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textMuted };
const readyStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textMuted, fontStyle: 'italic' };
