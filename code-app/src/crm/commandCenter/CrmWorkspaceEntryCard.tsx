import type { CSSProperties } from 'react';
import { Card, CardHeader } from '../../shared/Card';
import { palette, spacing, typography, radius } from '../../shared/theme';

interface Props {
  /** Whether the CRM Command Center route is safely mounted. */
  routeAvailable: boolean;
  /** Route href if available. */
  routeHref?: string;
}

/**
 * Phase 147E — CRM workspace entry card.
 * Placed inside existing authorized workspaces to provide CRM Command Center access.
 * No permission widening. No write action text.
 */
export function CrmWorkspaceEntryCard({ routeAvailable, routeHref }: Props) {
  return (
    <Card>
      <CardHeader
        title="CRM Command Center"
        subtitle="CRM and lending workflow preview intelligence"
      />
      <p style={descStyle}>
        Review source-of-truth, matching, sync preview, and dry-run posture.
      </p>
      {routeAvailable && routeHref ? (
        <a href={routeHref} style={linkStyle}>
          Open CRM Command Center
        </a>
      ) : (
        <p style={unavailableStyle}>
          CRM Command Center route not mounted in this workspace. Contact your administrator for access.
        </p>
      )}
      <p style={safetyStyle}>
        Read-only preview intelligence. No sync, push, or write actions.
      </p>
    </Card>
  );
}

const descStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textMuted, lineHeight: typography.lineHeight.snug };
const linkStyle: CSSProperties = { display: 'inline-block', padding: `${spacing.sm} ${spacing.lg}`, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: palette.primaryFg, background: palette.primary, borderRadius: radius.sm, textDecoration: 'none', marginTop: spacing.sm };
const unavailableStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
const safetyStyle: CSSProperties = { margin: 0, fontSize: typography.size.xs, color: palette.textSubtle, fontStyle: 'italic', marginTop: spacing.sm };
