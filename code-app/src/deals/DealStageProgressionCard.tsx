import { useDealData } from './DealDataProvider';
import {
  deriveStageProgressionEligibility,
  type ProgressionEligibilityResult,
  type ProgressionEligibilityStatus,
} from './stageProgressionGuard';
import { stageProgressionAvailability } from '../shared/governance/stageProgressionAvailability';
import { STAGE_CATALOG } from '../shared/stages/stageCatalog';
import { Card, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { SeverityGlyph } from '../shared/SeverityGlyph';
import { GlassPanel, WidgetHeader } from '../shared/cockpitPrimitives';
import { StageIcon } from '../shared/cockpitIcons';
import {
  palette,
  severityPalette,
  radius,
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

  // Phase 28: the Advance Stage write is intentionally not shipped
  // because the schema does not expose a deterministic next-stage
  // ordering. See src/shared/governance/stageProgressionAvailability.ts
  // for the full audit and the future-extension contract.
  const availability = stageProgressionAvailability();

  const sev = statusToSeverity(eligibility.status);
  const accent = severityPalette[sev].bar;

  return (
    <Card accentColor={accent}>
      <WidgetHeader
        title="Stage Map"
        subtitle={
          eligibility.currentStage
            ? `Current stage: ${eligibility.currentStage}`
            : 'Current stage: —'
        }
        icon={<StageIcon />}
        iconTone="info"
        trailing={<Badge variant={sev}>{statusLabel(eligibility.status)}</Badge>}
      />

      <StageMap currentStage={eligibility.currentStage} />

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

      {!availability.available && (
        <div style={styles.schemaLimitationBox} role="status" aria-label="Stage progression write availability">
          <div style={styles.schemaLimitationLabel}>{availability.banner}</div>
          <p style={styles.schemaLimitationDetail}>{availability.detail}</p>
        </div>
      )}

      <CardFooter>
        <span>
          Derived from authorized deal, task, document, credit-memo, and activity records.
        </span>
        <span>Decision support only — no stage update is performed by this card.</span>
      </CardFooter>
    </Card>
  );
}

/**
 * Phase 125D — Stage Map.
 *
 * Replaces the Phase 125C horizontal pill rail with a connected-
 * node "stage map": each canonical non-terminal STAGE_CATALOG
 * stage is rendered as a circular node with a horizontal
 * connector line between consecutive nodes. The connector
 * between two "past" nodes paints green (canonical-order
 * completion); the connector adjacent to the current node
 * blends past-green into cobalt; future connectors paint as
 * muted dashed neutrals. The current node is sized up and
 * given a cobalt ring + bold label.
 *
 * Custom-stage fallback (Phase 121 sparse-seed path: live
 * `cr664_dealstagereference` carries an operator-named stage
 * that doesn't match the canonical catalog) renders the map
 * with every node in muted-future tone + a "custom stage —
 * not in canonical sequence" footnote, so the banker still
 * sees the canonical landmarks without the cockpit fabricating
 * progression state.
 *
 * Visual contract:
 *   - Number badge inside each node so the canonical order is
 *     glanceable (1..9).
 *   - Stage label below the node (uppercase, tiny letter-
 *     spacing) so the map reads as a labeled axis.
 *   - aria-current="step" remains on the current node.
 *   - No animation; the cockpit is read, not played.
 *   - No fabricated progression, no AI estimate, no predicted
 *     close date.
 */
function StageMap({ currentStage }: { currentStage: string | undefined }) {
  const lanes = STAGE_CATALOG.filter((s) => !s.isTerminal);
  const normalizedCurrent = currentStage?.trim().toLowerCase();
  const currentIndex = lanes.findIndex(
    (s) =>
      s.id === normalizedCurrent ||
      s.label.toLowerCase() === normalizedCurrent,
  );
  const isCustomStage = normalizedCurrent && currentIndex < 0;
  return (
    <div style={styles.mapWrap} data-stage-map="cockpit">
      <ol style={styles.map} aria-label="Canonical stage progression map">
        {lanes.map((s, i) => {
          const tone: 'past' | 'current' | 'future' =
            currentIndex < 0
              ? 'future'
              : i < currentIndex
                ? 'past'
                : i === currentIndex
                  ? 'current'
                  : 'future';
          // Connector tone: between this node and the previous
          // one. The connector colors paint past = green,
          // past→current = green-to-cobalt gradient, future =
          // dashed neutral. (No connector before the first
          // node.)
          const connectorTone: 'past' | 'current' | 'future' | 'none' =
            i === 0
              ? 'none'
              : currentIndex < 0
                ? 'future'
                : i < currentIndex
                  ? 'past'
                  : i === currentIndex
                    ? 'current'
                    : 'future';
          return (
            <li
              key={s.id}
              style={styles.mapItem}
              aria-current={tone === 'current' ? 'step' : undefined}
              aria-label={`${s.label} (${tone})`}
              data-stage-node={tone}
            >
              {connectorTone !== 'none' && (
                <span
                  aria-hidden="true"
                  data-stage-connector={connectorTone}
                  style={
                    connectorTone === 'past'
                      ? styles.connectorPast
                      : connectorTone === 'current'
                        ? styles.connectorCurrent
                        : styles.connectorFuture
                  }
                />
              )}
              <span
                style={
                  tone === 'current'
                    ? styles.nodeCurrent
                    : tone === 'past'
                      ? styles.nodePast
                      : styles.nodeFuture
                }
              >
                {i + 1}
              </span>
              <span
                style={
                  tone === 'current'
                    ? styles.nodeLabelCurrent
                    : styles.nodeLabel
                }
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>
      {isCustomStage && (
        <div style={styles.railCustomNote}>
          Current: <strong>{currentStage}</strong> (custom stage —
          not in canonical sequence)
        </div>
      )}
    </div>
  );
}

function NextActionBlock({ eligibility }: { eligibility: ProgressionEligibilityResult }) {
  const sev = statusToSeverity(eligibility.status);
  const p = severityPalette[sev];
  // Phase 125D — wrap the next-action guidance in a "command
  // strip": a GlassPanel with a thicker severity-tinted left
  // edge so the strip reads as a cockpit guidance bar, not as
  // a faint instructional note.
  return (
    <GlassPanel
      style={{
        borderLeft: `4px solid ${p.bar}`,
        background: p.bg,
      }}
    >
      <div style={{ ...styles.nextActionLabel, color: p.fg }}>
        Next action guidance
      </div>
      <p style={styles.nextActionText}>{eligibility.nextActionGuidance}</p>
    </GlassPanel>
  );
}

function ReasonRow({ reason }: { reason: ProgressionEligibilityResult['reasons'][number] }) {
  const sev: SeverityKey = reason.severity === 'blocked' ? 'blocked' : 'atRisk';
  const p = severityPalette[sev];
  return (
    <li
      style={{
        ...styles.signal,
        borderLeft: `3px solid ${p.bar}`,
      }}
    >
      <SeverityGlyph severity={sev} />
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
    padding: `${spacing.sm} ${spacing.md}`,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
  },
  signalBody: { display: 'flex', flexDirection: 'column', gap: 2 },
  signalLabel: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
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
  schemaLimitationBox: {
    background: palette.neutralBg,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  schemaLimitationLabel: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: palette.neutralFg,
  },
  schemaLimitationDetail: {
    margin: 0,
    fontSize: typography.size.xs,
    color: palette.textMuted,
    lineHeight: typography.lineHeight.snug,
  },
  // Phase 125E — large connected-node Stage Map. Bigger nodes
  // (44px), thicker connectors (3px), display-scale numbers, and
  // a bigger current-node halo so the map reads as a true
  // graphical cockpit module — not a thin pill rail.
  mapWrap: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.sm,
    padding: `${spacing.sm} 0`,
  },
  map: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexWrap: 'wrap' as const,
    rowGap: spacing.md,
    columnGap: 0,
    alignItems: 'flex-start',
  },
  mapItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: spacing.xs,
    position: 'relative' as const,
    flex: '1 1 96px',
    minWidth: 76,
  },
  connectorPast: {
    position: 'absolute' as const,
    left: '-50%',
    right: '50%',
    top: 22,
    height: 3,
    background: palette.clear,
    borderRadius: 1.5,
  },
  connectorCurrent: {
    position: 'absolute' as const,
    left: '-50%',
    right: '50%',
    top: 22,
    height: 3,
    background: `linear-gradient(90deg, ${palette.clear}, ${palette.cobalt})`,
    borderRadius: 1.5,
  },
  connectorFuture: {
    position: 'absolute' as const,
    left: '-50%',
    right: '50%',
    top: 22,
    height: 3,
    borderTop: `2px dashed ${palette.border}`,
  },
  nodePast: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    background: palette.clearBg,
    color: palette.clearFg,
    border: `2px solid ${palette.clear}`,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    fontVariantNumeric: 'tabular-nums' as const,
    zIndex: 1,
  },
  nodeCurrent: {
    width: 52,
    height: 52,
    borderRadius: '50%',
    background: palette.cobalt,
    color: palette.textInverse,
    border: `3px solid ${palette.cobalt}`,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    fontVariantNumeric: 'tabular-nums' as const,
    boxShadow: `0 0 0 6px ${palette.cobaltBg}, 0 8px 22px rgba(37, 99, 235, 0.32)`,
    zIndex: 1,
  },
  nodeFuture: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    background: palette.surfaceAlt,
    color: palette.textSubtle,
    border: `2px dashed ${palette.border}`,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    fontVariantNumeric: 'tabular-nums' as const,
    zIndex: 1,
  },
  nodeLabel: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase' as const,
    letterSpacing: typography.letterSpacing.label,
    color: palette.textMuted,
    textAlign: 'center' as const,
    fontWeight: typography.weight.semibold,
  },
  nodeLabelCurrent: {
    fontSize: typography.size.sm,
    textTransform: 'uppercase' as const,
    letterSpacing: typography.letterSpacing.label,
    color: palette.cobaltFg,
    fontWeight: typography.weight.bold,
    textAlign: 'center' as const,
  },
  railCustomNote: {
    fontSize: typography.size.xs,
    color: palette.textMuted,
    fontStyle: 'italic' as const,
    lineHeight: typography.lineHeight.snug,
  },
};
