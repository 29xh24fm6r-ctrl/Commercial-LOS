import { useAdminData } from './AdminDataProvider';
import {
  deriveReleaseReadiness,
  type ReleaseCategoryRow,
  type ReleaseCategoryStatus,
} from '../shared/governance/releaseReadiness';
import { stageProgressionDiagnostics } from '../shared/governance/stageProgressionAvailability';
import {
  DELIBERATELY_BLOCKED,
  EXEC_TRANSITIONAL_FALLBACK_FEATURES,
  GOVERNED_WRITES,
  LOCAL_ONLY_FLOWS,
  NOT_WIRED,
  PERMISSION_BEFORE_QUERY_VERIFIED,
  WORKSPACE_ISOLATION_VERIFIED,
  type DeliberatelyBlockedEntry,
  type LocalOnlyFlow,
  type NotWiredBlockerKind,
  type NotWiredEntry,
} from '../shared/governance/platformInventory';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge, StatusDot } from '../shared/Badge';
import { adminStyles } from './adminCardChrome';
import {
  palette,
  radius,
  spacing,
  typography,
  type SeverityKey,
} from '../shared/theme';

/**
 * Phase 30: read-only Release Readiness / Governance Gate.
 *
 * Aggregates the diagnostics observable from inside the app and shows
 * an honest gate. Per the brief guardrail, anything that cannot be
 * observed in-app — most importantly build/test status — is marked
 * Not Wired rather than assumed Ready. The card has no actions: no
 * promote button, no overrides, no remediation invocations.
 *
 * Static architectural inputs (workspace isolation,
 * permission-before-query, transitional executive fallback list, and
 * the governed-write inventory) are passed in from this file. Update
 * the constants below as those facts evolve. A future phase that adds
 * a runtime-observable test/build status feed can wire it through
 * deriveReleaseReadiness without touching the categories.
 */

// Phase 40: every non-runtime input above is now sourced from the
// shared platformInventory module so the docs, the test that pins
// known blockers, and this gate all read from one source of truth.
// The constants imported above were previously inline here — the
// rendered behavior is unchanged.
const GOVERNED_WRITES_SHIPPED: readonly { id: string; label: string }[] =
  GOVERNED_WRITES.map((w) => ({ id: w.id, label: w.label }));

