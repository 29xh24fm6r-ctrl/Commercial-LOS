import { useEffect, useState } from 'react';
import { useDealData } from './DealDataProvider';
import {
  deriveStageProgressionEligibility,
  type ProgressionEligibilityResult,
  type ProgressionEligibilityStatus,
} from './stageProgressionGuard';
import {
  stageProgressionAvailability,
  type StageProgressionAvailability,
} from '../shared/governance/stageProgressionAvailability';
import { loadStageProgressionAvailability } from './stageProgressionAvailabilityLoader';
import { deriveLoanWorkflowState } from '../workflow/deriveLoanWorkflowState';
import { evaluateStageTransitionPolicy } from '../workflow/stageTransitionPolicy';
import { advanceWorkflowStage, type StageAdvanceOutcome } from '../workflow/stageAdvanceWriteDependency';
import {
  deriveStageExitReadiness,
  evaluateStageExitPolicy,
  type WorkflowRequirementFacts,
} from '../workflow/loanWorkflowRequirementEngine';
import {
  evaluateCreditApprovalAuthority,
  describeCreditApprovalAuthorityReason,
  type BankerCreditAuthority,
  type CreditApprovalAuthorityResult,
} from '../workflow/creditApprovalAuthority';
import { buildLiveStageAdvanceDeps } from './buildLiveStageAdvanceDeps';
import { AUTO_STAGE_ADVANCE_ENABLED } from './dealOriginationFeatureFlags';
import { remediationForRequirement, type RemediationRoute } from './dealBlockerModel';
import { DealProfileEditLauncher } from './DealProfileEditModal';
import { AddRequiredDocumentModal } from './AddRequiredDocumentModal';
import type { AddRequiredDocumentOutcome } from './addRequiredDocumentAction';
import { generateDestinationStageWork } from './generateDestinationStageWork';
import { useOptionalBanker } from '../banker/BankerContext';
import { newCorrelationId } from '../shared/governance/correlationId';
import type { LoanWorkflowStageId, LoanWorkflowState } from '../workflow/loanWorkflowTypes';
import { CANONICAL_STAGES, canonicalStageByCode, recognizeCanonicalStage } from '../workflow/stageOrderingContract';
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
export interface StageAdvanceActor {
  readonly systemUserId: string | undefined;
  readonly email: string | undefined;
  /** cr664_Banker.cr664_roletype — job-function role, display/analytics only (superseded as an approval-authority signal). */
  readonly roleType?: string;
  /** The real credit-authority signal (approval limit / committee membership / override) — see creditApprovalAuthority.ts. */
  readonly creditAuthority?: BankerCreditAuthority;
}

