import { useEffect, useRef, useState } from 'react';
import { Card, CardHeader } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';
import { createDataverseAdverseActionRecordStore } from '../creditApproval/adverseActionRecordStore';
import { submitAdverseActionAction } from '../creditApproval/submitAdverseActionAction';
import { recognizeCanonicalStatus } from '../workflow/statusReferenceContract';
import {
  evaluateAdverseActionReadiness,
  type AdverseActionRecord,
  type AdverseActionRecordStatus,
} from '../workflow/adverseActionRecordTypes';
import { mapBusinessSafeError } from '../shared/errors/businessSafeErrorMapping';

/**
 * Final LOS Completion arc — Workstream J. Mounts the durable Adverse Action Record
 * (submitAdverseActionAction.ts / adverseActionRecordStore.ts) into the Deal Workspace. Renders
 * nothing unless the deal's status resolves to DECLINED — same "renders nothing until applicable"
 * discipline `DealServicingLifecyclePanel.tsx` uses for BOARDED. Proves the full loop this arc
 * requires: user action -> authorized write -> durable record -> reload -> exact-record readback
 * (listRecordsForDeal on mount) -> downstream consumption (this same list is what
 * DECLINE:adverse_action now reads via evaluateAdverseActionReadiness).
 *
 * Deliberately does not define what an adverse-action notice must contain, when it must be sent, or
 * who must receive it — those are product/legal-policy decisions out of scope for this arc (see
 * adverseActionRecordTypes.ts's header). This panel only lets an authorized credit officer record
 * that the obligation was completed (or waived) and why.
 *
 * Same disclosed caveat as every other new-entity adapter this arc adds: the backing table has not
 * been applied to any live Dataverse environment yet (see adverseActionRecordStore.ts's header), so
 * every live call here fails closed with a visible error until an operator applies the migration in
 * scripts/schema-migrations/final-arc-adverse-action-record/.
 */
export function DealAdverseActionPanel({
  dealId,
  dealStatus,
  authorized,
  actorEmail,
  systemUserId,
  onRecordSubmitted,
}: {
  dealId: string;
  dealStatus: string | undefined;
  authorized: boolean;
  actorEmail: string | undefined;
  systemUserId: string | undefined;
  onRecordSubmitted?: () => void;
}) {
  const storeRef = useRef(createDataverseAdverseActionRecordStore());
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [records, setRecords] = useState<readonly AdverseActionRecord[]>([]);
  const [notes, setNotes] = useState('');
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const email = actorEmail ?? '';
  const isDeclined = recognizeCanonicalStatus(dealStatus) === 'DECLINED';

  function load() {
    setLoadState('loading');
    setLoadError(undefined);
    storeRef.current
      .listRecordsForDeal(dealId)
      .then((res) => {
        if (res.success) {
          setRecords(res.records ?? []);
          setLoadState('ready');
        } else {
          setLoadState('error');
          setLoadError(res.error ? mapBusinessSafeError(res.error).safeMessage : 'Could not load adverse action records.');
        }
      })
      .catch((err: unknown) => {
        setLoadState('error');
        const raw = err instanceof Error ? err.message : String(err);
        setLoadError(mapBusinessSafeError(raw).safeMessage);
      });
  }

  useEffect(() => {
    if (!isDeclined) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId, isDeclined]);

  if (!isDeclined) return null;

  const readiness = evaluateAdverseActionReadiness(records, dealId);
  const current = readiness.currentRecord;

  async function act(status: AdverseActionRecordStatus) {
    setSubmitError(undefined);
    setSubmitting(true);
    const outcome = await submitAdverseActionAction(
      { dealId, status, notes, actorEmail: email, systemUserId: systemUserId ?? '' },
      storeRef.current,
    );
    setSubmitting(false);
    if (outcome.kind === 'success') {
      setNotes('');
      load();
      onRecordSubmitted?.();
    } else if (outcome.kind === 'governance-partial') {
      load();
      onRecordSubmitted?.();
      setSubmitError([outcome.auditError, outcome.timelineError].filter(Boolean).join(' '));
    } else if (outcome.kind === 'invalid-input') {
      setSubmitError(outcome.message);
    } else {
      setSubmitError(outcome.error);
    }
  }

  return (
    <Card>
      <CardHeader title="Adverse Action" subtitle="Documentation that the adverse-action notification obligation for this decline was completed." />
      {loadState === 'loading' && (
        <p style={styles.note} role="status" data-adverse-action-loading>
          Loading adverse action records…
        </p>
      )}
      {loadState === 'error' && (
        <p style={styles.error} role="alert" data-adverse-action-load-error>
          Could not load adverse action records: {loadError}
        </p>
      )}
      {loadState === 'ready' && (
        <>
          <div style={styles.statusRow}>
            <Badge variant={readiness.adverseActionDocumented.met ? 'clear' : 'neutral'}>
              {current ? current.status : 'NOT DOCUMENTED'}
            </Badge>
            {current && <span style={styles.muted}>{current.notes}</span>}
          </div>
          {submitError && (
            <p style={styles.error} role="alert" data-adverse-action-error>
              {submitError}
            </p>
          )}
          <div style={styles.form} data-adverse-action-form>
            <label style={styles.label} htmlFor="adverse-action-notes">Notes (required)</label>
            <textarea
              id="adverse-action-notes"
              style={styles.textarea}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!authorized}
            />
            <div style={styles.buttonRow}>
              <button type="button" style={styles.submitButton} disabled={!authorized || submitting} onClick={() => act('SENT')}>
                Notice Sent
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
