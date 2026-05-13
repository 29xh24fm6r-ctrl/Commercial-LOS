import { useDealData } from './DealDataProvider';
import {
  deriveStageProgressionEligibility,
  type ProgressionEligibilityResult,
  type ProgressionEligibilityStatus,
} from './stageProgressionGuard';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge, StatusDot } from '../shared/Badge';
import {
  palette,
  severityPalette,
  spacing,
  typography,
  type SeverityKey,
} from '../shared/theme';

/**
 * Phase 27: read-only stage progression eligibility card. Mirrors the
 * DealBlockers shape (badge in trailing slot, list of signals) so the
 * banker reads the two cards together. Renders nothing actionable —
 * no Move Stage, no Submit, no Approve. The card is decision support,
 * not a control surface.
 */
export function DealStageProgressionCard() {
  const { deal, tasks, documents, creditMemo, activity } = useDealData();
  const tasksData = tasks.kind === 'ready' ? tasks.data : undefined;
  const documentsData = documents.kind === 'ready' ? documents.data : undefined;
  const creditMemoData = creditMemo.kind === 'ready' ? creditMemo.data : undefined;
  const activityData = activity.kind === 'ready' ? activity.data : undefined;

  const eligibility = deriveStageProgressionEligibility({
    deal,
    tasks: tasksData,
    documents: documentsData,
    creditMemo: creditMemoData,
    activity: activityData,
  });

  const sev = statusToSeverity(eligibility.status);
  const accent = severityPalette[sev].bar;

  return (
    <Card accentColor={accent}>
      <CardHeader
        title="Stage Progression Guard"
        subtitle={
          eligibility.currentStage
            ? `Current stage: ${eligibility.currentStage}`
            : 'Current stage: —'
        }
        trailing={<Badge variant={sev}>{statusLabel(eligibility.status)}</Badge>}
      />

      {eligibility.reasons.length === 0 ? (
        <p style={styles.cleanMessage}>
          No data signals are currently blocking forward progression. Banker review still
          required before any stage movement.
        </p>
      ) : (
        <ul style={styles.list}>
          {eligibility.reasons.map((r) => (
            <ReasonRow key={r.id} reason={r} />
          ))}
        </ul>
      )}

      <NextActionBlock eligibility={eligibility} />

      <CardFooter>
        <span>
          Derived from authorized deal, task, document, credit-memo, and activity records.
        </span>
        <span>Decision support only — no stage update is performed by this card.</span>
      </CardFooter>
    </Card>
  );
}

function NextActionBlock({ eligibility }: { eligibility: ProgressionEligibilityResult }) {
  const sev = statusToSeverity(eligibility.status);
  const p = severityPalette[sev];
  return (
    <div style={{ ...styles.nextActionBox, borderColor: p.bar, background: p.bg }}>
      <div style={{ ...styles.nextActionLabel, color: p.fg }}>Next action guidance</div>
      <p style={styles.nextActionText}>{eligibility.nextActionGuidance}</p>
    </div>
  );
}

function ReasonRow({ reason }: { reason: ProgressionEligibilityResult['reasons'][number] }) {
  const sev: SeverityKey = reason.severity === 'blocked' ? 'blocked' : 'atRisk';
  const p = severityPalette[sev];
  return (
    <li style={styles.signal}>
      <StatusDot variant={sev} />
      <div style={styles.signalBody}>
        <div style={{ ...styles.signalLabel, color: p.fg }}>{reason.label}</div>
      </div>
    </li>
  );
}

function statusToSeverity(s: ProgressionEligibilityStatus): SeverityKey {
  if (s === 'blocked') return 'blocked';
  if (s === 'at-risk') return 'atRisk';
  return 'clear';
}

function statusLabel(s: ProgressionEligibilityStatus): string {
  if (s === 'blocked') return 'Appears blocked';
  if (s === 'at-risk') return 'Review needed';
  return 'Appears clear';
}

const styles: Record<string, React.CSSProperties> = {
  cleanMessage: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.base,
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  signal: {
    display: 'flex',
    gap: spacing.sm,
    alignItems: 'flex-start',
    paddingTop: 6,
  },
  signalBody: { display: 'flex', flexDirection: 'column', gap: 2 },
  signalLabel: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
  },
  nextActionBox: {
    borderWidth: 1,
    borderStyle: 'solid',
    borderRadius: 6,
    padding: `${spacing.xs} ${spacing.md}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  nextActionLabel: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    fontWeight: typography.weight.semibold,
  },
  nextActionText: {
    margin: 0,
    fontSize: typography.size.md,
    color: palette.text,
    lineHeight: typography.lineHeight.snug,
  },
};
