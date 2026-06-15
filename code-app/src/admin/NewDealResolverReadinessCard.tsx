import { useEffect, useState, type CSSProperties } from 'react';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';
import { resolveConfiguredNewDealReferences } from '../deals/newDealReferenceReader';
import type { NewDealReferenceResolution } from '../deals/newDealReferenceResolver';
import {
  REFERENCE_SELECTION_PRODUCTION_APPROVED,
  STAGE_REFERENCE_SELECTION,
  STATUS_REFERENCE_SELECTION,
} from '../deals/newDealReferenceTargets';

/**
 * Phase 170H -- read-only Admin resolver readiness smoke.
 *
 * Runs the fail-closed `resolveConfiguredNewDealReferences` (which reads
 * the typed Stage/Status data sources) so an admin can confirm whether the
 * deployed typed binding resolves a single active Stage + Status by
 * code/name. READ-ONLY: it never writes, never enables create, and never
 * displays a record GUID (it shows the configured code/name only). Any
 * failure renders a fail-closed blocked state. Rendered only inside the
 * already admin-gated New Deal Intake panel.
 */

type State =
  | { kind: 'loading' }
  | { kind: 'resolved'; result: NewDealReferenceResolution };

export function NewDealResolverReadinessCard() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    resolveConfiguredNewDealReferences()
      .then((result) => {
        if (!cancelled) setState({ kind: 'resolved', result });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Fail closed: any unexpected throw is treated as a service error.
        setState({
          kind: 'resolved',
          result: {
            kind: 'serviceError',
            message: err instanceof Error ? err.message : String(err),
          },
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={styles.wrap} data-admin-resolver-readiness="card">
      <div style={styles.titleRow}>
        <div style={styles.title}>Resolver readiness (read-only smoke)</div>
        <Badge variant={badgeTone(state)} appearance="outline">
          {badgeLabel(state)}
        </Badge>
      </div>
      <Body state={state} />
      <p style={styles.footnote} data-admin-resolver-readiness-footnote>
        Read-only check of the typed Stage/Status data sources. Create remains
        disabled regardless of this result.
      </p>
    </div>
  );
}

function Body({ state }: { state: State }) {
  if (state.kind === 'loading') {
    return (
      <p style={styles.muted} data-admin-resolver-status="loading">
        Checking Stage/Status resolver readiness…
      </p>
    );
  }
  const r = state.result;
  if (r.kind === 'ready') {
    return (
      <div data-admin-resolver-status="ready">
        <p style={styles.line}>
          <strong>Stage:</strong> {STAGE_REFERENCE_SELECTION.code} (
          {STAGE_REFERENCE_SELECTION.name}) — one active match.
        </p>
        <p style={styles.line}>
          <strong>Status:</strong> {STATUS_REFERENCE_SELECTION.code} (
          {STATUS_REFERENCE_SELECTION.name}) — one active match.
        </p>
        <p style={styles.warn} data-admin-resolver-test-warning>
          TEST reference rows — not production-approved
          {REFERENCE_SELECTION_PRODUCTION_APPROVED ? '' : ' (production approval pending)'}
          .
        </p>
        <p style={styles.line} data-admin-resolver-create-note>
          Create remains disabled.
        </p>
      </div>
    );
  }
  return (
    <p style={styles.blocked} data-admin-resolver-status={r.kind}>
      <strong>Blocked (fail-closed):</strong> {blockedReason(r)}
    </p>
  );
}

function blockedReason(r: Exclude<NewDealReferenceResolution, { kind: 'ready' }>): string {
  switch (r.kind) {
    case 'notConfigured':
      return `Stage/Status data sources are not resolvable yet. ${r.reason}`;
    case 'missingStage':
      return 'No active Stage reference matches the configured code/name.';
    case 'missingStatus':
      return 'No active Status reference matches the configured code/name.';
    case 'duplicateStage':
      return `Multiple active Stage references match the configured code/name (${r.count}).`;
    case 'duplicateStatus':
      return `Multiple active Status references match the configured code/name (${r.count}).`;
    case 'inactiveStage':
      return 'The matched Stage reference is inactive.';
    case 'inactiveStatus':
      return 'The matched Status reference is inactive.';
    case 'serviceError':
      return `Could not read the reference data sources (${r.message}).`;
  }
}

function badgeLabel(state: State): string {
  if (state.kind === 'loading') return 'Checking…';
  return state.result.kind === 'ready' ? 'Ready (TEST)' : 'Blocked';
}

function badgeTone(state: State): 'neutral' | 'clear' | 'atRisk' {
  if (state.kind === 'loading') return 'neutral';
  return state.result.kind === 'ready' ? 'clear' : 'atRisk';
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.borderStrong}`,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  titleRow: { display: 'flex', alignItems: 'center', gap: spacing.sm },
  title: {
    fontWeight: typography.weight.semibold,
    color: palette.text,
    fontSize: typography.size.md,
  },
  muted: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.sm,
    fontStyle: 'italic',
  },
  line: {
    margin: 0,
    color: palette.text,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.snug,
  },
  warn: {
    margin: `${spacing.xs} 0`,
    color: palette.atRiskFg,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    lineHeight: typography.lineHeight.snug,
  },
  blocked: {
    margin: 0,
    color: palette.text,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.snug,
  },
  footnote: {
    margin: 0,
    color: palette.textSubtle,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.snug,
  },
};
