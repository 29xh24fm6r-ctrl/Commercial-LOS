import type { CSSProperties } from 'react';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';
import {
  getNewDealCreateViewState,
  canSubmitNewDeal,
  type NewDealCreateViewState,
} from './newDealCreateController';
import type { NewDealCreateEnablementInput } from './newDealCreateEnablement';

/**
 * Phase 170N -- Governed New Deal create surface (visibly DISABLED by default).
 *
 * Renders the controller's honest view-state. The submit control is disabled
 * whenever the surface is not `ready` (the default in every committed
 * environment), and rendering performs NO Dataverse call and NO live-dep
 * construction -- the controller's view-state is pure. This is the intended
 * internal admin surface; the public + New Deal button stays disabled.
 */
export function NewDealCreatePanel({
  enablement = {},
}: {
  /** Injected enablement inputs. Default (empty) -> disabled. */
  enablement?: NewDealCreateEnablementInput;
}) {
  const view = getNewDealCreateViewState(enablement);
  const canSubmit = canSubmitNewDeal(view);

  return (
    <section
      style={styles.wrap}
      aria-label="Governed New Deal create"
      data-new-deal-create="panel"
    >
      <header style={styles.head}>
        <div style={styles.titleRow}>
          <h3 style={styles.title}>Governed New Deal create</h3>
          <Badge variant={canSubmit ? 'clear' : 'neutral'} appearance="outline">
            {canSubmit ? 'Enabled (controlled)' : 'Off (default)'}
          </Badge>
        </div>
        <p style={styles.subtitle}>
          Controlled, audited create path. Wired to the governed adapter but
          off by default; nothing is written from here unless every gate
          (adapter flag, authorization, approved environment, Ready resolver)
          passes.
        </p>
      </header>

      <div style={styles.state} role="note" data-new-deal-create-state={view.kind}>
        <strong>{stateLabel(view)}:</strong> {stateReason(view)}
      </div>

      <button
        type="button"
        disabled={!canSubmit}
        aria-disabled={!canSubmit}
        style={canSubmit ? styles.action : styles.disabledAction}
        title={canSubmit ? 'Create deal (controlled)' : stateReason(view)}
        aria-label={canSubmit ? 'Create deal (controlled)' : 'Create deal (not available)'}
        data-new-deal-create-submit
      >
        {canSubmit ? 'Create deal (controlled)' : 'Create deal (not available)'}
      </button>

      <p style={styles.footnote} data-new-deal-create-footnote>
        While disabled, this surface writes no deal record and no audit event.
        It reports success only after a real write and a successful audit; a
        written deal whose audit fails reports an honest partial state, never a
        false success.
      </p>
    </section>
  );
}

function stateLabel(view: NewDealCreateViewState): string {
  switch (view.kind) {
    case 'ready':
      return 'Ready (controlled)';
    case 'unauthorized':
      return 'Not authorized';
    case 'environment_not_allowed':
      return 'Environment not approved';
    case 'config_invalid':
      return 'Configuration invalid';
    case 'resolver_not_ready':
      return 'Stage/Status not ready';
    case 'disabled':
    default:
      return 'Disabled';
  }
}

function stateReason(view: NewDealCreateViewState): string {
  return view.kind === 'ready'
    ? 'All gates pass for this controlled environment. Submitting will create exactly one audited deal.'
    : view.reason;
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    background: palette.surface,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.md,
    padding: `${spacing.lg} ${spacing.xl}`,
    marginBottom: spacing.lg,
  },
  head: { display: 'flex', flexDirection: 'column', gap: 2 },
  titleRow: { display: 'flex', alignItems: 'center', gap: spacing.sm },
  title: {
    margin: 0,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: palette.text,
  },
  subtitle: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.snug,
  },
  state: {
    background: palette.surfaceAlt,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    color: palette.text,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.snug,
  },
  action: {
    alignSelf: 'flex-start',
    background: palette.surfaceAlt,
    color: palette.text,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    fontFamily: typography.family,
    cursor: 'pointer',
  },
  disabledAction: {
    alignSelf: 'flex-start',
    background: palette.surfaceAlt,
    color: palette.textSubtle,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    fontFamily: typography.family,
    cursor: 'not-allowed',
  },
  footnote: {
    margin: 0,
    color: palette.textSubtle,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.snug,
  },
};