export function ReleaseReadinessGate() {
  const { dataQuality, auditAnomalies, alerts, refreshStatus } = useAdminData();

  const dataQualityOpenCount =
    dataQuality.kind === 'ready' ? dataQuality.data.length : undefined;
  const auditAnomalyCount =
    auditAnomalies.kind === 'ready' ? auditAnomalies.data.length : undefined;
  const totalOpenAlerts = alerts.kind === 'ready' ? alerts.data.length : undefined;
  const criticalAlertCount =
    alerts.kind === 'ready'
      ? alerts.data.filter((a) => a.severityKey === 'Critical').length
      : undefined;
  const refreshStatusStaleFlag =
    refreshStatus.kind === 'ready'
      ? refreshStatus.data?.staleDataFlag ?? null
      : undefined;

  const readiness = deriveReleaseReadiness({
    stage: stageProgressionDiagnostics(),
    dataQualityOpenCount,
    auditAnomalyCount,
    criticalAlertCount,
    totalOpenAlerts,
    refreshStatusStaleFlag,
    execTransitionalFallbackFeatures: EXEC_TRANSITIONAL_FALLBACK_FEATURES,
    governedWritesShipped: GOVERNED_WRITES_SHIPPED,
    workspaceIsolationVerified: WORKSPACE_ISOLATION_VERIFIED,
    permissionBeforeQueryVerified: PERMISSION_BEFORE_QUERY_VERIFIED,
  });

  return (
    <Card>
      <CardHeader
        title="Release Readiness Gate"
        subtitle="Aggregated, derived-only governance signal across the platform."
        trailing={
          <Badge variant={statusToSeverity(readiness.overall)}>
            {overallLabel(readiness.overall)}
          </Badge>
        }
      />
      <ul style={adminStyles.list} aria-label="Release readiness categories">
        {readiness.sortedCategories.map((row) => (
          <CategoryRow key={row.id} row={row} />
        ))}
      </ul>
      <CapabilityInventorySection />
      <CardFooter>
        <span>
          Read-only governance gate. No promotion or remediation action is
          performed here.
        </span>
        <span>
          Anything not observable in-app is reported as Not Wired, not assumed
          Ready.
        </span>
      </CardFooter>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Phase 68 — Capability inventory section
//
// Renders the platformInventory.ts canonical data so stakeholders can see
// at a glance:
//   - how many governed writes have shipped (count + a one-line discipline
//     reminder; per-id list intentionally omitted to keep the card lean);
//   - the local-only flows that do real work but never write to Dataverse
//     (each entry's note pinned alongside it);
//   - the not-wired capabilities GROUPED BY blocker kind so connector,
//     schema, governance, observability, and compound blockers are
//     visually distinct — per the Phase 68 brief: "Do not collapse these
//     into one generic blocked category.";
//   - the deliberately-blocked capabilities with their reasons.
//
// Conservative copy (Phase 68): we use the exact labels the brief
// mandated — "handoff", "local-only", "not wired", "upstream blocked",
// "connector not registered", "schema column missing". We never use
// "sent", "delivered", "portal available", "upload available", "live
// email enabled", or "production-ready".
// ---------------------------------------------------------------------------

const BLOCKER_KIND_ORDER: readonly NotWiredBlockerKind[] = [
  'connector',
  'schema',
  'compound',
  'governance',
  'observability',
];

const BLOCKER_KIND_LABEL: Record<NotWiredBlockerKind, string> = {
  connector: 'Connector not registered (upstream blocked)',
  schema: 'Schema column missing (upstream blocked)',
  compound: 'Compound upstream blocker',
  governance: 'Governance non-goal / deferred design decision',
  observability: 'In-app observability not wired',
};

function CapabilityInventorySection() {
  const notWiredByKind = groupNotWiredByKind(NOT_WIRED);
  return (
    <section
      aria-label="Capability inventory"
      style={inventoryStyles.section}
    >
      <h3 style={inventoryStyles.sectionTitle}>
        Capability inventory (read-only)
      </h3>
      <p style={inventoryStyles.sectionLead}>
        Derived from the canonical platformInventory data. The Release
        Readiness Gate above rolls up status; this list shows the discrete
        capability shape behind it.
      </p>

      <InventoryGroup
        groupLabel={`Governed writes (${GOVERNED_WRITES.length})`}
        emptyHint="No governed writes shipped."
      >
        <p style={inventoryStyles.groupDetail}>
          Each shipped governed write follows the audit + timeline +
          correlation-id coordination discipline. The full per-id list lives
          in src/shared/governance/platformInventory.ts (GOVERNED_WRITES).
        </p>
      </InventoryGroup>

      <InventoryGroup
        groupLabel={`Local-only flows (${LOCAL_ONLY_FLOWS.length})`}
        emptyHint="No local-only flows registered."
      >
        <ul style={inventoryStyles.itemList}>
          {LOCAL_ONLY_FLOWS.map((flow) => (
            <LocalOnlyRow key={flow.id} flow={flow} />
          ))}
        </ul>
      </InventoryGroup>

      <InventoryGroup
        groupLabel={`Not wired (${NOT_WIRED.length})`}
        emptyHint="No not-wired capabilities."
      >
        {BLOCKER_KIND_ORDER.map((kind) => {
          const entries = notWiredByKind[kind];
          if (!entries || entries.length === 0) return null;
          return (
            <NotWiredKindSubGroup
              key={kind}
              kind={kind}
              entries={entries}
            />
          );
        })}
      </InventoryGroup>

      <InventoryGroup
        groupLabel={`Deliberately blocked (${DELIBERATELY_BLOCKED.length})`}
        emptyHint="No deliberately-blocked capabilities."
      >
        <ul style={inventoryStyles.itemList}>
          {DELIBERATELY_BLOCKED.map((entry) => (
            <DeliberatelyBlockedRow key={entry.id} entry={entry} />
          ))}
        </ul>
      </InventoryGroup>
    </section>
  );
}

function groupNotWiredByKind(
  entries: readonly NotWiredEntry[],
): Record<NotWiredBlockerKind, NotWiredEntry[]> {
  const out: Record<NotWiredBlockerKind, NotWiredEntry[]> = {
    connector: [],
    schema: [],
    governance: [],
    observability: [],
    compound: [],
  };
  for (const e of entries) out[e.blockerKind].push(e);
  return out;
}

function InventoryGroup({
  groupLabel,
  emptyHint,
  children,
}: {
  groupLabel: string;
  emptyHint: string;
  children: React.ReactNode;
}) {
  return (
    <div style={inventoryStyles.group}>
      <h4 style={inventoryStyles.groupHeading}>{groupLabel}</h4>
      {children ?? <p style={inventoryStyles.emptyHint}>{emptyHint}</p>}
    </div>
  );
}

function LocalOnlyRow({ flow }: { flow: LocalOnlyFlow }) {
  return (
    <li style={inventoryStyles.item}>
      <div style={inventoryStyles.itemHeader}>
        <span style={inventoryStyles.itemLabel}>{flow.label}</span>
        <Badge variant="neutral" appearance="outline">
          Local-only · no Dataverse write
        </Badge>
      </div>
      <p style={inventoryStyles.itemReason}>{flow.note}</p>
    </li>
  );
}

function NotWiredKindSubGroup({
  kind,
  entries,
}: {
  kind: NotWiredBlockerKind;
  entries: readonly NotWiredEntry[];
}) {
  return (
    <div style={inventoryStyles.subGroup}>
      <div style={inventoryStyles.subGroupHeader}>
        <span style={inventoryStyles.subGroupHeading}>
          {BLOCKER_KIND_LABEL[kind]} ({entries.length})
        </span>
      </div>
      <ul style={inventoryStyles.itemList}>
        {entries.map((entry) => (
          <NotWiredRow key={entry.id} entry={entry} />
        ))}
      </ul>
    </div>
  );
}

function NotWiredRow({ entry }: { entry: NotWiredEntry }) {
  return (
    <li style={inventoryStyles.item}>
      <div style={inventoryStyles.itemHeader}>
        <span style={inventoryStyles.itemLabel}>{entry.label}</span>
        <Badge variant="neutral" appearance="outline">
          Not wired
        </Badge>
      </div>
      <p style={inventoryStyles.itemReason}>{entry.reason}</p>
    </li>
  );
}

function DeliberatelyBlockedRow({
  entry,
}: {
  entry: DeliberatelyBlockedEntry;
}) {
  return (
    <li style={inventoryStyles.item}>
      <div style={inventoryStyles.itemHeader}>
        <span style={inventoryStyles.itemLabel}>{entry.label}</span>
        <Badge variant="blocked" appearance="outline">
          Deliberately blocked
        </Badge>
      </div>
      <p style={inventoryStyles.itemReason}>{entry.reason}</p>
      {entry.enablementMapPath && (
        <p style={inventoryStyles.itemPath}>
          Enablement map: {entry.enablementMapPath}
        </p>
      )}
    </li>
  );
}

function CategoryRow({ row }: { row: ReleaseCategoryRow }) {
  const sev = statusToSeverity(row.status);
  return (
    <li style={adminStyles.row}>
      <div style={adminStyles.rowHead}>
        <span style={adminStyles.rowTitle}>
          <StatusDot variant={sev} /> {row.label}
        </span>
        <Badge variant={sev} appearance="outline">
          {statusLabel(row.status)}
        </Badge>
      </div>
      <p style={styles.reason}>{row.reason}</p>
      <p style={styles.nextAction}>
        <span style={styles.nextActionLabel}>Next action: </span>
        {row.nextAction}
      </p>
    </li>
  );
}

function statusToSeverity(s: ReleaseCategoryStatus): SeverityKey {
  if (s === 'blocked') return 'blocked';
  if (s === 'needs-review') return 'atRisk';
  if (s === 'not-wired') return 'neutral';
  return 'clear';
}

function statusLabel(s: ReleaseCategoryStatus): string {
  if (s === 'blocked') return 'Blocked';
  if (s === 'needs-review') return 'Needs Review';
  if (s === 'not-wired') return 'Not Wired';
  return 'Ready';
}

function overallLabel(s: ReleaseCategoryStatus): string {
  if (s === 'blocked') return 'Not ready to promote — blockers open';
  if (s === 'needs-review') return 'Review required before promotion';
  if (s === 'not-wired') return 'Cannot fully verify — signals not wired';
  return 'Ready to promote';
}

const styles: Record<string, React.CSSProperties> = {
  reason: {
    margin: 0,
    paddingTop: 4,
    fontSize: typography.size.sm,
    color: palette.text,
    lineHeight: typography.lineHeight.snug,
  },
  nextAction: {
    margin: 0,
    paddingTop: 2,
    fontSize: typography.size.sm,
    color: palette.textMuted,
    lineHeight: typography.lineHeight.snug,
    background: palette.surface,
    borderTop: `1px dashed ${palette.divider}`,
    paddingLeft: spacing.xxs,
    paddingRight: spacing.xxs,
    paddingBottom: 4,
    borderRadius: radius.sm,
  },
  nextActionLabel: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
};

const inventoryStyles: Record<string, React.CSSProperties> = {
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTop: `1px solid ${palette.divider}`,
  },
  sectionTitle: {
    margin: 0,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: palette.text,
    letterSpacing: typography.letterSpacing.heading,
  },
  sectionLead: {
    margin: 0,
    fontSize: typography.size.sm,
    color: palette.textMuted,
    lineHeight: typography.lineHeight.snug,
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  groupHeading: {
    margin: 0,
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  groupDetail: {
    margin: 0,
    fontSize: typography.size.sm,
    color: palette.text,
    lineHeight: typography.lineHeight.snug,
  },
  emptyHint: {
    margin: 0,
    fontSize: typography.size.sm,
    color: palette.textMuted,
    fontStyle: 'italic',
  },
  subGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xxs,
    paddingTop: spacing.xxs,
  },
  subGroupHeader: { display: 'flex', alignItems: 'center', gap: spacing.xs },
  subGroupHeading: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.medium,
  },
  itemList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xxs,
  },
  item: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: `${spacing.xs} ${spacing.sm}`,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
  },
  itemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  itemLabel: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: palette.text,
  },
  itemReason: {
    margin: 0,
    fontSize: typography.size.xs,
    color: palette.textMuted,
    lineHeight: typography.lineHeight.snug,
  },
  itemPath: {
    margin: 0,
    fontSize: typography.size.xs,
    color: palette.textSubtle,
    fontFamily: typography.mono,
  },
};
