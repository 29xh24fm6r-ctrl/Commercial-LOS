import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBanker } from '../banker/BankerContext';
import { WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';
import { LendingOSLayout, type LendingOSNavKey } from '../banker/LendingOSLayout';
import { loadDealForBanker, type DealLoadResult } from './dealQueries';
import { DealHeader } from './DealHeader';
import { DealCockpitNav } from './DealCockpitNav';
import { DealMetricDeck } from './DealMetricDeck';
import { DealWorkstreamPanel } from './DealWorkstreamPanel';
import { DealSummary } from './DealSummary';
import { DealAutopilotPanel } from './DealAutopilotPanel';
import { RelationshipContext } from './RelationshipContext';
import { DealCrmRelationshipPanel } from '../crm/CrmRelationshipPanel';
import { DealBlockers } from './DealBlockers';
import { DealStageProgressionCard } from './DealStageProgressionCard';
import { DealGovernedTransitionPanel } from './DealGovernedTransitionPanel';
import { DealTasks } from './DealTasks';
import { DealDocuments } from './DealDocuments';
import { CreditMemo } from './CreditMemo';
import { GlobalCashFlowPanelConnected } from './GlobalCashFlowPanelConnected';
import { DealRiskRatingPanelConnected } from './DealRiskRatingPanelConnected';
import { DealClosingDocumentsPanel } from './DealClosingDocumentsPanel';
import { DealFundingAuthorizationPanelConnected } from './DealFundingAuthorizationPanelConnected';
import { DealServicingLifecyclePanel } from './DealServicingLifecyclePanel';
import { ActivityTimeline } from './ActivityTimeline';
import { BorrowerCommunication } from './BorrowerCommunication';
import { TeamsChatHandoff } from './TeamsChatHandoff';
import { TeamsDealSummaryHandoff } from './TeamsDealSummaryHandoff';
import { TeamsChannelPostPanel } from '../teamsChannelPosting/TeamsChannelPostPanel';
import { DealCopilotAssist } from '../copilot/DealCopilotAssist';
import { DealCalendarAvailabilityPanel } from '../calendar/DealCalendarAvailabilityPanel';
import { OutlookCalendarReadDiagnosticPanel } from '../calendar/OutlookCalendarReadDiagnosticPanel';
import { DealDataProvider } from './DealDataProvider';
import { BorrowerPackagePrepPanel } from '../workflow/BorrowerPackagePrepPanel';
import { CreditApprovalReadinessPanel } from '../workflow/CreditApprovalReadinessPanel';
import { DealCreditApprovalDecisionPanelConnected } from './DealCreditApprovalDecisionPanelConnected';
import { DealCommitmentPanelConnected } from './DealCommitmentPanelConnected';
import { DealConditionVerificationPanelConnected } from './DealConditionVerificationPanelConnected';
import { DealExecutedDocumentAttestationPanelConnected } from './DealExecutedDocumentAttestationPanelConnected';
import { DealBookingQcPanelConnected } from './DealBookingQcPanelConnected';
import { DealAdverseActionPanelConnected } from './DealAdverseActionPanelConnected';
import { ClosingBookingReadinessPanel } from '../workflow/ClosingBookingReadinessPanel';
import { DealPortfolioBoardingStatusPanel } from '../workflow/DealPortfolioBoardingStatusPanel';
import { DealWorkflowRoutingPanel } from '../workflow/DealWorkflowRoutingPanel';
import { DealIntelligenceProvider } from '../shared/dealIntelligenceContext';
import { DealIntelligenceBeacon } from '../shared/DealIntelligenceBeacon';
import { LoadingState } from '../shared/LoadingState';
import { ErrorState } from '../shared/ErrorState';
import { palette, radius, spacing, typography } from '../shared/theme';

interface BankerDealWorkspaceProps {
  dealId: string;
  /**
   * Phase 125F — the bootstrap-resolved workspace name passed
   * through by the DealRoute dispatcher so the Lending OS shell
   * sidebar can render the current-workspace pill consistently
   * with the BankerShell home page. Optional with a "Banker
   * Workspace" fallback so existing call-sites and tests don't
   * have to change.
   */
  workspaceName?: string;
}

/**
 * Phase 125B — Deal Workspace Command Center layout.
 *
 * Two-column cockpit grid below the navy hero band:
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ DealHeader (full-width navy hero band)                  │
 *   ├──────────────────────────┬──────────────────────────────┤
 *   │ LEFT  ~65% — intelligence│ RIGHT ~35% — attention / work│
 *   │                          │                              │
 *   │ DealSummary              │ DealBlockers                 │
 *   │ DealStageProgressionCard │ DealTasks                    │
 *   │ DealAutopilotPanel       │ DealDocuments                │
 *   │ RelationshipContext      │ BorrowerCommunication        │
 *   │ CreditMemo               │ TeamsChatHandoff             │
 *   │ ActivityTimeline         │ TeamsDealSummaryHandoff      │
 *   └──────────────────────────┴──────────────────────────────┘
 *
 * Every `data-deal-card` anchor from the pre-125B layout is
 * preserved verbatim so DealAutopilotPanel's scrollIntoView
 * targeting continues to work.
 *
 * Hook surface unchanged from Phase 125 (useBanker + useState +
 * useEffect). No new hooks. No conditional hooks. Phase 110
 * communication lock honored — no new email-lane import.
 */
export function BankerDealWorkspace({
  dealId,
  workspaceName = 'Banker Workspace',
}: BankerDealWorkspaceProps) {
  const { bankerId, fullName, email, systemUserId, roleType, creditAuthority } = useBanker();
  const [state, setState] = useState<DealLoadResult | { kind: 'loading' }>({ kind: 'loading' });
  const navigate = useNavigate();

  /**
   * Remediation 2026-07-22 (Workstream C) — the deal cockpit is a separate route from
   * BankerShell's own local-tab navigation, so a sidebar click here previously did nothing
   * (LendingOSLayout disables every nav button when `onNavSelect` is undefined). Navigate back to
   * the Banker Command Center carrying which tab to land on; BankerShell reads it on mount.
   */
  const handleNavSelect = (key: LendingOSNavKey) => {
    navigate(WORKSPACE_ROUTES.banker, { state: { initialTab: key } });
  };

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    loadDealForBanker(dealId, bankerId)
      .then((res) => {
        if (!cancelled) setState(res);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ kind: 'failed', message });
      });
    return () => {
      cancelled = true;
    };
  }, [dealId, bankerId]);

  // Phase 125F — the deal cockpit now renders inside the
  // Lending OS shell so the dark sidebar persists across the
  // banker home + the per-deal page. Loading / denied / not-
  // found / failed states all render inside the shell too so
  // the banker never loses navigation context.
  const shellWrap = (body: React.ReactNode) => (
    <LendingOSLayout
      activeNav="active-deals"
      onNavSelect={handleNavSelect}
      fullName={fullName}
      email={email}
      workspaceName={workspaceName}
    >
      {body}
    </LendingOSLayout>
  );

  if (state.kind === 'loading')
    return shellWrap(<LoadingState message="Loading deal…" />);

  if (state.kind === 'denied') {
    return shellWrap(
      <ErrorState
        title="Access denied"
        detail="This deal is not assigned to you."
        hint="Return to your workspace and open a deal from your pipeline."
      />,
    );
  }

  if (state.kind === 'not-found') {
    return shellWrap(
      <ErrorState
        title="Deal not found"
        detail="No deal exists with that id, or it has been removed."
        hint="Return to your workspace."
      />,
    );
  }

  if (state.kind === 'failed') {
    return shellWrap(
      <ErrorState
        title="Could not load deal"
        detail={state.message}
        hint="Refresh to retry."
      />,
    );
  }

  const { deal } = state;
  return shellWrap(
    <div style={styles.page} data-cockpit-shell="banker-deal">
      <nav style={styles.crumbs} aria-label="Breadcrumb">
        <Link to={WORKSPACE_ROUTES.banker} className="cc-link" style={styles.back}>
          ← Banker Command Center
        </Link>
        <span style={styles.crumbSep} aria-hidden="true">/</span>
        <span style={styles.crumbCurrent}>{deal.name}</span>
      </nav>
      <main style={styles.main}>
        <DealDataProvider deal={deal}>
          <DealIntelligenceProvider>
          {/* Phase 123B — pilot cockpit beacon. Renders nothing
              visible; pins the shared deal-intelligence view-model
              into the DOM via data-vm-* attributes so the cockpit
              has one observable contract for the shared deriver. */}
          <DealIntelligenceBeacon />
          {/* Phase 125D — Command Hero zone. Navy gradient band +
              glass metric strip carried over from Phase 125B/C. */}
          <section data-cockpit-zone="command-hero" aria-label="Command hero">
            <DealHeader />
          </section>
          {/* Phase 125D — Metric Deck zone. Bloomberg-style KPI
              strip + profile-completeness ring + missing-fields
              meter. Always renders below the hero so the banker
              has a fixed instrument panel at the top of every
              deal. */}
          <DealMetricDeck />
          {/* Phase 125G — anchor strip directly under the metric
              deck so the banker immediately sees that the page
              contains an Attention Console, Stage Map, Action
              Console, etc., and can jump to any of them. */}
          <DealCockpitNav />
          <div
            style={styles.cockpit}
            role="group"
            aria-label="Deal cockpit"
            data-cockpit-zone="grid"
          >
            <section
              style={styles.colLeft}
              aria-label="Deal intelligence and detail"
              data-cockpit-zone="intelligence-column"
            >
              {/* Phase 125E — Attention Console is the cockpit's
                  primary operating panel; render it first so the
                  banker sees attention items + missing data
                  immediately after the metric deck. */}
              <div id="attention-console" data-cockpit-anchor="attention-console">
                <DealBlockers />
              </div>
              {/* Phase 125E — Stage Map is the second-most-
                  prominent module: where is this deal? */}
              <div
                id="stage-map"
                data-deal-card="stage-progression"
                data-cockpit-anchor="stage-map"
              >
                <DealStageProgressionCard stageAdvanceActor={{ systemUserId, email, roleType, creditAuthority, bankerId }} />
                {/* Governance initiative (2026-07-21) — Return/Decline/Withdraw, mounted live
                    alongside the existing Advance control (see DealGovernedTransitionPanel's doc
                    comment for why Advance itself stays on DealStageProgressionCard). */}
                <DealGovernedTransitionPanel />
              </div>
              {/* Final LOS Completion arc (Workstream J) — durable Adverse Action Record. Renders
                  nothing unless this deal's status is DECLINED (see the panel's own doc comment). */}
              <div
                id="adverse-action"
                data-deal-card="adverse-action"
                data-cockpit-anchor="adverse-action"
              >
                <DealAdverseActionPanelConnected
                  dealId={deal.id}
                  dealStatus={deal.status}
                  authorized={Boolean(systemUserId)}
                  actorEmail={email}
                  systemUserId={systemUserId}
                />
              </div>
              {/* Stage reconciliation: the legacy Loan Workflow Command Center
                  (11-stage Opportunity/Qualification spine) was retired here so the
                  cockpit shows ONE canonical stage map (DealStageProgressionCard). */}
              {/* Phase 125E — Action Console. Deterministic
                  next-best actions. Banker decides. */}
              <div id="action-console" data-cockpit-anchor="action-console">
                <DealAutopilotPanel />
              </div>
              {/* Phase 125D — Workstream Panel: horizontal mini bars
                  for tasks / documents / memo / communication. */}
              <div id="workstreams" data-cockpit-anchor="workstreams">
                <DealWorkstreamPanel />
              </div>
              <div id="relationship" data-cockpit-anchor="relationship">
                <RelationshipContext />
              </div>
              {/* Phase 189C — read-only CRM Relationship panel. Renders the
                  Phase 189B view-model projection of the live relationship
                  graph (Deal → Client/Team/AssignedTo) behind the existing
                  authorized deal-workspace render path. No writes, no schema
                  change, no live persistence, no fabricated CRM spine. */}
              <div
                id="crm-relationship"
                data-deal-card="crm-relationship"
                data-cockpit-anchor="crm-relationship"
              >
                <DealCrmRelationshipPanel onNavigateToDeal={(id) => navigate(`/deals/${id}`)} />
              </div>
              <div
                id="credit-memo"
                data-deal-card="credit-memo"
                data-cockpit-anchor="credit-memo"
              >
                <CreditMemo />
              </div>
              {/* PR 105 -- Global Cash Flow DSCR calculator. Factory Arc Phase 4 wired real
                  persistence to cr664_financialspreadinputs (see
                  docs/factory-arc/PR116_GLOBAL_CASH_FLOW_PERSISTENCE.md). */}
              <div
                id="global-cash-flow"
                data-deal-card="global-cash-flow"
                data-cockpit-anchor="global-cash-flow"
              >
                <GlobalCashFlowPanelConnected deal={deal} authorized={Boolean(systemUserId)} actorEmail={email} actorSystemUserId={systemUserId} />
              </div>
              {/* PR 106 -- Risk Rating + Underwriting Recommendation capture. Factory Arc Phase 5
                  wired real persistence to cr664_riskratinginputs / cr664_underwritingrecommendationinputs
                  (see docs/factory-arc/PR117_RISK_RATING_PERSISTENCE.md). */}
              <div
                id="risk-rating"
                data-deal-card="risk-rating"
                data-cockpit-anchor="risk-rating"
              >
                <DealRiskRatingPanelConnected deal={deal} ratedBy={fullName} authorized={Boolean(systemUserId)} actorEmail={email} actorSystemUserId={systemUserId} />
              </div>
              <div
                id="credit-approval-readiness"
                data-deal-card="credit-approval-readiness"
                data-cockpit-anchor="credit-approval-readiness"
              >
                <CreditApprovalReadinessPanel />
              </div>
              {/* Final LOS Completion arc (Workstream C) — durable Credit Approval Decision record,
                  distinct from the read-only readiness projection above. */}
              <div
                id="credit-approval-decision"
                data-deal-card="credit-approval-decision"
                data-cockpit-anchor="credit-approval-decision"
              >
                <DealCreditApprovalDecisionPanelConnected
                  dealId={deal.id}
                  dealAmount={deal.amount}
                  authorized={Boolean(systemUserId)}
                  actorEmail={email}
                  systemUserId={systemUserId}
                  bankerId={bankerId}
                  creditAuthority={creditAuthority}
                  assignedBankerId={deal.assignedBankerId}
                />
              </div>
              {/* Final LOS Completion arc (Workstream D) — durable Commitment Record: issuance +
                  borrower response. */}
              <div
                id="commitment"
                data-deal-card="commitment"
                data-cockpit-anchor="commitment"
              >
                <DealCommitmentPanelConnected
                  dealId={deal.id}
                  authorized={Boolean(systemUserId)}
                  actorEmail={email}
                  systemUserId={systemUserId}
                />
              </div>
              {/* Final LOS Completion arc (Workstream E) — durable Condition Verification records:
                  conditions precedent, collateral, insurance. */}
              <div
                id="condition-verification"
                data-deal-card="condition-verification"
                data-cockpit-anchor="condition-verification"
              >
                <DealConditionVerificationPanelConnected
                  dealId={deal.id}
                  authorized={Boolean(systemUserId)}
                  actorEmail={email}
                  systemUserId={systemUserId}
                />
              </div>
              <div
                id="closing-booking-readiness"
                data-deal-card="closing-booking-readiness"
                data-cockpit-anchor="closing-booking-readiness"
              >
                <ClosingBookingReadinessPanel />
              </div>
              {/* PR 107 -- mounts the closing-document generation framework (49 tests,
                  previously entirely unmounted). Local-only pending schema (see
                  docs/factory-arc/PR107_CLOSING_FUNDING_ACTIVATION.md). */}
              <div
                id="closing-documents"
                data-deal-card="closing-documents"
                data-cockpit-anchor="closing-documents"
              >
                <DealClosingDocumentsPanel deal={deal} authorized={Boolean(systemUserId)} actorEmail={email} />
              </div>
              {/* Final LOS Completion arc (Workstream F) — durable Executed Document Attestation
                  record: distinct from document GENERATION above. */}
              <div
                id="executed-document-attestation"
                data-deal-card="executed-document-attestation"
                data-cockpit-anchor="executed-document-attestation"
              >
                <DealExecutedDocumentAttestationPanelConnected
                  dealId={deal.id}
                  authorized={Boolean(systemUserId)}
                  actorEmail={email}
                  systemUserId={systemUserId}
                />
              </div>
              {/* Final LOS Completion arc (Workstream H) — durable Booking QC Check record. */}
              <div
                id="booking-qc"
                data-deal-card="booking-qc"
                data-cockpit-anchor="booking-qc"
              >
                <DealBookingQcPanelConnected
                  dealId={deal.id}
                  authorized={Boolean(systemUserId)}
                  actorEmail={email}
                  systemUserId={systemUserId}
                />
              </div>
              {/* PR 111 -- mounts the funding-authorization framework (61+ tests, previously entirely
                  unmounted). Local-only pending schema (see
                  docs/final-seven-workstreams/07_FUNDING_AUTHORIZATION_FRAMEWORK.md). */}
              <div
                id="funding-authorization"
                data-deal-card="funding-authorization"
                data-cockpit-anchor="funding-authorization"
              >
                <DealFundingAuthorizationPanelConnected deal={deal} authorized={Boolean(systemUserId)} actorEmail={email} />
              </div>
              <div
                id="portfolio-boarding-status"
                data-deal-card="portfolio-boarding-status"
                data-cockpit-anchor="portfolio-boarding-status"
              >
                <DealPortfolioBoardingStatusPanel />
              </div>
              {/* PR 111 -- mounts the servicing lifecycle deriver family (src/servicing/*, Phase
                  142E, previously entirely unmounted) against a real live loader. Fully live and
                  read-only; renders nothing until the deal's stage claims BOARDED (see
                  DealServicingLifecyclePanel's doc comment). */}
              <div
                id="servicing-lifecycle"
                data-deal-card="servicing-lifecycle"
                data-cockpit-anchor="servicing-lifecycle"
              >
                <DealServicingLifecyclePanel />
              </div>
              {/* ARC Phase 3 — Phase 142C configurable workflow-routing engine,
                  wired live against this deal. Read-only decision support only. */}
              <div
                id="workflow-routing"
                data-deal-card="workflow-routing"
                data-cockpit-anchor="workflow-routing"
              >
                <DealWorkflowRoutingPanel />
              </div>
              <div
                id="activity-timeline"
                data-deal-card="activity-timeline"
                data-cockpit-anchor="activity-timeline"
              >
                <ActivityTimeline />
              </div>
              {/* Phase 125E — Deal Summary demoted to the bottom
                  of the cockpit. It's a reference table, not the
                  main attraction. */}
              <div
                id="deal-summary"
                data-deal-card="deal-summary"
                data-cockpit-anchor="deal-summary"
              >
                <DealSummary />
              </div>
            </section>
            <section
              style={styles.colRight}
              aria-label="Attention and work surfaces"
              data-cockpit-zone="right-rail-dashboard"
            >
              <div data-deal-card="tasks">
                <DealTasks />
              </div>
              <div data-deal-card="documents">
                <DealDocuments />
              </div>
              <div data-deal-card="borrower-communication">
                <BorrowerCommunication />
              </div>
              <div data-deal-card="borrower-package-prep">
                <BorrowerPackagePrepPanel />
              </div>
              {/* M365-2: governed read-only Outlook calendar / banker availability.
                  Default mode is disabled; the panel never creates meetings. */}
              <div data-deal-card="calendar-availability">
                <DealCalendarAvailabilityPanel />
              </div>
              <div data-deal-card="calendar-read-diagnostic">
                <OutlookCalendarReadDiagnosticPanel />
              </div>
              {/* Phase 86: no-admin Teams chat handoff. */}
              <div data-deal-card="teams-chat-handoff">
                <TeamsChatHandoff />
              </div>
              {/* Phase 96: copy-to-Teams deal summary. */}
              <div data-deal-card="teams-deal-summary-handoff">
                <TeamsDealSummaryHandoff />
              </div>
              {/* M365-5: governed server-side Teams channel posting boundary.
                  Defaults disabled/not-configured; no browser Graph call. */}
              <div data-deal-card="teams-channel-post">
                <TeamsChannelPostPanel />
              </div>
              {/* Phase 130A: read-only Copilot assist (connector not
                  configured). Context-only local summaries built from
                  the data already loaded by DealDataProvider. */}
              <div data-deal-card="copilot-assist">
                <DealCopilotAssist />
              </div>
            </section>
          </div>
          </DealIntelligenceProvider>
        </DealDataProvider>
      </main>
    </div>,
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: typography.family,
    minHeight: '100vh',
    // Phase 125D — slate cockpit backdrop. The page now reads as
    // a cockpit "platform" the deal panels sit on top of, instead
    // of a stack of white cards floating against the pageBg. Cards
    // keep their own surface; the slate panel gives the cockpit
    // dimensional anchoring.
    background: palette.panelBg,
    color: palette.text,
  },
  crumbs: {
    padding: `${spacing.md} ${spacing.xxl} 0`,
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    fontSize: typography.size.sm,
  },
  back: {
    fontSize: typography.size.sm,
  },
  crumbSep: {
    color: palette.textSubtle,
  },
  crumbCurrent: {
    color: palette.textMuted,
    fontWeight: typography.weight.medium,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
    maxWidth: 360,
  },
  main: {
    padding: `${spacing.md} ${spacing.xxl} ${spacing.xxl}`,
  },
  cockpit: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.85fr) minmax(0, 1fr)',
    gap: spacing.lg,
    alignItems: 'start',
  },
  colLeft: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.lg,
    minWidth: 0,
  },
  colRight: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.lg,
    minWidth: 0,
    // Phase 125C → 125D — subtle cobalt liquid-glass overlay
    // behind the right-rail "dashboard". Phase 125D bumps the
    // top tint slightly so the right rail reads as a distinct
    // operating-cockpit dashboard against the slate page bg.
    background:
      'linear-gradient(180deg, rgba(96, 165, 250, 0.07) 0%, rgba(248, 250, 252, 0.0) 35%)',
    borderRadius: radius.md,
    padding: spacing.sm,
    paddingTop: 0,
  },
};
