import { useEffect, useRef, useState } from 'react';
import { Card, CardHeader } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';
import { createDataverseBookingQcCheckStore } from '../closing/bookingQcCheckStore';
import { submitBookingQcCheckAction } from '../closing/submitBookingQcCheckAction';
import { evaluateBookingQcReadiness, type BookingQcCheckRecord, type BookingQcStatus } from '../workflow/bookingQcCheckTypes';
import { mapBusinessSafeError } from '../shared/errors/businessSafeErrorMapping';

/**
 * Final LOS Completion arc — Workstream H. Mounts the durable Booking QC Check record
 * (submitBookingQcCheckAction.ts / bookingQcCheckStore.ts) into the Deal Workspace. Proves the full
 * loop this arc requires: user action -> authorized write -> durable record -> reload -> exact-
 * record readback (listChecksForDeal on mount) -> downstream consumption (this same list is what
 * CLOSING_FUNDING:booking_qc now reads via evaluateBookingQcReadiness).
 *
 * Same disclosed caveat as every other new-entity adapter this arc adds: the backing table has not
 * been applied to any live Dataverse environment yet (see bookingQcCheckStore.ts's header), so
 * every live call here fails closed with a visible error until an operator applies the migration in
 * scripts/schema-migrations/final-arc-booking-qc-check/.
 */
export function DealBookingQcPanel({
  dealId,
  authorized,
  actorEmail,
  systemUserId,
  onCheckSubmitted,
}: {
  dealId: string;
  authorized: boolean;
  actorEmail: string | undefined;
  systemUserId: string | undefined;
  onCheckSubmitted?: () => void;
}) {
  const storeRef = useRef(createDataverseBookingQcCheckStore());
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [records, setRecords] = useState<readonly BookingQcCheckRecord[]>([]);
  const [notes, setNotes] = useState('');
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const email = actorEmail ?? '';

  function load() {
    setLoadState('loading');
    setLoadError(undefined);
    storeRef.current
      .listChecksForDeal(dealId)
      .then((res) => {
        if (res.success) {
          setRecords(res.records ?? []);
          setLoadState('ready');
        } else {
          setLoadState('error');
          setLoadError(res.error ? mapBusinessSafeError(res.error).safeMessage : 'Could not load booking QC checks.');
        }
      })
      .catch((err: unknown) => {
        setLoadState('error');
        const raw = err instanceof Error ? err.message : String(err);
        setLoadError(mapBusinessSafeError(raw).safeMessage);
      });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId]);

  const readiness = evaluateBookingQcReadiness(records, dealId);
  const current = readiness.currentCheck;

  async function act(status: BookingQcStatus) {
    setSubmitError(undefined);
    setSubmitting(true);
    const outcome = await submitBookingQcCheckAction(
      { dealId, status, notes, actorEmail: email, systemUserId: systemUserId ?? '' },
      storeRef.current,
    );
    setSubmitting(false);
    if (outcome.kind === 'success') {
      setNotes('');
      load();
      onCheckSubmitted?.();
    } else if (outcome.kind === 'governance-partial') {
      load();
      onCheckSubmitted?.();
      setSubmitError([outcome.auditError, outcome.timelineError].filter(Boolean).join(' '));
    } else if (outcome.kind === 'invalid-input') {
      setSubmitError(outcome.message);
    } else {
      setSubmitError(outcome.error);
    }
  }

  return (
    <Card>
      <CardHeader title="Booking QC" subtitle="Quality-control review of the loan booking package before servicing handoff." />
      {loadState === 'loading' && (
        <p style={styles.note} role="status" data-booking-qc-loading>
          Loading booking QC checks…
        </p>
      )}
      {loadState === 'error' && (
        <p style={styles.error} role="alert" data-booking-qc-load-error>
          Could not load booking QC checks: {loadError}
        </p>
      )}
      {loadState === 'ready' && (
        <>
          <div style={styles.statusRow}>
            <Badge variant={current?.status === 'FAILED' ? 'blocked' : readiness.bookingQcComplete.met ? 'clear' : 'neutral'}>
              {current ? current.status : 'NOT REVIEWED'}
            </Badge>
            {current && <span style={styles.muted}>{current.notes}</span>}
          </div>
          {submitError && (
            <p style={styles.error} role="alert" data-booking-qc-error>
              {submitError}
            </p>
          )}
          <div style={styles.form} data-booking-qc-form>
            <label style={styles.label} htmlFor="qc-notes">Notes (required)</label>
            <textarea
              id="qc-notes"
              style={styles.textarea}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!authorized}
            />
            <div style={styles.buttonRow}>
              <button type="button" style={styles.submitButton} disabled={!authorized || submitting} onClick={() => act('PASSED')}>
                Pass
              </button>
              <button type="button" style={styles.secondaryButton} disabled={!authorized || submitting} onClick={() => act('FAILED')}>
                Fail
              </button>
              <button type="button" style={styles.secondaryButton} disabled={!authorized || submitting} onClick={() => act('WAIVED')}>
                Waive
              </button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

const styles: Record<string, React.CSSProperties> = {
  note: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm },
  error: { margin: 0, color: palette.blocked, fontSize: typography.size.sm },
  statusRow: { display: 'flex', alignItems: 'center', gap: spacing.sm },
  muted: { color: palette.textMuted, fontSize: typography.size.sm },
  form: { display: 'flex', flexDirection: 'column', gap: spacing.xs, marginTop: spacing.md },
  label: { fontSize: typography.size.xs, color: palette.textMuted, fontWeight: typography.weight.semibold },
  textarea: { padding: `${spacing.xs} ${spacing.sm}`, border: `1px solid ${palette.border}`, borderRadius: radius.sm, font: 'inherit', minHeight: '3em' },
  buttonRow: { display: 'flex', gap: spacing.xs },
  submitButton: {
    background: palette.primary,
    color: palette.primaryFg,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    font: 'inherit',
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
  },
  secondaryButton: {
    background: palette.surfaceAlt,
    color: palette.text,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    font: 'inherit',
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
  },
};
