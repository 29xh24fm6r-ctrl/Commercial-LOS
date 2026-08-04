import { useState } from 'react';
import { useDealData, type AsyncResult } from './DealDataProvider';
import { useOptionalBanker } from '../banker/BankerContext';
import type {
  DealDocument,
  DealDocumentsResult,
  DocumentStatus,
} from './dealDocumentQueries';
import {
  markDocumentReceived,
  markDocumentReviewed,
  requestDocument,
  type MarkDocumentReceivedOutcome,
  type MarkDocumentReviewedOutcome,
  type RequestDocumentOutcome,
} from './documentActions';
import type { AddRequiredDocumentOutcome } from './addRequiredDocumentAction';
import { AddRequiredDocumentModal } from './AddRequiredDocumentModal';
import { deriveDealBlockerModelForStage } from './dealBlockerModel';
import { mergeDocumentRequirementBlockers } from './documentRequirementBlockerMerge';
import type { DocumentRequirementRow } from './documentRequirementLifecycle';
import type { RequiredDocumentDefinition } from './documentRequirementDerivation';
import {
  sendDocumentRequestEmail,
  type SendDocumentRequestEmailOutcome,
} from './sendDocumentRequestEmail';
import {
  prepareDocumentRequestHandoff,
  type PrepareDocumentRequestHandoffOutcome,
  type HandoffMethod,
} from './prepareDocumentRequestHandoff';
import {
  createDocumentReviewTask,
  type CreateDocumentReviewTaskOutcome,
} from './dealTaskActions';
import { EMAIL_MODE } from './emailDelivery/emailMode';
import { deriveBankerIdentityGatedAvailability } from './bankerIdentityGatedAvailability';
import { findDocumentReceivedByActorName } from './documentReceivedByLookup';
import type { TimelineEvent } from './activityQueries';
import { describeUnavailability } from '../shared/governance/operationalCapabilityState';
import { toOperationalCapabilityState } from '../shared/governance/capabilityAvailability';
import { uploadDocumentFile, type UploadDocumentFileOutcome } from './documentUploadAction';
import { buildLiveDocumentUploadDeps } from './documentUploadLiveDeps';
import { isDocumentFileUploadEnabled } from './dealOriginationFeatureFlags';
import {
  downloadDocumentFile,
  type DownloadDocumentFileOutcome,
} from './documentDownloadAction';
import { buildLiveDocumentDownloadDeps } from './documentDownloadLiveDeps';
import { DocumentIntakeSummary } from './documentIntake/DocumentIntakeSummary';
import { SharePointLoanFolderCard } from './documentIntake/SharePointLoanFolderCard';
import { DueDiligenceChecklist } from './documentIntake/DueDiligenceChecklist';
import type { UnderwritingIntakeReadiness } from './documentIntake/documentIntakeReadiness';
import { ReceiveDocumentModal } from './ReceiveDocumentModal';
import { RequestDocumentModal } from './RequestDocumentModal';
import { ReviewDocumentModal } from './ReviewDocumentModal';
import { CreateDocumentReviewTaskModal } from './CreateDocumentReviewTaskModal';
import { DocumentRequirementWorkspace } from './DocumentRequirementWorkspace';
import { Card } from '../shared/Card';
import { Badge, StatusDot } from '../shared/Badge';
import { parseCalendarDate } from '../shared/formatters';
import { WidgetHeader } from '../shared/cockpitPrimitives';
import { DocumentsIcon } from '../shared/cockpitIcons';
import {
  PENDING_REVIEW_AT_RISK_DAYS,
  isReceivedDocumentPendingReview,
} from '../shared/workQueue/primitives';
import { palette, radius, spacing, typography, type SeverityKey } from '../shared/theme';
import {
  deriveRiskRatingRecordFromDeal,
  deriveUnderwritingRecommendationRecordFromDeal,
} from '../workflow/underwritingDeepFacts';

interface DealDocumentsProps {
  /** Phase 36: read-only manager path — no Request button, no
   *  modal, no writeDisabledReason banner. Defaults to false. */
  readOnly?: boolean;
}

