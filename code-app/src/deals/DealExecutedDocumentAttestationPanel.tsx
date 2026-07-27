import { useEffect, useRef, useState } from 'react';
import { Card, CardHeader } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';
import { createDataverseExecutedDocumentAttestationStore } from '../closing/executedDocumentAttestationStore';
import { submitExecutedDocumentAttestationAction } from '../closing/submitExecutedDocumentAttestationAction';
import {
  evaluateExecutedDocumentAttestationReadiness,
  type ExecutedDocumentAttestationRecord,
} from '../workflow/executedDocumentAttestationTypes';
import { mapBusinessSafeError } from '../shared/errors/businessSafeErrorMapping';

/**
 * Final LOS Completion arc — Workstream F. Mounts the durable Executed Document Attestation
 * record (submitExecutedDocumentAttestationAction.ts / executedDocumentAttestationStore.ts)
 * into the Deal Workspace. Proves the full loop this arc requires: user action -> authorized write
 * -> durable record -> reload -> exact-record readback (listAttestationsForDeal on mount) ->
 * downstream consumption (this same list is what CLOSING_FUNDING:executed_docs now reads via
 * evaluateExecutedDocumentAttestationReadiness).
 *
 * Same disclosed caveat as every other new-entity adapter this arc adds: the backing table has not
 * been applied to any live Dataverse environment yet (see
 * executedDocumentAttestationStore.ts's header), so every live call here fails closed with a
 * visible error until an operator applies the migration in
 * scripts/schema-migrations/final-arc-executed-document-attestation/.
 */
export function DealExecutedDocumentAttestationPanel({
  dealId,
  authorized,
  actorEmail,
  systemUserId,
  onAttestationSubmitted,
}: {
  dealId: string;
  authorized: boolean;
  actorEmail: string | undefined;
  systemUserId: string | undefined;
  onAttestationSubmitted?: () => void;
}) {
  const storeRef = useRef(createDataverseExecutedDocumentAttestationStore());
  // Lifecycle guard for load()'s async work (mount effect + every post-submit reload). Prevents any
  // state update — success or failure path — after this panel has unmounted (e.g. the deal
  // workspace navigates away, or a test unmounts) while listAttestationsForDeal is still in flight.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [records, setRecords] = useState<readonly ExecutedDocumentAttestationRecord[]>([]);
  const [executedDate, setExecutedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const email = actorEmail ?? '';

  function load() {
    setLoadState('loading');
    setLoadError(undefined);
    storeRef.current
      .listAttestationsForDeal(dealId)
      .then((res) => {
        if (!isMountedRef.current) return;
        if (res.success) {
          setRecords(res.records ?? []);
          setLoadState('ready');
        } else {
          setLoadState('error');
          setLoadError(res.error ? mapBusinessSafeError(res.error).safeMessage : 'Could not load executed document attestations.');
        }
      })
      .catch((err: unknown) => {
        if (!isMountedRef.current) return;
        setLoadState('error');
        const raw = err instanceof Error ? err.message : String(err);
        setLoadError(mapBusinessSafeError(raw).safeMessage);
      });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId]);

  const readiness = evaluateExecutedDocumentAttestationReadiness(records, dealId);
  const current = readiness.currentAttestation;

  async function act(status: 'ATTESTED' | 'REVOKED') {
    setSubmitError(undefined);
    setSubmitting(true);
    const outcome = await submitExecutedDocumentAttestationAction(
      { dealId, status, executedDateIso: executedDate, notes, actorEmail: email, systemUserId: systemUserId ?? '' },
      storeRef.current,
    );
    setSubmitting(false);
    if (outcome.kind === 'success') {
      setExecutedDate('');
      setNotes('');
      load();
      onAttestationSubmitted?.();
    } else if (outcome.kind === 'governance-partial') {
      load();
      onAttestationSubmitted?.();
      setSubmitError([outcome.auditError, outcome.timelineError].filter(Boolean).join(' '));
    } else if (outcome.kind === 'invalid-input') {
      setSubmitError(outcome.message);
    } else {
      setSubmitError(outcome.error);
    }
  }

  return (
    <Card>
      <CardHeader title="Executed Documents" subtitle="Attestation that the closing document package was signed by the borrower." />
      {loadState === 'loading' && (
        <p style={styles.note} role="status" data-executed-doc-attestation-loading>
          Loading executed document attestations…
        </p>
      )}
      {loadState === 'error' && (
        <p style={styles.error} role="alert" data-executed-doc-attestation-load-error>
          Could not load executed document attestations: {loadError}
        </p>
      )}
      {loadState === 'ready' && (
        <>
          <div style={styles.statusRow}>
            <Badge variant={current?.status === 'ATTESTED' ? 'clear' : 'neutral'}>
              {current ? current.status : 'NOT ATTESTED'}
            </Badge>
            {current && <span style={styles.muted}>{current.notes}</span>}
          </div>
          {submitError && (
            <p style={styles.error} role="alert" data-executed-doc-attestation-error>
              {submitError}
            </p>
          )}
          <div style={styles.form} data-executed-doc-attestation-form>
            <label style={styles.label} htmlFor="edc-executed-date">Executed date</label>
            <input
              id="edc-executed-date"
              type="date"
              style={styles.input}
              value={executedDate}
              onChange={(e) => setExecutedDate(e.target.value)}
              disabled={!authorized}
            />
            <label style={styles.label} htmlFor="edc-notes">Notes (required)</label>
            <textarea
              id="edc-notes"
              style={styles.textarea}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!authorized}
            />
            <div style={styles.buttonRow}>
              <button type="button" style={styles.submitButton} disabled={!authorized || submitting} onClick={() => act('ATTESTED')}>
                Attest executed
              </button>
              {current?.status === 'ATTESTED' && (
                <button type="button" style={styles.secondaryButton} disabled={!authorized || submitting} onClick={() => act('REVOKED')}>
                  Revoke attestation
                </button>
              )}
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
  input: { padding: `${spacing.xs} ${spacing.sm}`, border: `1px solid ${palette.border}`, borderRadius: radius.sm, font: 'inherit' },
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
