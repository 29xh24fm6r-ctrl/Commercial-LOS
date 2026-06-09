import type { CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type {
  AnnualReviewMemoPackage,
  AnnualReviewBoardPackage,
  AnnualReviewFdicPackage,
  AnnualReviewPackageReadiness,
} from './annualReviewPackageTypes';

interface Props {
  memo: AnnualReviewMemoPackage;
  board: AnnualReviewBoardPackage;
  fdic: AnnualReviewFdicPackage;
  readiness: AnnualReviewPackageReadiness;
}

/**
 * Phase 141P — Annual review package preview panel (read-only).
 *
 * Shows package readiness, draft memo sections, board/FDIC readiness, the
 * evidence index summary, blockers, caveats, and next best actions. There is NO
 * approve / submit / file / send / export-final / waive / override / upload /
 * email / SMS affordance. It loads no data and writes nothing.
 */
export function AnnualReviewPackagePreviewPanel({ memo, board, fdic, readiness }: Props) {
  return (
    <Card>
      <CardHeader title="Annual review packages (draft preview)" subtitle={label(memo.status)} />

      <div style={bannerStyle}>
        Draft only — no approval, submission, filing, export, or covenant waiver occurs here.
      </div>

      <dl style={metaStyle}>
        <Row label="Memo" value={label(memo.status)} />
        <Row label="Board package" value={label(board.status)} />
        <Row label="FDIC package" value={label(fdic.status)} />
        <Row label="Financials complete" value={yn(readiness.financialsComplete)} />
        <Row label="Covenants complete" value={yn(readiness.covenantsComplete)} />
        <Row label="Evidence complete" value={yn(readiness.evidenceComplete)} />
      </dl>

      <div style={sectionStyle}>
        <span style={sectionTitleStyle}>Memo draft sections</span>
        <ul style={ulStyle}>
          {memo.sections.map((s) => (
            <li key={s.key} style={itemStyle}>{s.title}</li>
          ))}
        </ul>
      </div>

      <div style={sectionStyle}>
        <span style={sectionTitleStyle}>Board package sections</span>
        <ul style={ulStyle}>
          {board.sections.map((s) => (
            <li key={s.key} style={itemStyle}>{s.title}</li>
          ))}
        </ul>
      </div>

      <div style={sectionStyle}>
        <span style={sectionTitleStyle}>FDIC / examiner package sections</span>
        <ul style={ulStyle}>
          {fdic.sections.map((s) => (
            <li key={s.key} style={itemStyle}>{s.title}</li>
          ))}
        </ul>
      </div>

      {readiness.caveats.length > 0 && (
        <div style={sectionStyle}>
          <span style={sectionTitleStyle}>Caveats</span>
          <ul style={ulStyle}>
            {readiness.caveats.map((c) => (
              <li key={c.code} style={itemStyle}>{c.message}</li>
            ))}
          </ul>
        </div>
      )}

      {readiness.blockers.length > 0 && (
        <div style={sectionStyle}>
          <span style={blockerTitleStyle}>Blockers</span>
          <ul style={ulStyle}>
            {readiness.blockers.map((b) => (
              <li key={b.code} style={blockerItemStyle}>{b.message}</li>
            ))}
          </ul>
        </div>
      )}

      <CardFooter>
        <span>{readiness.nextBestActions[0] ? `Next: ${readiness.nextBestActions[0].label}` : 'Read-only preview.'}</span>
      </CardFooter>
    </Card>
  );
}

function label(s: string): string {
  return s.replace(/_/g, ' ');
}
function yn(v: boolean): string {
  return v ? 'Yes' : 'No';
}

function Row({ label: l, value }: { label: string; value: string | undefined }) {
  return (
    <div style={rowStyle}>
      <dt style={dtStyle}>{l}</dt>
      <dd style={ddStyle}>{value ?? 'Not set'}</dd>
    </div>
  );
}

const bannerStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.atRiskFg, background: palette.atRiskBg, padding: spacing.sm, borderRadius: 4, marginBottom: spacing.sm };
const metaStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, margin: 0 };
const rowStyle: CSSProperties = { display: 'flex', gap: spacing.md };
const dtStyle: CSSProperties = { minWidth: 160, fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ddStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.text };
const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginTop: spacing.sm };
const sectionTitleStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const blockerTitleStyle: CSSProperties = { ...sectionTitleStyle, color: palette.blockedFg };
const ulStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const itemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const blockerItemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.blockedFg };