export function DealDocuments({ readOnly = false }: DealDocumentsProps = {}) {
  const { deal, documents, tasks, creditMemo, activity, fundingAuthorization, refresh } = useDealData();
  const banker = useOptionalBanker();
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [pendingRequestDoc, setPendingRequestDoc] = useState<DealDocument | null>(
    null,
  );
  const [pendingReceiveDoc, setPendingReceiveDoc] = useState<DealDocument | null>(
    null,
  );
  const [pendingReviewDoc, setPendingReviewDoc] = useState<DealDocument | null>(
    null,
  );
  // Phase 70: pending-review row "Create review task" surface.
  const [pendingReviewTaskDoc, setPendingReviewTaskDoc] =
    useState<DealDocument | null>(null);
  const openTasks = tasks.kind === 'ready' ? tasks.data.open : [];
  // Populated by DocumentRequirementWorkspace after each (re)load so this card's own
  // blocker computation can union in dynamically-derived requirements (see below).
  const [requirementRows, setRequirementRows] = useState<readonly DocumentRequirementRow[]>([]);
  const [requirementDefinitions, setRequirementDefinitions] = useState<readonly RequiredDocumentDefinition[]>([]);
  const [requirementReloadToken, setRequirementReloadToken] = useState(0);

  async function handleRequestConfirm(note: string): Promise<RequestDocumentOutcome> {
    if (!pendingRequestDoc || !banker?.systemUserId || !borrowerRequestSendAvailability.available) {
      return { kind: 'unknown', message: 'Cannot submit: missing document or system user id.' };
    }
    const outcome = await requestDocument({
      documentId: pendingRequestDoc.id,
      documentName: pendingRequestDoc.name,
      // dealId is the ALREADY-AUTHORIZED deal id from DealDataProvider —
      // never trusted from the route param directly.
      dealId: deal.id,
      priorRequestDate: pendingRequestDoc.requestDate,
      systemUserId: banker.systemUserId,
      actorEmail: banker.email,
      requestNote: note,
    });
    refresh('after-document-request');
    setRequirementReloadToken((token) => token + 1);
    return outcome;
  }

  async function handleSendEmail(emailInput: {
    recipient: string;
    subject: string;
    body: string;
  }): Promise<SendDocumentRequestEmailOutcome> {
    if (!pendingRequestDoc || !banker?.systemUserId || !borrowerRequestSendAvailability.available) {
      return {
        kind: 'unknown',
        message: 'Cannot send: missing document or system user id.',
      };
    }
    const outcome = await sendDocumentRequestEmail({
      documentId: pendingRequestDoc.id,
      documentName: pendingRequestDoc.name,
      dealId: deal.id,
      systemUserId: banker.systemUserId,
      actorEmail: banker.email,
      recipient: emailInput.recipient,
      subject: emailInput.subject,
      body: emailInput.body,
    });
    refresh('after-document-request-email');
    return outcome;
  }

  async function handlePrepareHandoff(handoffInput: {
    recipient: string;
    subject: string;
    body: string;
    method: HandoffMethod;
  }): Promise<PrepareDocumentRequestHandoffOutcome> {
    if (!pendingRequestDoc || !banker?.systemUserId || !borrowerRequestSendAvailability.available) {
      return {
        kind: 'unknown',
        message: 'Cannot prepare handoff: missing document or system user id.',
      };
    }
    const outcome = await prepareDocumentRequestHandoff({
      documentId: pendingRequestDoc.id,
      documentName: pendingRequestDoc.name,
      dealId: deal.id,
      systemUserId: banker.systemUserId,
      actorEmail: banker.email,
      recipient: handoffInput.recipient,
      subject: handoffInput.subject,
      body: handoffInput.body,
      method: handoffInput.method,
      mode: EMAIL_MODE,
    });
    refresh('after-document-request-handoff');
    return outcome;
  }

  async function handleReceiveConfirm(
    note: string,
  ): Promise<MarkDocumentReceivedOutcome> {
    if (!pendingReceiveDoc || !banker?.systemUserId) {
      return { kind: 'unknown', message: 'Cannot submit: missing document or system user id.' };
    }
    const outcome = await markDocumentReceived({
      documentId: pendingReceiveDoc.id,
      documentName: pendingReceiveDoc.name,
      dealId: deal.id,
      systemUserId: banker.systemUserId,
      actorEmail: banker.email,
      receiveNote: note,
    });
    refresh('after-document-receive');
    setRequirementReloadToken((token) => token + 1);
    return outcome;
  }

  async function handleDownloadFile(
    doc: DealDocument,
  ): Promise<DownloadDocumentFileOutcome> {
    if (!banker?.email) {
      return {
        kind: 'identity-unresolved',
        reason: 'A signed-in banker identity is required to download this file.',
      };
    }
    const outcome = await downloadDocumentFile(
      {
        documentId: doc.id,
        dealId: deal.id,
        fileName: doc.originalFileName ?? doc.name,
        mimeType: doc.mimeType,
        actorEmail: banker.email,
      },
      buildLiveDocumentDownloadDeps(),
    );
    if (outcome.kind === 'success') {
      const blob = new Blob([Uint8Array.from(outcome.content).buffer], {
        type: outcome.mimeType,
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = outcome.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    }
    return outcome;
  }

  async function handleUploadFile(file: File): Promise<UploadDocumentFileOutcome> {
    if (!pendingReceiveDoc || !banker?.email) {
      return { kind: 'unknown', message: 'Cannot upload: missing document or actor identity.' };
    }
    const outcome = await uploadDocumentFile(
      {
        documentId: pendingReceiveDoc.id,
        documentName: pendingReceiveDoc.name,
        dealId: deal.id,
        actorEmail: banker.email,
        fileName: file.name,
        mimeType: file.type,
        content: new Uint8Array(await file.arrayBuffer()),
      },
      buildLiveDocumentUploadDeps(),
    );
    refresh('after-document-receive');
    setRequirementReloadToken((token) => token + 1);
    return outcome;
  }

  async function handleReviewConfirm(
    note: string,
  ): Promise<MarkDocumentReviewedOutcome> {
    if (!pendingReviewDoc || !banker?.systemUserId) {
      return { kind: 'unknown', message: 'Cannot submit: missing document or system user id.' };
    }
    const outcome = await markDocumentReviewed({
      documentId: pendingReviewDoc.id,
      documentName: pendingReviewDoc.name,
      dealId: deal.id,
      systemUserId: banker.systemUserId,
      actorEmail: banker.email,
      reviewerName: banker.fullName,
      reviewNote: note,
      receivedByCoreUserId: pendingReviewDoc.receivedByCoreUserId,
    });
    refresh('after-document-review');
    setRequirementReloadToken((token) => token + 1);
    return outcome;
  }

  async function handleCreateReviewTaskConfirm(
    note: string,
  ): Promise<CreateDocumentReviewTaskOutcome> {
    if (!pendingReviewTaskDoc || !banker?.systemUserId) {
      return {
        kind: 'unknown',
        message: 'Cannot submit: missing document or system user id.',
      };
    }
    const outcome = await createDocumentReviewTask({
      dealId: deal.id,
      documentId: pendingReviewTaskDoc.id,
      documentName: pendingReviewTaskDoc.name,
      systemUserId: banker.systemUserId,
      actorEmail: banker.email,
      bankerName: banker.fullName,
      followUpNote: note,
    });
    refresh('after-document-review-task-create');
    return outcome;
  }

  async function handleAddDocConfirm(name: string, note: string): Promise<AddRequiredDocumentOutcome> {
    if (!banker?.systemUserId) {
      return { kind: 'unknown', message: 'Cannot add: missing system user id.' };
    }
    // Dynamic import keeps the generated Dataverse services (SDK) out of this card's static graph.
    const { addRequiredDocument } = await import('./addRequiredDocumentAction');
    const outcome = await addRequiredDocument({
      dealId: deal.id,
      documentName: name,
      systemUserId: banker.systemUserId,
      actorEmail: banker.email,
      intakeNote: note,
    });
    // Reload documents (+ activity) so the requirement clears and the new row survives refresh.
    refresh('after-document-receive');
    setRequirementReloadToken((token) => token + 1);
    return outcome;
  }

  // Missing mandatory documents for the current stage, from the ONE authoritative blocker model —
  // these seed the "Add required document" picker so the banker sees exactly what advancement needs.
  const coreBlockerModel = deriveDealBlockerModelForStage(deal.stage, {
    deal,
    tasks: tasks.kind === 'ready' ? tasks.data : undefined,
    documents: documents.kind === 'ready' ? documents.data : undefined,
    creditMemo: creditMemo.kind === 'ready' ? creditMemo.data : undefined,
    // Factory Arc Phase 12 — feeds CLOSING_FUNDING:funds_disbursed.
    fundingAuthorization: fundingAuthorization?.kind === 'ready' ? fundingAuthorization.data : undefined,
    riskRating: deriveRiskRatingRecordFromDeal(deal),
    underwritingRecommendation: deriveUnderwritingRecommendationRecordFromDeal(deal),
  });
  // Additively unions in any unsatisfied dynamically-derived document requirement
  // (documentRequirementDerivation.ts) the static per-stage engine above doesn't
  // already know about — an acknowledged-but-not-yet-reviewed requirement keeps
  // counting here, exactly like any other hard blocker.
  const blockerModel =
    coreBlockerModel && requirementRows.length > 0
      ? mergeDocumentRequirementBlockers(coreBlockerModel, requirementRows, requirementDefinitions)
      : coreBlockerModel;
  const missingRequiredDocuments = blockerModel?.missingRequiredDocuments ?? [];

  // Factory Arc Phase 6 — canWrite derives from ONE normalized
  // CapabilityAvailability rather than an ad hoc identity boolean.
  // `readOnly` stays a separate, deal-scoped view gate (not a capability fact).
  // Not memoized: new Date() inside a useMemo body defeats React Compiler's
  // memoization-preservation check, and this derivation is cheap regardless.
  const documentRequirementWritesAvailability = deriveBankerIdentityGatedAvailability(
    'document-requirement-writes',
    { systemUserId: banker?.systemUserId, writeDisabledReason: banker?.writeDisabledReason },
    new Date().toISOString(),
  );
  const canWrite = !readOnly && documentRequirementWritesAvailability.available;
  // Same underlying identity fact gates the borrower-request-send handlers below
  // (request / email / handoff) — no separate transport-readiness fact exists
  // pre-click today (EMAIL_MODE's DRY_RUN/LIVE/HANDOFF distinction is an
  // honest post-send outcome concern owned by Phase 10, left untouched here).
  const borrowerRequestSendAvailability = deriveBankerIdentityGatedAvailability(
    'borrower-request-sends',
    { systemUserId: banker?.systemUserId, writeDisabledReason: banker?.writeDisabledReason },
    new Date().toISOString(),
  );

  // Phase 125E — right-rail operational widget. Outstanding count
  // drives the tonal CountBadge; received+reviewed / total drives
  // the mini progress bar.
  const outstandingCount =
    documents.kind === 'ready' ? documents.data.outstanding.length : 0;
  const receivedCount =
    documents.kind === 'ready' ? documents.data.received.length : 0;
  const reviewedCount =
    documents.kind === 'ready' ? documents.data.reviewed.length : 0;
  const totalDocs = outstandingCount + receivedCount + reviewedCount;
  const doneDocs = receivedCount + reviewedCount;
  const docTone =
    outstandingCount === 0 && missingRequiredDocuments.length === 0
      ? 'clear'
      : 'atRisk';
  const intakeReadiness: UnderwritingIntakeReadiness = {
    status: 'CONFIGURATION_REQUIRED',
    totalApplicable: requirementDefinitions.length,
    received: 0,
    pendingReview: receivedCount,
    outstanding: Math.max(requirementDefinitions.length, outstandingCount),
    approvedExceptions: requirementRows.filter((row) => row.status === 'waived').length,
    blockers: ['SharePoint Online generated service and persisted folder/file schema are required before production readiness can be derived.'],
  };

  return (
    <>
      <DocumentIntakeSummary companyLegalName={deal.effectiveClientName ?? deal.clientName} dealNumber={deal.name} readiness={intakeReadiness} />
      <SharePointLoanFolderCard status="CONFIGURATION_REQUIRED" canCreate={false} />
      <Card anchorSurface="Documents">
        <WidgetHeader
          title="Documents"
          subtitle={subtitleFor(documents)}
          icon={<DocumentsIcon />}
          iconTone={docTone}
          count={
            documents.kind === 'ready'
              ? Math.max(outstandingCount, missingRequiredDocuments.length)
              : undefined
          }
          countTone={docTone}
          progress={
            documents.kind === 'ready'
              ? {
                  done: doneDocs,
                  total: totalDocs,
                  'aria-label': `Documents ${doneDocs} of ${totalDocs} received or reviewed`,
                }
              : undefined
          }
        />
        {/* banker !== null distinguishes "confirmed unavailable" from "banker context still
            resolving" — the latter must stay silent, not flash a disabled banner. */}
        {!readOnly && banker !== null && !documentRequirementWritesAvailability.available && (
          <p style={styles.writeDisabledBanner} role="status">
            <strong>Request disabled:</strong>{' '}
            {describeUnavailability(toOperationalCapabilityState(documentRequirementWritesAvailability))}
          </p>
        )}
        {canWrite && (
          <div style={styles.docActionRow}>
            <button
              type="button"
              onClick={() => setShowAddDoc(true)}
              style={styles.addDocButton}
              data-add-required-document
            >
              + Add required document
            </button>
            {missingRequiredDocuments.length > 0 && (
              <span style={styles.docActionHint} data-add-required-document-missing>
                {missingRequiredDocuments.length} governed stage requirement
                {missingRequiredDocuments.length === 1 ? '' : 's'} not yet satisfied.
                This is separate from the {outstandingCount} checklist row
                {outstandingCount === 1 ? '' : 's'} awaiting receipt.
              </span>
            )}
          </div>
        )}
        <Body
          documents={documents}
          activity={activity}
          canWrite={canWrite}
          onRequest={(doc) => setPendingRequestDoc(doc)}
          onReceive={(doc) => setPendingReceiveDoc(doc)}
          onReview={(doc) => setPendingReviewDoc(doc)}
          onCreateReviewTask={(doc) => setPendingReviewTaskDoc(doc)}
          onDownload={banker ? handleDownloadFile : undefined}
        />
      </Card>
      {/* The real banker-managed underwriting document requirement workflow — requirements
          are derived from this deal's type/product/borrower/guarantors/collateral/stage
          (documentRequirementDerivation.ts), never a hardcoded name list. Every action is
          authenticated, audited, duplicate-safe, and bound to this authorized deal + banker. */}
      {!readOnly && banker && (
        <DocumentRequirementWorkspace
          dealId={deal.id}
          deal={{
            productType: deal.productType,
            loanStructure: deal.loanStructure,
            customerType: deal.customerType,
            guarantorStructure: deal.guarantorStructure,
            collateralSummary: deal.collateralSummary,
            industry: deal.industry,
            stage: deal.stage,
            documentPackageDate: deal.createdOn,
          }}
          banker={{ systemUserId: banker.systemUserId, email: banker.email, fullName: banker.fullName }}
          reloadToken={requirementReloadToken}
          onAfterAction={() => refresh('documents')}
          onRowsLoaded={(rows, definitions) => {
            setRequirementRows(rows);
            setRequirementDefinitions(definitions);
          }}
        />
      )}
      {!readOnly && showAddDoc && banker?.systemUserId && (
        <AddRequiredDocumentModal
          candidateNames={missingRequiredDocuments}
          onConfirm={handleAddDocConfirm}
          onClose={() => setShowAddDoc(false)}
        />
      )}
      {!readOnly && pendingRequestDoc && (
        <RequestDocumentModal
          doc={pendingRequestDoc}
          onConfirm={handleRequestConfirm}
          onSendEmail={handleSendEmail}
          onPrepareHandoff={handlePrepareHandoff}
          onClose={() => setPendingRequestDoc(null)}
        />
      )}
      {!readOnly && pendingReceiveDoc && (
        <ReceiveDocumentModal
          doc={pendingReceiveDoc}
          onConfirm={handleReceiveConfirm}
          onClose={() => setPendingReceiveDoc(null)}
          // File upload UI only renders once DOCUMENT_FILE_UPLOAD_ENABLED is armed (after the
          // schema in scripts/dataverse/create-document-checklist-file-columns.ps1 exists live) —
          // this component itself stays flag-agnostic; ReceiveDocumentModal falls back to the
          // unchanged metadata-only flow when this prop is omitted.
          onUploadFile={isDocumentFileUploadEnabled() ? handleUploadFile : undefined}
        />
      )}
      {!readOnly && pendingReviewDoc && banker?.fullName && (
        <ReviewDocumentModal
          doc={pendingReviewDoc}
          reviewerName={banker.fullName}
          onConfirm={handleReviewConfirm}
          onClose={() => setPendingReviewDoc(null)}
        />
      )}
      {!readOnly && pendingReviewTaskDoc && (
        <CreateDocumentReviewTaskModal
          doc={pendingReviewTaskDoc}
          openTasks={openTasks}
          bankerName={banker?.fullName}
          onConfirm={handleCreateReviewTaskConfirm}
          onClose={() => setPendingReviewTaskDoc(null)}
        />
      )}
      <DueDiligenceChecklist />
    </>
  );
}

function subtitleFor(documents: AsyncResult<DealDocumentsResult>): string | undefined {
  if (documents.kind !== 'ready') return undefined;
  const { outstanding, received, reviewed } = documents.data;
  const total = outstanding.length + received.length + reviewed.length;
  if (total === 0) return undefined;
  // Phase 54: count of received documents that have sat unreviewed
  // past the at-risk threshold. Displayed only when non-zero so the
  // subtitle stays calm under normal load.
  const nowMs = Date.now();
  const pendingReviewCount = received.filter((d) =>
    isReceivedDocumentPendingReview({
      receivedDate: d.receivedDate,
      reviewer: d.reviewer,
      nowMs,
    }),
  ).length;
  const base = `${outstanding.length} awaiting receipt · ${received.length} awaiting review · ${reviewed.length} reviewed`;
  return pendingReviewCount > 0
    ? `${base} · ${pendingReviewCount} may require review`
    : base;
}

function Body({
  documents,
  activity,
  canWrite,
  onRequest,
  onReceive,
  onReview,
  onCreateReviewTask,
  onDownload,
}: {
  documents: AsyncResult<DealDocumentsResult>;
  activity: AsyncResult<TimelineEvent[]>;
  canWrite: boolean;
  onRequest: (doc: DealDocument) => void;
  onReceive: (doc: DealDocument) => void;
  onReview: (doc: DealDocument) => void;
  onCreateReviewTask: (doc: DealDocument) => void;
  onDownload?: (doc: DealDocument) => Promise<DownloadDocumentFileOutcome>;
}) {
  if (documents.kind === 'loading') return <p style={styles.muted}>Loading documents…</p>;
  if (documents.kind === 'failed')
    return <ErrorBlock title="Could not load documents" detail={documents.message} />;

  const { outstanding, received, reviewed } = documents.data;
  const total = outstanding.length + received.length + reviewed.length;
  if (total === 0) return <p style={styles.muted}>No documents on this deal yet.</p>;
  // D8 remediation: cr664_documentchecklist has no "received by" column
  // (only cr664_receiveddate); the receiving actor is captured on the
  // DocumentUploaded timeline event markDocumentReceived already emits.
  // `activity` may still be loading/failed — that's honestly "unknown",
  // never a fabricated name.
  const activityEvents = activity.kind === 'ready' ? activity.data : undefined;

  return (
    <div style={styles.lists}>
      <Group
        groupLabel="Awaiting receipt"
        documents={outstanding}
        emptyHint="No checklist rows are awaiting receipt."
        status="outstanding"
        canWrite={canWrite}
        activityEvents={activityEvents}
        onRequest={onRequest}
        onReceive={onReceive}
        onReview={onReview}
        onCreateReviewTask={onCreateReviewTask}
        onDownload={onDownload}
      />
      <Group
        groupLabel="Received"
        documents={received}
        emptyHint="None received yet."
        status="received"
        canWrite={canWrite}
        activityEvents={activityEvents}
        onRequest={onRequest}
        onReceive={onReceive}
        onReview={onReview}
        onCreateReviewTask={onCreateReviewTask}
        onDownload={onDownload}
      />
      <Group
        groupLabel="Reviewed"
        documents={reviewed}
        emptyHint="No reviewed documents yet."
        status="reviewed"
        canWrite={false}
        activityEvents={activityEvents}
        onRequest={onRequest}
        onReceive={onReceive}
        onReview={onReview}
        onCreateReviewTask={onCreateReviewTask}
        onDownload={onDownload}
      />
    </div>
  );
}

function Group({
  groupLabel,
  documents,
  emptyHint,
  status,
  canWrite,
  activityEvents,
  onRequest,
  onReceive,
  onReview,
  onCreateReviewTask,
  onDownload,
}: {
  groupLabel: string;
  documents: DealDocument[];
  emptyHint: string;
  status: DocumentStatus;
  canWrite: boolean;
  activityEvents: readonly TimelineEvent[] | undefined;
  onRequest: (doc: DealDocument) => void;
  onReceive: (doc: DealDocument) => void;
  onReview: (doc: DealDocument) => void;
  onCreateReviewTask: (doc: DealDocument) => void;
  onDownload?: (doc: DealDocument) => Promise<DownloadDocumentFileOutcome>;
}) {
  return (
    <div style={styles.group}>
      <div style={styles.groupHeaderRow}>
        <h4 style={styles.groupHeading}>{groupLabel}</h4>
        <Badge variant="neutral">{documents.length}</Badge>
      </div>
      {documents.length === 0 ? (
        <p style={styles.muted}>{emptyHint}</p>
      ) : (
        <ul style={styles.list}>
          {documents.map((d) => (
            <DocumentRow
              key={d.id}
              doc={d}
              status={status}
              canWrite={canWrite}
              receivedBy={status === 'received' ? findDocumentReceivedByActorName(activityEvents, d.id) : undefined}
              onRequest={onRequest}
              onReceive={onReceive}
              onReview={onReview}
              onCreateReviewTask={onCreateReviewTask}
              onDownload={onDownload}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function DocumentRow({
  doc,
  status,
  canWrite,
  receivedBy,
  onRequest,
  onReceive,
  onReview,
  onCreateReviewTask,
  onDownload,
}: {
  doc: DealDocument;
  status: DocumentStatus;
  canWrite: boolean;
  /** D8 — who received this document, derived from the timeline (undefined = unknown, never fabricated). */
  receivedBy?: string;
  onRequest: (doc: DealDocument) => void;
  onReceive: (doc: DealDocument) => void;
  onReview: (doc: DealDocument) => void;
  onCreateReviewTask: (doc: DealDocument) => void;
  onDownload?: (doc: DealDocument) => Promise<DownloadDocumentFileOutcome>;
}) {
  const [downloadState, setDownloadState] = useState<
    'idle' |
    'downloading' |
    { readonly error: string } |
    { readonly verifiedSha256: string }
  >('idle');
  const overdue = status === 'outstanding' && isOverdue(doc.dueDate);
  const sev: SeverityKey =
    status === 'reviewed'
      ? 'clear'
      : status === 'received'
        ? 'info'
        : overdue
          ? 'atRisk'
          : 'neutral';
  // Phase 22: Request action shows on outstanding rows only. canWrite
  // is the gate; the Group already restricts it to the Outstanding
  // group so received/reviewed rows can never show the button.
  // Phase 51: Mark-received button shows on the same outstanding rows.
  // Phase 55: Mark-reviewed button shows on received rows.
  // Phase 70: Create-review-task button shows on received rows that
  // carry the pending-review signal — complements the Phase 55
  // Mark-reviewed button when the banker needs to schedule the
  // review rather than perform it inline.
  const showRequest = canWrite && status === 'outstanding';
  const showReceive = canWrite && status === 'outstanding';
  const showReview = canWrite && status === 'received';
  const pendingReview =
    status === 'received' &&
    isReceivedDocumentPendingReview({
      receivedDate: doc.receivedDate,
      reviewer: doc.reviewer,
      nowMs: Date.now(),
    });
  const showCreateReviewTask = canWrite && pendingReview;
  const showDownload = doc.uploaded && onDownload !== undefined;

  async function runDownload() {
    if (!onDownload || downloadState === 'downloading') return;
    setDownloadState('downloading');
    const outcome = await onDownload(doc);
    if (outcome.kind === 'success') {
      setDownloadState({ verifiedSha256: outcome.sha256 });
      return;
    }
    const error =
      'reason' in outcome
        ? outcome.reason
        : 'error' in outcome
          ? outcome.error
          : 'The stored file could not be downloaded.';
    setDownloadState({ error });
  }

  return (
    <li style={styles.row}>
      <StatusDot variant={sev} />
      <div style={styles.rowBody}>
        <div style={styles.title}>{doc.name}</div>
        <div style={styles.meta}>
          {status === 'outstanding' && (
            <>
              <Meta label="Due" value={formatDate(doc.dueDate)} emphasize={overdue} />
              <Meta label="Requested" value={formatDate(doc.requestDate)} />
            </>
          )}
          {status === 'received' && (
            <>
              <Meta label="Received" value={formatDate(doc.receivedDate)} />
              <Meta label="Received by" value={receivedBy ?? 'Unknown'} />
              {doc.uploaded && <Meta label="Source" value="Upload metadata present" />}
              {doc.uploaded && (
                <Meta
                  label="Stored file"
                  value={
                    doc.originalFileName
                      ? `${doc.originalFileName}${doc.fileSizeBytes !== undefined ? ` · ${doc.fileSizeBytes} bytes` : ''}`
                      : 'Metadata incomplete'
                  }
                />
              )}
              {isReceivedDocumentPendingReview({
                receivedDate: doc.receivedDate,
                reviewer: doc.reviewer,
                nowMs: Date.now(),
              }) && (
                <Badge
                  variant="atRisk"
                  appearance="outline"
                  // Phase 57: shortened the visible text to "Pending
                  // review"; the threshold detail moves to the
                  // title/aria-label for screen readers + tooltip.
                  // Phase 74: aria-label parity — some screen readers
                  // ignore title alone.
                  title={`Received ${PENDING_REVIEW_AT_RISK_DAYS}+ days ago and not yet reviewed.`}
                  aria-label={`Pending review — received ${PENDING_REVIEW_AT_RISK_DAYS}+ days ago and not yet reviewed`}
                >
                  Pending review
                </Badge>
              )}
            </>
          )}
          {status === 'reviewed' && (
            <>
              <Meta label="Reviewer" value={doc.reviewer} />
              <Meta label="Received" value={formatDate(doc.receivedDate)} />
            </>
          )}
        </div>
      </div>
      {(showRequest || showReceive || showReview || showCreateReviewTask || showDownload) && (
        <div style={styles.rowActions}>
          {showDownload && (
            <button
              type="button"
              onClick={() => void runDownload()}
              style={styles.requestButton}
              disabled={downloadState === 'downloading'}
              aria-label={`Download stored file for ${doc.name}`}
            >
              {downloadState === 'downloading' ? 'Downloading…' : 'Download file'}
            </button>
          )}
          {typeof downloadState === 'object' && 'verifiedSha256' in downloadState && (
            <span role="status" style={styles.downloadVerified}>
              Byte readback verified · SHA-256 {downloadState.verifiedSha256.slice(0, 12)}…
            </span>
          )}
          {showRequest && (
            <button
              type="button"
              onClick={() => onRequest(doc)}
              style={styles.requestButton}
              aria-label={`Request document ${doc.name}`}
            >
              {doc.requestDate ? 'Re-request' : 'Request'}
            </button>
          )}
          {showReceive && (
            <button
              type="button"
              onClick={() => onReceive(doc)}
              style={styles.receiveButton}
              aria-label={`Mark document ${doc.name} received`}
            >
              Mark received
            </button>
          )}
          {showReview && (
            <button
              type="button"
              onClick={() => onReview(doc)}
              style={styles.reviewButton}
              aria-label={`Mark document ${doc.name} reviewed`}
            >
              Mark reviewed
            </button>
          )}
          {showCreateReviewTask && (
            <button
              type="button"
              onClick={() => onCreateReviewTask(doc)}
              style={styles.reviewTaskButton}
              aria-label={`Create review task for document ${doc.name}`}
            >
              Create review task
            </button>
          )}
          {typeof downloadState === 'object' && 'error' in downloadState && (
            <span role="alert" style={styles.downloadError}>
              {downloadState.error}
            </span>
          )}
        </div>
      )}
    </li>
  );
}

function Meta({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string | undefined;
  emphasize?: boolean;
}) {
  return (
    <span style={styles.metaItem}>
      <span style={styles.metaLabel}>{label}</span>
      <span style={emphasize ? styles.metaValueEmphasis : styles.metaValue}>
        {value ?? '—'}
      </span>
    </span>
  );
}

function ErrorBlock({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={styles.errorBox} role="alert">
      <div style={styles.errorTitle}>{title}</div>
      <div style={styles.errorDetail}>{detail}</div>
      <div style={styles.errorHint}>Refresh to retry.</div>
    </div>
  );
}

function isOverdue(iso: string | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

function formatDate(iso: string | undefined): string | undefined {
  // Document due/request/received dates are date-only calendar fields: parse as local midnight
  // so the shown day never shifts across timezones.
  const d = parseCalendarDate(iso);
  if (!d) return undefined;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const styles: Record<string, React.CSSProperties> = {
  muted: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.sm,
    lineHeight: 1.4,
    padding: `${spacing.md} ${spacing.lg}`,
    background: palette.surfaceAlt,
    border: `1px dashed ${palette.borderStrong}`,
    borderRadius: radius.md,
    textAlign: 'center' as const,
  },
  writeDisabledBanner: {
    margin: 0,
    padding: `${spacing.xs} ${spacing.md}`,
    background: palette.atRiskBg,
    color: palette.atRiskFg,
    fontSize: typography.size.sm,
    border: `1px solid ${palette.atRiskBg}`,
    borderRadius: radius.sm,
    lineHeight: typography.lineHeight.snug,
  },
  docActionRow: { display: 'flex', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', marginBottom: spacing.xs },
  addDocButton: {
    alignSelf: 'flex-start',
    background: 'transparent',
    color: palette.primary,
    border: `1px solid ${palette.primary}`,
    borderRadius: radius.sm,
    padding: `${spacing.xxs} ${spacing.sm}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
    fontFamily: typography.family,
  },
  docActionHint: { fontSize: typography.size.xs, color: palette.atRiskFg },
  lists: { display: 'flex', flexDirection: 'column', gap: spacing.md },
  group: { display: 'flex', flexDirection: 'column', gap: spacing.xs },
  groupHeaderRow: { display: 'flex', alignItems: 'center', gap: spacing.xs },
  groupHeading: {
    margin: 0,
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  row: {
    display: 'flex',
    gap: spacing.sm,
    alignItems: 'flex-start',
    padding: `${spacing.sm} ${spacing.md}`,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
  },
  rowBody: { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 },
  title: { fontSize: typography.size.base, fontWeight: typography.weight.medium, color: palette.text },
  meta: {
    display: 'flex',
    gap: spacing.md,
    flexWrap: 'wrap',
    fontSize: typography.size.sm,
    color: palette.textMuted,
  },
  metaItem: { whiteSpace: 'nowrap', display: 'inline-flex', gap: 4 },
  metaLabel: { color: palette.textSubtle },
  metaValue: { color: palette.text },
  metaValueEmphasis: { color: palette.atRiskFg, fontWeight: typography.weight.semibold },
  rowActions: {
    // Phase 57: switched from column to row + wrap. On wide rows
    // (Request + Mark received on outstanding) the two buttons sit
    // side-by-side; on narrow rows they wrap. Saves vertical space
    // and keeps the row body compact.
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxs,
    flexShrink: 0,
    alignSelf: 'center',
    justifyContent: 'flex-end',
  },
  downloadError: {
    color: palette.atRiskFg,
    fontSize: typography.size.xs,
    maxWidth: 240,
  },
  downloadVerified: {
    color: palette.clearFg,
    fontSize: typography.size.xs,
    maxWidth: 260,
  },
  requestButton: {
    background: palette.primary,
    color: palette.textInverse,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xxs} ${spacing.sm}`,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
    fontFamily: typography.family,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
  },
  receiveButton: {
    background: palette.surface,
    color: palette.primary,
    border: `1px solid ${palette.primary}`,
    borderRadius: radius.sm,
    padding: `${spacing.xxs} ${spacing.sm}`,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
    fontFamily: typography.family,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
  },
  reviewButton: {
    background: palette.surface,
    color: palette.primary,
    border: `1px solid ${palette.primary}`,
    borderRadius: radius.sm,
    padding: `${spacing.xxs} ${spacing.sm}`,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
    fontFamily: typography.family,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
  },
  reviewTaskButton: {
    // Phase 70: secondary outline matching the reviewButton family but
    // visually distinct enough to read as a "schedule a follow-up"
    // sibling action rather than an alternate path to Mark Reviewed.
    background: palette.surfaceAlt,
    color: palette.text,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xxs} ${spacing.sm}`,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
    fontFamily: typography.family,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
  },
  errorBox: {
    background: palette.blockedBg,
    border: `1px solid ${palette.blockedBg}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  errorTitle: {
    color: palette.blockedFg,
    fontWeight: typography.weight.semibold,
    fontSize: typography.size.md,
  },
  errorDetail: { color: palette.text, fontSize: typography.size.sm },
  errorHint: { color: palette.textMuted, fontSize: typography.size.xs, fontStyle: 'italic' },
};
