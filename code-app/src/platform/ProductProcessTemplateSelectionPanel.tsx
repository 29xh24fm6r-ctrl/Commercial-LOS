import { type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { ProductProcessTemplateDerivationResult } from './productProcessTemplateTypes';
import type { ProductProcessRequirementsResult } from './deriveProductProcessRequirements';
import type { ProductProcessTemplateReadinessResult } from './deriveProductProcessTemplateReadiness';

interface Props {
  selection: ProductProcessTemplateDerivationResult;
  requirements?: ProductProcessRequirementsResult;
  readiness?: ProductProcessTemplateReadinessResult;
  workflowRouteKey?: string;
}

/**
 * Phase 142D — Product / process template selection panel (read-only).
 *
 * Shows the selected primary + companion templates, selection status, merged
 * requirements, workflow route alignment, and next best actions. There is NO
 * apply-template / update-deal / update-route / create-requirements / create-task
 * / approve-committee / write affordance, and no fetch.
 */
export function ProductProcessTemplateSelectionPanel({ selection, requirements, readiness, workflowRouteKey }: Props) {
  return (
    <Card>
      <CardHeader title="Template selection" subtitle={selection.status.replace(/_/g, ' ')} />

      <div style={bannerStyle}>
        Read-only template guidance — no apply, deal/route/product update, requirement/task creation, committee approval, or write occurs here.
      </div>

      <dl style={metaStyle}>
        <Row label="Primary template" value={selection.primaryTemplateKey ?? 'not selected'} />
        <Row label="Companions" value={selection.companionTemplateKeys.join(', ') || 'none'} />
        <Row label="Confidence" value={selection.confidence} />
        {workflowRouteKey && <Row label="Workflow route" value={workflowRouteKey} />}
        {readiness && <Row label="Readiness" value={readiness.readinessStatus.replace(/_/g, ' ')} />}
      </dl>

      {requirements && (
        <div style={sectionStyle}>
          <span style={sectionTitleStyle}>Merged requirements</span>
          <span style={itemStyle}>
            Documents: {requirements.mergedDocumentRequirements.length} · Covenants: {requirements.mergedCovenantTemplates.length} · Evidence: {requirements.mergedEvidenceRequirements.length} · Packages: {requirements.mergedPackageRequirements.length}
          </span>
        </div>
      )}

      {selection.blockers.length > 0 && (
        <div style={sectionStyle}>
          <span style={blockerTitleStyle}>Blockers</span>
          <ul style={ulStyle}>
            {selection.blockers.map((b) => (
              <li key={b.code} style={blockerItemStyle}>{b.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={sectionStyle}>
        <span style={sectionTitleStyle}>Next best actions</span>
        <ul style={ulStyle}>
          {selection.nextBestActions.map((a) => (
            <li key={a.code} style={itemStyle}>{a.label}</li>
          ))}
        </ul>
      </div>

      <CardFooter>
        <span>Template guidance only — never applies a template, mutates a deal/route, or approves credit.</span>
      </CardFooter>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={rowStyle}>
      <dt style={dtStyle}>{label}</dt>
      <dd style={ddStyle}>{value}</dd>
    </div>
  );
}

const bannerStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.atRiskFg, background: palette.atRiskBg, padding: spacing.sm, borderRadius: 4, marginBottom: spacing.sm };
const metaStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, margin: 0 };
const rowStyle: CSSProperties = { display: 'flex', gap: spacing.md };
const dtStyle: CSSProperties = { minWidth: 140, fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ddStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.text };
const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginTop: spacing.sm };
const sectionTitleStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const blockerTitleStyle: CSSProperties = { ...sectionTitleStyle, color: palette.blockedFg };
const ulStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const itemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const blockerItemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.blockedFg };
