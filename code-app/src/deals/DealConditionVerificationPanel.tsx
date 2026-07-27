import { useEffect, useRef, useState } from 'react';
import { Card, CardHeader } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';
import { createDataverseConditionVerificationStore } from '../documentation/conditionVerificationStore';
import { submitConditionVerificationAction } from '../documentation/submitConditionVerificationAction';
import {
  CONDITION_TYPES,
  evaluateConditionVerificationReadiness,
  type ConditionType,
  type ConditionVerificationRecord,
  type ConditionVerificationStatus,
} from '../workflow/conditionVerificationTypes';
import { mapBusinessSafeError } from '../shared/errors/businessSafeErrorMapping';

/**
 * Final LOS Completion arc — Workstream E. Mounts the durable Condition Verification record
 * (submitConditionVerificationAction.ts / conditionVerificationStore.ts) into the Deal Workspace.
 * Proves the full loop this arc requires: user action -> authorized write -> durable record ->
 * reload -> exact-record readback (listVerificationsForDeal on mount) -> downstream consumption
 * (this same list is what DOCUMENTATION:conditions_precedent / :collateral_verified /
 * :insurance_verified now read via evaluateConditionVerificationReadiness).
 *
 * Same disclosed caveat as every other new-entity adapter this arc adds: the backing table has not
 * been applied to any live Dataverse environment yet (see conditionVerificationStore.ts's header),
 * so every live call here fails closed with a visible error until an operator applies the migration
 * in scripts/schema-migrations/final-arc-condition-verification/.
 */

const CONDITION_TYPE_LABEL: Record<ConditionType, string> = {
  CONDITIONS_PRECEDENT: 'Conditions precedent',
  COLLATERAL: 'Collateral',
  INSURANCE: 'Insurance',
};

