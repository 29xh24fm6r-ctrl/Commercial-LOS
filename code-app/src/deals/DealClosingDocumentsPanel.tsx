import { useEffect, useMemo, useRef, useState } from 'react';
import { ClosingDocumentsPanel } from '../closing/documents/ClosingDocumentsPanel';
import { createDataverseClosingDocumentStore } from '../closing/documents/closingDocumentStorage';
import { generateClosingDocument } from '../closing/documents/closingDocumentGeneration';
import { liveEmitClosingDocumentTimeline } from '../closing/documents/closingDocumentTimeline';
import { liveEmitClosingDocumentAudit } from '../closing/documents/closingDocumentAuditLiveDeps';
import type { ClosingDocumentFactModel, ClosingDocumentTemplate, GeneratedClosingDocumentManifest } from '../closing/documents/closingDocumentTypes';
import type { DealDetail } from './dealQueries';
import { palette, radius, spacing, typography } from '../shared/theme';
import { mapBusinessSafeError } from '../shared/errors/businessSafeErrorMapping';

/**
 * PR 107 -- mounts the closing-document generation framework
 * (src/closing/documents/*, 49 tests).
 *
 * PR A update: now uses createDataverseClosingDocumentStore() (see closingDocumentStorage.ts),
 * the same "wire the real store even though the backing table isn't live yet, fail closed
 * honestly" pattern DealFundingAuthorizationPanel.tsx already established for funding
 * authorization. The backing table (cr664_closingdocumentmanifest) has NOT been applied to any
 * live Dataverse environment yet (see scripts/schema-migrations/pr123-closing-document-persistence/)
 * The live schema is provisioned in the target environment. Manifest persistence,
 * governed audit evidence, and deal timeline evidence are independent sinks: a
 * secondary evidence failure is surfaced without rolling back a saved document.
 */
function buildClosingDocumentFactModel(deal: DealDetail): ClosingDocumentFactModel {
  return {
    dealId: deal.id,
    dealName: deal.name,
    borrowerLegalName: deal.effectiveClientName ?? deal.clientName,
    product: deal.productType,
    loanAmount: deal.amount,
    closingDate: deal.targetCloseDate,
    collateralDescription: deal.collateralSummary,
    // N-25 remediation (Production Remediation Factory Arc Phase 8) -- already persistable via
    // Deal Profile editing (Factory Arc Phase 3); display-only here, no template requires them.
    loanPurpose: deal.loanPurpose,
    loanTermMonths: deal.loanTermMonths,
    ownershipStructure: deal.ownershipStructure,
    // jurisdiction / conditionsPrecedentResolved / fundingInstructions have no source on
    // DealDetail today -- left undefined rather than guessed; templates that require them
    // correctly show as ineligible until a real source exists.
  };
}

export function DealClosingDocumentsPanel({ deal, authorized, actorEmail }: { deal: DealDetail; authorized: boolean; actorEmail: string | undefined }) {
  const storeRef = useRef(createDataverseClosingDocumentStore());
  const [manifests, setManifests] = useState<readonly GeneratedClosingDocumentManifest[]>([]);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const facts = useMemo(() => buildClosingDocumentFactModel(deal), [deal]);

  useEffect(() => {
    let cancelled = false;
    storeRef.current.listManifestsForDeal(deal.id).then((res) => {
      if (cancelled) return;
      if (res.success) {
        setManifests(res.manifests ?? []);
        setLoadError(undefined);
      } else {
        // Fail-closed, honest: the schema migration is likely still pending (see this file's
        // header) -- never presented as "no documents exist yet" when the read itself failed.
        // res.error is a raw transport-failure string; never rendered verbatim.
        setLoadError(
          res.error ? mapBusinessSafeError(res.error).safeMessage : 'Could not load previously generated closing documents.',
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [deal.id]);

  async function onGenerate(template: ClosingDocumentTemplate) {
    const outcome = await generateClosingDocument(
      { template, facts, authorized, actorEmail: actorEmail ?? '' },
      {
        storage: storeRef.current,
        emitAudit: liveEmitClosingDocumentAudit,
        // Final LOS Completion arc — Workstream K: real, live timeline emission (distinct from the
        // still-stubbed audit above — see this file's header and closingDocumentTimeline.ts).
        emitTimeline: liveEmitClosingDocumentTimeline,
      },
    );
    if (outcome.kind === 'generated') {
      const refreshed = await storeRef.current.listManifestsForDeal(deal.id);
      if (refreshed.success) setManifests(refreshed.manifests ?? []);
    }
    return outcome;
  }

  return (
    <>
      {loadError && (
        <p style={styles.errorNote} role="alert" data-closing-documents-load-error>
          Could not load previously generated closing documents: {loadError}
        </p>
      )}
      <p style={styles.localOnlyNote} role="note" data-closing-documents-local-only-note>
        Generated documents are saved to Dataverse with governed audit and deal-timeline evidence.
        If a secondary evidence write fails, the saved document is preserved and the incomplete
        evidence is shown for administrator review.
      </p>
      <ClosingDocumentsPanel
        dealId={deal.id}
        facts={facts}
        manifests={manifests}
        authorized={authorized}
        onGenerate={onGenerate}
        onGetContent={(manifestId) => storeRef.current.getManifestContent(manifestId)}
      />
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  localOnlyNote: {
    margin: 0,
    fontSize: typography.size.xs,
    color: palette.textMuted,
    background: palette.surfaceAlt,
    border: `1px dashed ${palette.borderStrong}`,
    padding: `${spacing.xs} ${spacing.md}`,
    borderRadius: radius.sm,
    lineHeight: typography.lineHeight.snug,
  },
  errorNote: {
    margin: 0,
    fontSize: typography.size.xs,
    color: palette.blockedFg,
    background: palette.blockedBg,
    border: `1px solid ${palette.blocked}`,
    padding: `${spacing.xs} ${spacing.md}`,
    borderRadius: radius.sm,
    lineHeight: typography.lineHeight.snug,
  },
};
