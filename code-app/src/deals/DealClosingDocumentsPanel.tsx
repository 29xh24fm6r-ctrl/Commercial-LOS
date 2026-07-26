import { useMemo, useRef, useState } from 'react';
import { ClosingDocumentsPanel } from '../closing/documents/ClosingDocumentsPanel';
import { createInMemoryClosingDocumentStore } from '../closing/documents/closingDocumentStorage';
import { generateClosingDocument } from '../closing/documents/closingDocumentGeneration';
import type { ClosingDocumentFactModel, ClosingDocumentTemplate, GeneratedClosingDocumentManifest } from '../closing/documents/closingDocumentTypes';
import type { DealDetail } from './dealQueries';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * PR 107 -- mounts the closing-document generation framework
 * (src/closing/documents/*, 49 tests, previously entirely unmounted --
 * FACTORY_ARC_BASELINE.md confirmed no live Dataverse table exists to
 * persist generated documents). This wrapper uses
 * createInMemoryClosingDocumentStore(), the module's own documented
 * "real, working reference implementation... NOT persistence; lost on
 * page reload" -- callers must not present it as saved, so the panel
 * below says so plainly. A no-op audit emitter is used for the same
 * reason: auditing a non-durable record would be a false signal.
 *
 * Real persistence needs an operator-authorized cr664_closingdocument-style
 * table (bigger schema ask than an additive JSON column, since manifests
 * are immutable per-document records, not a single deal-level blob) --
 * tracked as a NOT_WIRED entry, not built here.
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
  const storeRef = useRef(createInMemoryClosingDocumentStore());
  const [manifests, setManifests] = useState<readonly GeneratedClosingDocumentManifest[]>([]);
  const facts = useMemo(() => buildClosingDocumentFactModel(deal), [deal]);

  async function onGenerate(template: ClosingDocumentTemplate) {
    const outcome = await generateClosingDocument(
      { template, facts, authorized, actorEmail: actorEmail ?? '' },
      {
        storage: storeRef.current,
        emitAudit: async () => ({ success: false, error: 'Local-only session: no live audit sink is wired yet (see docs/factory-arc/PR107_CLOSING_FUNDING_ACTIVATION.md).' }),
      },
    );
    if (outcome.kind === 'generated') {
      setManifests(storeRef.current.all());
    }
    return outcome;
  }

  return (
    <>
      <p style={styles.localOnlyNote} role="note" data-closing-documents-local-only-note>
        Generated documents are held for this browser session only — not yet saved to the deal.
        Real persistence needs an operator-authorized schema addition (see
        docs/factory-arc/PR107_CLOSING_FUNDING_ACTIVATION.md).
      </p>
      <ClosingDocumentsPanel dealId={deal.id} facts={facts} manifests={manifests} authorized={authorized} onGenerate={onGenerate} />
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
};