export function DealStageProgressionCard({
  stageAdvanceActor,
  loadAvailability = loadStageProgressionAvailability,
}: {
  stageAdvanceActor?: StageAdvanceActor;
  /** Injected for tests; defaults to the live stage-reference read. */
  loadAvailability?: () => Promise<StageProgressionAvailability>;
} = {}) {
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

  // Phase FA-A1 (stage vocabulary reconciled to the canonical seven): the
  // canonical card can now perform a GOVERNED, audited stage advance — but only
  // for an authorized banker-context actor, only once the stage domain is ARMED
  // (AUTO_STAGE_ADVANCE_ENABLED) AND the stage reference table is seeded
  // (availability). Default-off → the control is hidden and inert; the
  // advanceWorkflowStage seam refuses with `disabled` until armed. Manager/team
  // workspaces pass no actor, so the card stays read-only there.
  //
  // WF-1A Item 1 — availability is now DATA-DRIVEN: load the seeded stage rows,
  // resolve the deterministic ordering, and derive availability from it. Starts
  // fail-closed (unavailable) and only flips once a complete, conflict-free
  // ordered set resolves. Loaded only when a banker-context actor is present
  // (the only mode where the Advance control could render); read-only surfaces
  // keep the honest not-seeded banner without an extra read.
  const hasActor = Boolean(stageAdvanceActor?.systemUserId);
  const [availability, setAvailability] = useState<StageProgressionAvailability>(
    stageProgressionAvailability(),
  );
  useEffect(() => {
    if (!hasActor) return;
    let cancelled = false;
    void loadAvailability().then((result) => {
      if (!cancelled) setAvailability(result);
    });
    return () => {
      cancelled = true;
    };
  }, [hasActor, loadAvailability]);
  // Armed reads the same raw gate the write seam uses (advanceWorkflowStage:
  // `enabled ?? Boolean(AUTO_STAGE_ADVANCE_ENABLED)`), so flipping the constant
  // arms the card and the write together — no separate config plumbing.
  const canAdvance =
    Boolean(stageAdvanceActor?.systemUserId) &&
    Boolean(AUTO_STAGE_ADVANCE_ENABLED) &&
    availability.available;

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
          No data-quality signals are blocking progression. A stage move is a governed banker
          action, subject to the current stage&rsquo;s exit criteria.
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

      {canAdvance && (
        <StageAdvanceControl
          workflow={deriveLoanWorkflowState({
            deal,
            tasks: tasksData,
            documents: documentsData,
            creditMemo: creditMemoData,
          })}
          facts={{ deal, tasks: tasksData, documents: documentsData, creditMemo: creditMemoData }}
          dealId={deal.id}
          actor={stageAdvanceActor!}
        />
      )}

      <CardFooter>
        <span>
          Derived from authorized deal, task, document, credit-memo, and activity records.
        </span>
        <span>Any stage advance is governed: authorized banker + armed + seeded, policy-checked, and audited.</span>
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
  // The ONE canonical vocabulary (the ratified seven). A stored code OR ratified
  // name is recognized (so deals at "Intake"/"INTAKE" resolve to seq 10 and the
  // custom-stage footnote clears); anything else is honestly "not in canonical
  // sequence" — never fabricated into a stage.
  const lanes = CANONICAL_STAGES;
  const recognized = recognizeCanonicalStage(currentStage);
  const currentIndex = recognized ? lanes.findIndex((s) => s.code === recognized.code) : -1;
  const isCustomStage = Boolean(currentStage?.trim()) && currentIndex < 0;
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
              key={s.code}
              style={styles.mapItem}
              aria-current={tone === 'current' ? 'step' : undefined}
              aria-label={`${s.name} (${tone})`}
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
                {s.name}
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

/**
 * Governed stage-advance control (Phase FA-A1). Rendered only when the stage
 * domain is armed + seeded and a banker-context actor is present. Every click
 * runs the fail-closed advanceWorkflowStage seam (policy guard → live transport
 * → audit → timeline); AUTO_STAGE_ADVANCE_ENABLED gates the actual write, so
 * this is inert until an operator arms it.
 */
function StageAdvanceControl({
  workflow,
  facts,
  dealId,
  actor,
}: {
  workflow: LoanWorkflowState;
  facts: WorkflowRequirementFacts;
  dealId: string;
  actor: StageAdvanceActor;
}) {
  const [state, setState] = useState<
    { kind: 'idle' } | { kind: 'saving' } | { kind: 'done'; outcome: StageAdvanceOutcome }
  >({ kind: 'idle' });
  const { refresh, applyVerifiedDealPatch } = useDealData();

  // ARC Phase 3 — fail-closed caller guard: the live advance requires BOTH the write-seam policy AND
  // the shared requirement engine's tracked-blocking to be clear. This keeps the button and the actual
  // write in agreement even where the engine is stricter than the legacy seam (e.g. Underwriting now
  // requires the analysis documents REVIEWED). Untracked deep facts are surfaced as "future" and do NOT
  // block here. The governed seam still enforces its own policy as defense-in-depth.
  const enginePolicy = evaluateStageExitPolicy(deriveStageExitReadiness(workflow.currentStage.id, facts));
  // 2026-07-14 — credit-authority pre-check (mirrors the write seam's own hard gate, see
  // creditApprovalAuthority.ts) so the button is disabled with a safe reason BEFORE a click, not
  // only after a rejected write. Not applicable outside CREDIT_APPROVAL.
  const authorityPolicy: CreditApprovalAuthorityResult =
    workflow.currentStage.id === 'CREDIT_APPROVAL'
      ? evaluateCreditApprovalAuthority({
          actorResolved: Boolean(actor.systemUserId),
          banker: actor.creditAuthority,
          dealAmount: facts.deal.amount,
          requestProfileAmount: undefined,
        })
      : { allowed: true };

  async function onAdvance(nextStageId: LoanWorkflowStageId) {
    if (!enginePolicy.allowed) {
      setState({ kind: 'done', outcome: { kind: 'blocked', reason: enginePolicy.reason, blockers: enginePolicy.blocking.map((b) => b.uiCopy) } });
      return;
    }
    if (!authorityPolicy.allowed) {
      const reason = describeCreditApprovalAuthorityReason(authorityPolicy.reasonCode);
      setState({ kind: 'done', outcome: { kind: 'blocked', reason, blockers: [reason] } });
      return;
    }
    setState({ kind: 'saving' });
    const deps = buildLiveStageAdvanceDeps({
      actorSystemUserId: actor.systemUserId ?? '',
      actorEmail: actor.email,
    });
    const entryDateIso = new Date().toISOString();
    const outcome = await advanceWorkflowStage({
      authorized: Boolean(actor.systemUserId),
      dealId,
      correlationId: newCorrelationId('sa'),
      entryDateIso,
      workflow,
      requestedNextStageId: nextStageId,
      facts,
      advancingBankerAuthority: actor.creditAuthority,
      transport: deps.transport,
      auditSink: deps.auditSink,
      timelineSink: deps.timelineSink,
    });
    // On a verified advance, seed the destination stage's standard work as real governed tasks
    // (idempotent by title), then reload tasks + activity so the new work appears immediately.
    if (outcome.kind === 'advanced') {
      // Merge the readback-verified stage into the shared context FIRST — every cockpit
      // surface (header, Stage Map, Metric Deck, Attention Console, Copilot) reads the
      // deal off DealDataProvider, which refresh() never reloads. Without this, the whole
      // cockpit keeps showing the pre-advance stage until a hard reload.
      applyVerifiedDealPatch?.({
        stage: canonicalStageByCode(outcome.to)?.name ?? outcome.to,
        stageEntryDate: entryDateIso,
      });
      await generateDestinationStageWork({
        dealId,
        stageCode: nextStageId,
        actorSystemUserId: actor.systemUserId ?? '',
        actorEmail: actor.email ?? '',
        existingOpenTaskTitles: (facts.tasks?.open ?? []).map((t) => t.title),
      });
      refresh('after-task-complete');
    }
    setState({ kind: 'done', outcome });
  }

  if (workflow.nextPermittedStages.length === 0) return null;
  const saving = state.kind === 'saving';

  return (
    <div style={styles.advanceBox} data-stage-advance="control">
      <div style={styles.advanceLabel}>Advance stage</div>
      {/* Surface the GOVERNED exit criteria for the current stage, driven by the shared requirement
          engine (deriveStageExitReadiness). The advance button is gated on evaluateStageTransitionPolicy
          — the same fail-closed policy the write seam enforces — and the engine's live decision is
          proven equivalent to it, so display and button agree. */}
      <StageAdvanceRequirements
        stageCode={workflow.currentStage.id}
        nextLabel={workflow.nextPermittedStages[0]?.label ?? 'the next stage'}
        facts={facts}
      />
      <div style={styles.advanceButtons}>
        {workflow.nextPermittedStages.map((stage) => {
          const policy = evaluateStageTransitionPolicy(workflow, stage.id);
          const allowed = policy.allowed && enginePolicy.allowed && authorityPolicy.allowed;
          const disabled = saving || !allowed;
          const reason = !policy.allowed
            ? policy.reason
            : !enginePolicy.allowed
              ? enginePolicy.reason
              : !authorityPolicy.allowed
                ? describeCreditApprovalAuthorityReason(authorityPolicy.reasonCode)
                : undefined;
          return (
            <button
              key={stage.id}
              type="button"
              disabled={disabled}
              title={reason}
              style={{ ...styles.advanceButton, ...(disabled ? styles.advanceButtonDisabled : null) }}
              data-stage-advance-target={stage.id}
              data-stage-advance-allowed={allowed ? 'true' : 'false'}
              onClick={() => void onAdvance(stage.id)}
            >
              {`Advance to ${stage.label}`}
            </button>
          );
        })}
      </div>
      {state.kind === 'done' && (
        <p style={styles.advanceStatus} role="status" data-stage-advance-outcome={state.outcome.kind}>
          {describeStageAdvanceOutcome(state.outcome)}
        </p>
      )}
    </div>
  );
}

/**
 * The governed exit criteria for the current stage, driven by the shared requirement ENGINE
 * (deriveStageExitReadiness). TRACKED blocking requirements HOLD the move; recommended requirements
 * are visible but non-blocking; deep facts not yet tracked are shown as "future" (surfaced for
 * transparency, NOT enforced live until their major phase). Each item names WHERE it is resolved and
 * WHO owns it. The advance button gates on evaluateStageTransitionPolicy (the write-seam policy); the
 * engine's live decision is proven equivalent, so display and button agree. Logging a generic activity
 * is explicitly NOT a substitute for a governed requirement.
 */
function StageAdvanceRequirements({
  stageCode,
  nextLabel,
  facts,
}: {
  stageCode: LoanWorkflowStageId;
  nextLabel: string;
  facts: WorkflowRequirementFacts;
}) {
  const { blocking, recommended, untracked } = deriveStageExitReadiness(stageCode, facts);
  const { deal, refresh } = useDealData();
  const banker = useOptionalBanker();
  const canWrite = Boolean(banker?.systemUserId);
  // A single hosted add-required-document modal, opened preset to the specific blocking document —
  // the DIRECT remediation route for a missing required document from the Stage Map itself.
  const [addDocName, setAddDocName] = useState<string | null>(null);

  async function handleAddDoc(name: string, note: string): Promise<AddRequiredDocumentOutcome> {
    if (!banker?.systemUserId) return { kind: 'unknown', message: 'Cannot add: missing system user id.' };
    // Dynamic import keeps the generated Dataverse services (SDK) out of the card's static graph.
    const { addRequiredDocument } = await import('./addRequiredDocumentAction');
    const outcome = await addRequiredDocument({
      dealId: deal.id,
      documentName: name,
      systemUserId: banker.systemUserId,
      actorEmail: banker.email,
      intakeNote: note,
    });
    refresh('after-document-receive');
    return outcome;
  }

  if (blocking.length === 0 && recommended.length === 0 && untracked.length === 0) {
    return (
      <p style={styles.advanceReady} role="status" data-stage-advance-ready>
        {`This deal meets the current stage's exit criteria. Advancing to ${nextLabel} is a governed banker action — audited and readback-verified.`}
      </p>
    );
  }

  const row = (it: (typeof blocking)[number], sev: SeverityKey) => (
    <li key={it.id} style={styles.reqItem} data-req-severity={sev} data-req-where={it.whereToResolve} data-req-role={it.responsibleRole}>
      <SeverityGlyph severity={sev} />
      <span style={styles.reqLabel}>{it.uiCopy}</span>
      <span style={styles.reqWhere}>{`— ${it.whereToResolve} · ${it.responsibleRole}`}</span>
    </li>
  );

  // A hard blocker row carries a DIRECT remediation route to the operator action that resolves it,
  // so a banker never has to hunt across tabs for where a required value is entered.
  const blockingRow = (it: (typeof blocking)[number]) => (
    <li key={it.id} style={styles.reqItem} data-req-severity="blocked" data-req-where={it.whereToResolve} data-req-role={it.responsibleRole}>
      <SeverityGlyph severity="blocked" />
      <span style={styles.reqLabel}>{it.uiCopy}</span>
      <span style={styles.reqWhere}>{`— ${it.whereToResolve} · ${it.responsibleRole}`}</span>
      {canWrite && <BlockerRemediation route={remediationForRequirement(it)} onAddDocument={(name) => setAddDocName(name)} />}
    </li>
  );

  return (
    <div style={styles.reqBox} role="group" aria-label="Stage advance requirements" data-stage-advance-requirements>
      {blocking.length > 0 && (
        <>
          <div style={styles.reqTitle}>{`To advance to ${nextLabel}, complete these governed exit criteria:`}</div>
          <ul style={styles.reqList}>{blocking.map((it) => blockingRow(it))}</ul>
        </>
      )}
      {recommended.length > 0 && (
        <>
          <div style={styles.reqTitle}>
            {blocking.length > 0
              ? 'Recommended (these do not block the move):'
              : `Recommended before advancing to ${nextLabel} (these do not block the move):`}
          </div>
          <ul style={styles.reqList}>{recommended.map((it) => row(it, 'atRisk'))}</ul>
        </>
      )}
      {addDocName !== null && banker?.systemUserId && (
        <AddRequiredDocumentModal
          candidateNames={[addDocName]}
          presetName={addDocName}
          onConfirm={handleAddDoc}
          onClose={() => setAddDocName(null)}
        />
      )}
      {untracked.length > 0 && (
        <>
          <div style={styles.reqTitle}>Tracked in a later phase (not yet enforced):</div>
          <ul style={styles.reqList} data-stage-advance-future>
            {untracked.map((it) => (
              <li key={it.id} style={styles.reqItem} data-req-severity="future" data-req-where={it.whereToResolve} data-req-role={it.responsibleRole}>
                <span style={styles.reqLabel}>{it.label}</span>
                <span style={styles.reqWhere}>{`— ${it.whereToResolve} · ${it.responsibleRole}`}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p style={styles.reqFootnote}>
        These are the stage&rsquo;s governed exit criteria. Complete them in the linked cards to enable the
        advance. Logging an activity records a call, email, meeting, or note — it does not substitute for a
        required document, task, or field.
      </p>
    </div>
  );
}

/** Scroll a deal-cockpit element into view by CSS selector. Best-effort: a no-op when the target is
 *  not mounted (e.g. in a narrowed test). Used to jump a banker straight to the resolving surface. */
function scrollToSelector(selector: string): void {
  if (typeof document === 'undefined') return;
  const el = document.querySelector(selector);
  (el as HTMLElement | null)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * The direct remediation control for one hard blocker. The banker resolves the requirement in place:
 *   - a missing profile field (amount, target close, industry, …) → opens the governed Deal Profile;
 *   - a missing required document → opens the governed Add-required-document intake;
 *   - a missing CRM client → jumps to the Relationships panel where the governed link lives;
 *   - a task / credit item → jumps to that panel.
 * No read-only dead-ends: every hard blocker offers the action that clears it.
 */
function BlockerRemediation({ route, onAddDocument }: { route: RemediationRoute; onAddDocument: (documentName: string) => void }) {
  switch (route.kind) {
    case 'edit-profile':
      return <DealProfileEditLauncher source="attention-console" compact />;
    case 'add-document':
      return (
        <button type="button" style={styles.remediationButton} data-req-remediation="add-document" onClick={() => onAddDocument(route.documentName)}>
          Add document
        </button>
      );
    case 'link-client':
      return (
        <button type="button" style={styles.remediationButton} data-req-remediation="link-client" onClick={() => scrollToSelector('[data-crm-link-action="client"]')}>
          Link a CRM client
        </button>
      );
    case 'open-tasks':
      return (
        <button type="button" style={styles.remediationButton} data-req-remediation="open-tasks" onClick={() => scrollToSelector('[data-resolver-surface="Tasks"]')}>
          Open Tasks
        </button>
      );
    case 'credit-memo':
      return (
        <button type="button" style={styles.remediationButton} data-req-remediation="credit-memo" onClick={() => scrollToSelector('[data-resolver-surface="Credit Memo"]')}>
          Open Credit Memo
        </button>
      );
    case 'none':
      return null;
  }
}

function describeStageAdvanceOutcome(outcome: StageAdvanceOutcome): string {
  switch (outcome.kind) {
    case 'advanced':
      return `Stage advanced to ${outcome.to}.`;
    case 'disabled':
      return 'Stage advancement is not enabled yet; no change was made to the deal.';
    case 'blocked':
      return `Blocked: ${outcome.reason}`;
    case 'unauthorized':
    case 'dependency_not_ready':
      return outcome.detail;
    case 'update_failed':
      return `Stage update failed: ${outcome.detail}`;
    case 'readback_failed':
      return `Stage move unconfirmed — persistence could not be verified on readback: ${outcome.detail}`;
    case 'audit_failed_partial_success':
    case 'timeline_failed_partial_success':
      return outcome.detail;
    default:
      return 'Stage advance did not complete.';
  }
}

const styles: Record<string, React.CSSProperties> = {
  advanceBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    padding: `${spacing.sm} ${spacing.md}`,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
  },
  advanceLabel: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    fontWeight: typography.weight.semibold,
    color: palette.textMuted,
  },
  advanceButtons: { display: 'flex', flexWrap: 'wrap', gap: spacing.xs },
  advanceButton: {
    border: `1px solid ${palette.borderStrong}`,
    borderRadius: radius.sm,
    background: palette.primary,
    color: palette.primaryFg,
    padding: `${spacing.xs} ${spacing.sm}`,
    fontWeight: typography.weight.semibold,
    fontSize: typography.size.sm,
    cursor: 'pointer',
  },
  advanceButtonDisabled: {
    background: palette.surfaceAlt,
    color: palette.textSubtle,
    cursor: 'not-allowed',
  },
  advanceStatus: { margin: 0, fontSize: typography.size.sm, color: palette.textMuted },
  advanceReady: {
    margin: 0,
    fontSize: typography.size.sm,
    color: palette.clearFg,
    fontWeight: typography.weight.medium,
  },
  reqBox: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.xs,
    padding: `${spacing.xs} 0`,
  },
  reqTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: palette.text,
  },
  reqList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.xs,
  },
  reqItem: {
    display: 'flex',
    gap: spacing.xs,
    alignItems: 'baseline',
    fontSize: typography.size.sm,
    color: palette.text,
  },
  reqLabel: { color: palette.text },
  reqWhere: { color: palette.textSubtle, fontSize: typography.size.xs },
  remediationButton: {
    marginLeft: spacing.xs,
    background: 'transparent',
    color: palette.primary,
    border: `1px solid ${palette.primary}`,
    borderRadius: radius.sm,
    padding: `0 ${spacing.xs}`,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
    fontFamily: typography.family,
    whiteSpace: 'nowrap',
  },
  reqFootnote: {
    margin: 0,
    fontSize: typography.size.xs,
    color: palette.textMuted,
    lineHeight: typography.lineHeight.snug,
  },
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
