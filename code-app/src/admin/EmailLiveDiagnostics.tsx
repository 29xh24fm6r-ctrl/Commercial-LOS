import { useState } from 'react';
import { Card, CardHeader } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';
import { EMAIL_MODE } from '../deals/emailDelivery/emailMode';
import {
  runEmailLiveSmokeTest,
  type EmailLiveSmokeTestOutcome,
} from './emailLiveSmokeTest';

/**
 * Phase 109 — operator-facing Outlook LIVE email diagnostics card.
 *
 * Shows the static facts an operator needs to assess release
 * readiness for LIVE Outlook email mode:
 *   - current EMAIL_MODE (DRY_RUN vs LIVE),
 *   - code-availability of the two governed send paths
 *     (document-request email, borrower-update email),
 *   - confirmation that Phase 101 summary handoffs remain
 *     copy-to-clipboard regardless of mode,
 *   - the standing wording rule that "Outlook accepted" is
 *     connector acceptance, not borrower delivery confirmation.
 *
 * Also provides an OPTIONAL operator-triggered smoke test. The
 * smoke test runs ONLY when the operator types a recipient and
 * clicks the Run button. It NEVER fires on mount, on app load, in
 * a banker workflow, or anywhere else. It produces no Dataverse
 * write, no audit row, no timeline row. The send uses the same
 * minimal ClientSendHtmlMessage shape as the production governed
 * writes (To / Subject / Body / Importance: 'Normal').
 *
 * Sibling helper:
 *   ./emailLiveSmokeTest.ts — the pure operator-triggered send
 *   helper. Adapter injection supported for tests.
 */

type RunState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; outcome: EmailLiveSmokeTestOutcome };