export function DealConditionVerificationPanel({
  dealId,
  authorized,
  actorEmail,
  systemUserId,
  onVerificationSubmitted,
}: {
  dealId: string;
  authorized: boolean;
  actorEmail: string | undefined;
  systemUserId: string | undefined;
  onVerificationSubmitted?: () => void;
}) {
  const storeRef = useRef(createDataverseConditionVerificationStore());
  // Lifecycle guard for load()'s async work (mount effect + every post-submit reload). Prevents any
  // state update — success or failure path — after this panel has unmounted (e.g. the deal
  // workspace navigates away, or a test unmounts) while listVerificationsForDeal is still in flight.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [records, setRecords] = useState<readonly ConditionVerificationRecord[]>([]);
  const [notesByType, setNotesByType] = useState<Record<ConditionType, string>>({
    CONDITIONS_PRECEDENT: '',
    COLLATERAL: '',
    INSURANCE: '',
  });
  const [submitErrorByType, setSubmitErrorByType] = useState<Partial<Record<ConditionType, string>>>({});
  const [submittingType, setSubmittingType] = useState<ConditionType | undefined>(undefined);
  const email = actorEmail ?? '';

  function load() {
    setLoadState('loading');
    setLoadError(undefined);
    storeRef.current
      .listVerificationsForDeal(dealId)
      .then((res) => {
        if (!isMountedRef.current) return;
        if (res.success) {
          setRecords(res.records ?? []);
          setLoadState('ready');
        } else {
          setLoadState('error');
          setLoadError(res.error ? mapBusinessSafeError(res.error).safeMessage : 'Could not load condition verifications.');
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

  const readiness = evaluateConditionVerificationReadiness(records, dealId);

  async function act(conditionType: ConditionType, status: ConditionVerificationStatus) {
    setSubmitErrorByType((prev) => ({ ...prev, [conditionType]: undefined }));
    setSubmittingType(conditionType);
    const outcome = await submitConditionVerificationAction(
      {
        dealId,
        conditionType,
        status,
        notes: notesByType[conditionType],
        actorEmail: email,
        systemUserId: systemUserId ?? '',
      },
      storeRef.current,
    );
    setSubmittingType(undefined);
    if (outcome.kind === 'success') {
      setNotesByType((prev) => ({ ...prev, [conditionType]: '' }));
      load();
      onVerificationSubmitted?.();
    } else if (outcome.kind === 'governance-partial') {
      load();
      onVerificationSubmitted?.();
      setSubmitErrorByType((prev) => ({
        ...prev,
        [conditionType]: [outcome.auditError, outcome.timelineError].filter(Boolean).join(' '),
      }));
    } else if (outcome.kind === 'invalid-input') {
      setSubmitErrorByType((prev) => ({ ...prev, [conditionType]: outcome.message }));
    } else {
      setSubmitErrorByType((prev) => ({ ...prev, [conditionType]: outcome.error }));
    }
  }

  return (
    <Card>
      <CardHeader title="Closing Conditions" subtitle="Conditions precedent, collateral, and insurance — each independently verified and recorded." />
      {loadState === 'loading' && (
        <p style={styles.note} role="status" data-condition-verification-loading>
          Loading condition verifications…
        </p>
      )}
      {loadState === 'error' && (
        <p style={styles.error} role="alert" data-condition-verification-load-error>
          Could not load condition verifications: {loadError}
        </p>
      )}
      {loadState === 'ready' && (
        <div style={styles.grid} data-condition-verification-grid>
          {CONDITION_TYPES.map((conditionType) => {
            const current = readiness.currentRecords[conditionType];
            const met =
              conditionType === 'CONDITIONS_PRECEDENT'
                ? readiness.conditionsPrecedent.met
                : conditionType === 'COLLATERAL'
                  ? readiness.collateralVerified.met
                  : readiness.insuranceVerified.met;
            return (
              <div key={conditionType} style={styles.typeBlock} data-condition-type={conditionType}>
                <div style={styles.typeHeader}>
                  <strong>{CONDITION_TYPE_LABEL[conditionType]}</strong>
                  <Badge variant={met ? 'clear' : current?.status === 'FAILED' ? 'blocked' : 'neutral'}>
                    {current ? current.status : 'NOT VERIFIED'}
                  </Badge>
                </div>
                {current && <p style={styles.rationale}>{current.notes}</p>}
                {submitErrorByType[conditionType] && (
                  <p style={styles.error} role="alert" data-condition-verification-error={conditionType}>
                    {submitErrorByType[conditionType]}
                  </p>
                )}
                <textarea
                  style={styles.textarea}
                  placeholder="Notes (required)"
                  value={notesByType[conditionType]}
                  onChange={(e) => setNotesByType((prev) => ({ ...prev, [conditionType]: e.target.value }))}
                  disabled={!authorized}
                  aria-label={`${CONDITION_TYPE_LABEL[conditionType]} notes`}
                />
                <div style={styles.buttonRow}>
                  <button
                    type="button"
                    style={styles.submitButton}
                    disabled={!authorized || submittingType === conditionType}
                    onClick={() => act(conditionType, 'CLEARED')}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    style={styles.secondaryButton}
                    disabled={!authorized || submittingType === conditionType}
                    onClick={() => act(conditionType, 'WAIVED')}
                  >
                    Waive
                  </button>
                  <button
                    type="button"
                    style={styles.secondaryButton}
                    disabled={!authorized || submittingType === conditionType}
                    onClick={() => act(conditionType, 'FAILED')}
                  >
                    Mark failed
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

const styles: Record<string, React.CSSProperties> = {
  note: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm },
  error: { margin: 0, color: palette.blocked, fontSize: typography.size.sm },
  grid: { display: 'flex', flexDirection: 'column', gap: spacing.md },
  typeBlock: { border: `1px solid ${palette.border}`, borderRadius: radius.sm, padding: spacing.sm, display: 'flex', flexDirection: 'column', gap: spacing.xs },
  typeHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  rationale: { margin: 0, fontSize: typography.size.sm, color: palette.textMuted },
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