export function EmailLiveDiagnostics() {
  const [recipient, setRecipient] = useState('');
  const [run, setRun] = useState<RunState>({ kind: 'idle' });

  const trimmedRecipient = recipient.trim();
  const canRun = trimmedRecipient.length > 0 && run.kind !== 'running';

  async function handleRun() {
    if (!canRun) return;
    setRun({ kind: 'running' });
    try {
      const outcome = await runEmailLiveSmokeTest({ recipient });
      setRun({ kind: 'done', outcome });
    } catch (err: unknown) {
      setRun({
        kind: 'done',
        outcome: {
          kind: 'unknown',
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  const isLive = EMAIL_MODE === 'LIVE';

  return (
    <Card>
      <CardHeader
        title="Outlook LIVE Email Diagnostics"
        subtitle="Operator release-readiness check for the LIVE Outlook send path. Diagnostic only — no banker / borrower workflow is touched. No audit row, no timeline row, no Dataverse write."
        trailing={
          <Badge
            variant={isLive ? 'clear' : 'neutral'}
            appearance="outline"
            aria-label={`Email delivery mode: ${EMAIL_MODE}`}
          >
            Mode: {EMAIL_MODE}
          </Badge>
        }
      />

      <section style={styles.statusBlock} aria-label="Email mode posture">
        <StatusRow
          label="Document-request email LIVE path"
          status="code-available"
          detail="Wired by Phase 104 through the typed Outlook send adapter. LIVE-mode sends emit one audit row + one EmailLogged timeline row per attempt."
        />
        <StatusRow
          label="Borrower-update email LIVE path"
          status="code-available"
          detail="Wired by Phase 105 through the same typed Outlook send adapter as document-request. LIVE-mode sends emit one audit row + one BorrowerUpdateSent timeline row per attempt."
        />
        <StatusRow
          label="Phase 101 summary handoffs"
          status="copy-to-clipboard"
          detail="Catch-up, activity, and relationship summary handoffs are copy-to-clipboard regardless of EMAIL_MODE. They do not call SendEmailV2; flipping LIVE does not change their behavior."
        />
      </section>

      <p style={styles.acceptedWarning} role="note">
        <strong>"Outlook accepted" is connector acceptance, not borrower delivery confirmation.</strong>{' '}
        A successful smoke test means the connector took the
        request for handoff. It does NOT prove the test recipient
        received the message. Read the actual test inbox to verify
        receipt.
      </p>

      <section style={styles.smokeBlock} aria-label="Operator-triggered smoke test">
        <div style={styles.smokeTitleRow}>
          <h4 style={styles.smokeTitle}>Operator-triggered smoke test</h4>
          <Badge variant="neutral" appearance="outline">
            Operator-only · explicit
          </Badge>
        </div>
        <p style={styles.smokeDescription}>
          Sends one hardcoded message ("OGB LOS Outlook smoke
          test") through the same adapter the production governed
          writes use. No deal, borrower, audit, or timeline state
          changes. Use a non-borrower test address (your own inbox
          or a diagnostic mailbox).
        </p>
        <div style={styles.smokeForm}>
          <label style={styles.smokeLabel} htmlFor="email-smoke-recipient">
            Test recipient email{' '}
            <span style={styles.required}>required</span>
          </label>
          <input
            id="email-smoke-recipient"
            type="email"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="ops-test@bank.example.com"
            style={styles.smokeInput}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={handleRun}
            disabled={!canRun}
            style={canRun ? styles.smokeButton : styles.smokeButtonDisabled}
            aria-label="Run Outlook LIVE smoke test"
          >
            {run.kind === 'running' ? 'Running smoke test…' : 'Run smoke test'}
          </button>
        </div>

        <SmokeOutcomePanel run={run} />
      </section>
    </Card>
  );
}

function StatusRow({
  label,
  status,
  detail,
}: {
  label: string;
  status: 'code-available' | 'copy-to-clipboard';
  detail: string;
}) {
  const variant = status === 'code-available' ? 'clear' : 'neutral';
  const statusLabel =
    status === 'code-available' ? 'Code-available' : 'Copy-to-clipboard';
  return (
    <div style={styles.statusRow}>
      <div style={styles.statusRowHead}>
        <span style={styles.statusRowLabel}>{label}</span>
        <Badge variant={variant} appearance="outline">
          {statusLabel}
        </Badge>
      </div>
      <p style={styles.statusRowDetail}>{detail}</p>
    </div>
  );
}

function SmokeOutcomePanel({ run }: { run: RunState }) {
  if (run.kind !== 'done') return null;
  const o = run.outcome;

  if (o.kind === 'accepted') {
    return (
      <div style={{ ...styles.outcomeBox, background: palette.clearBg, borderColor: palette.clear }}>
        <div style={{ ...styles.outcomeTitle, color: palette.clearFg }}>
          Connector accepted the smoke message
        </div>
        <p style={styles.outcomeDetail}>
          Mode: <strong>{o.mode}</strong>. The Outlook adapter
          accepted the request for handoff. Check the test inbox
          to verify the message actually arrived — acceptance is
          not delivery confirmation.
        </p>
      </div>
    );
  }
  if (o.kind === 'invalid-input') {
    return (
      <div style={{ ...styles.outcomeBox, background: palette.atRiskBg, borderColor: palette.atRisk }}>
        <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>
          Invalid input — smoke test not run
        </div>
        <p style={styles.outcomeDetail}>{o.reason}</p>
      </div>
    );
  }
  if (o.kind === 'transient-failure') {
    return (
      <div style={{ ...styles.outcomeBox, background: palette.atRiskBg, borderColor: palette.atRisk }}>
        <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>
          Transient failure (mode: {o.mode})
        </div>
        <p style={styles.outcomeDetail}>{o.reason}</p>
        <p style={styles.outcomeDetail}>
          You may retry. Common causes: 408 timeout, 429 throttle,
          5xx Outlook backend, network drop, transport handshake.
        </p>
      </div>
    );
  }
  if (o.kind === 'permanent-failure') {
    return (
      <div style={{ ...styles.outcomeBox, background: palette.blockedBg, borderColor: palette.blocked }}>
        <div style={{ ...styles.outcomeTitle, color: palette.blockedFg }}>
          Permanent failure (mode: {o.mode})
        </div>
        <p style={styles.outcomeDetail}>{o.reason}</p>
        <p style={styles.outcomeDetail}>
          Do not retry as-is. Common causes: 401/403 permissions,
          400 malformed recipient, mailbox over quota.
        </p>
      </div>
    );
  }
  return (
    <div style={{ ...styles.outcomeBox, background: palette.atRiskBg, borderColor: palette.atRisk }}>
      <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>
        Unknown error
      </div>
      <p style={styles.outcomeDetail}>{o.message}</p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  statusBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  statusRow: {
    padding: `${spacing.sm} ${spacing.md}`,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  statusRowHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  statusRowLabel: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: palette.text,
  },
  statusRowDetail: {
    margin: 0,
    fontSize: typography.size.sm,
    color: palette.textMuted,
    lineHeight: typography.lineHeight.snug,
  },
  acceptedWarning: {
    margin: 0,
    padding: `${spacing.sm} ${spacing.md}`,
    background: palette.neutralBg,
    color: palette.neutralFg,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.snug,
  },
  smokeBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTop: `1px solid ${palette.divider}`,
  },
  smokeTitleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  smokeTitle: {
    margin: 0,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: palette.text,
  },
  smokeDescription: {
    margin: 0,
    fontSize: typography.size.sm,
    color: palette.textMuted,
    lineHeight: typography.lineHeight.snug,
  },
  smokeForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  smokeLabel: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  required: {
    marginLeft: spacing.xxs,
    color: palette.atRiskFg,
    textTransform: 'none',
    letterSpacing: 0,
    fontWeight: typography.weight.regular,
  },
  smokeInput: {
    fontFamily: typography.family,
    fontSize: typography.size.base,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
    background: palette.surface,
    color: palette.text,
  },
  smokeButton: {
    background: palette.primary,
    color: palette.textInverse,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
    fontFamily: typography.family,
    alignSelf: 'flex-start',
  },
  smokeButtonDisabled: {
    background: palette.borderStrong,
    color: palette.textInverse,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    cursor: 'not-allowed',
    fontFamily: typography.family,
    alignSelf: 'flex-start',
  },
  outcomeBox: {
    border: '1px solid',
    borderRadius: radius.sm,
    padding: spacing.md,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  outcomeTitle: { fontSize: typography.size.lg, fontWeight: typography.weight.semibold },
  outcomeDetail: {
    margin: 0,
    fontSize: typography.size.md,
    color: palette.text,
    lineHeight: typography.lineHeight.snug,
  },
};
