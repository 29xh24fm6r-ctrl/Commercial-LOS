import { useState, type CSSProperties } from 'react';
import { useOptionalBanker } from '../banker/BankerContext';
import {
  createEmptyPortfolioLoanBoardingPackage,
  type PortfolioLoanBoardingPackage,
} from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';
import { derivePortfolioLoanBoardingFormState } from './derivePortfolioLoanBoardingFormState';
import { usePortfolioLoanBoardingPersistence } from './usePortfolioLoanBoardingPersistence';
import { buildLivePortfolioBoardingRuntimeAdapter } from './buildLivePortfolioBoardingRuntimeDeps';
import { derivePortfolioBoardingAvailability } from './resolvePortfolioLoanBoardingPersistenceAdapter';
import { describeUnavailability } from '../shared/governance/operationalCapabilityState';
import { toOperationalCapabilityState } from '../shared/governance/capabilityAvailability';
import { BOARDING_FORM_SECTIONS } from './portfolioLoanBoardingFormModel';
import { BoardingScalarSectionEditor, BoardingRepeatableSectionEditor } from './PortfolioLoanBoardingFormControls';
import {
  IDENTITY_FIELDS,
  BORROWER_FIELDS,
  TERMS_FIELDS,
  CLOSING_FIELDS,
  CREDIT_APPROVAL_FIELDS,
  SERVICING_FIELDS,
  COLLATERAL_ITEM_FIELDS,
  GUARANTOR_FIELDS,
  COVENANT_FIELDS,
  TICKLER_FIELDS,
  INSURANCE_FIELDS,
  DOCUMENT_FIELDS,
  RISK_RATING_FIELDS,
  EXCEPTION_FIELDS,
  REVIEW_FIELDS,
  EXAMINER_NOTE_FIELDS,
} from './portfolioLoanBoardingFieldSpecs';
import { newCorrelationId } from '../shared/governance/correlationId';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * The full self-service boarding form. Every write goes through
 * `usePortfolioLoanBoardingPersistence`, which is fed a runtime-resolved
 * adapter: disabled by default (PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED
 * / _ROUTE_ENABLED are the safe-off defaults), so submitting previews and
 * validates only — the same governed pattern as StageWorkflowControl and
 * CrmWriteActions. Two other write paths already board loans for real with
 * no flag gate: the manual "Board existing loan" action
 * (existingLoanEntryAdapter.ts) and auto-boarding on stage advance to
 * Boarded (buildLiveStageAdvanceDeps.ts) — Factory Arc Phase 9.
 */
export function PortfolioLoanBoardingForm({
  initialPackage,
}: {
  /** Seed package — an empty shell for manual boarding, or an auto-boarded draft. */
  initialPackage?: PortfolioLoanBoardingPackage;
}) {
  const banker = useOptionalBanker();
  const isAuthorizedOperator = Boolean(banker?.systemUserId);
  const [pkg, setPkg] = useState<PortfolioLoanBoardingPackage>(
    () => initialPackage ?? createEmptyPortfolioLoanBoardingPackage(),
  );
  const resolution = buildLivePortfolioBoardingRuntimeAdapter({ isAuthorizedOperator });
  const persistence = usePortfolioLoanBoardingPersistence(resolution.adapter);
  const formState = derivePortfolioLoanBoardingFormState(pkg);
  // Factory Arc Phase 6 — one normalized CapabilityAvailability composed from
  // the same facts the resolver above already evaluated (resolution.gate).
  // Also fixes a real bug: the submit button's `disabled` previously checked
  // only `persistence.state.kind === 'pending'`, never `persistence.enabled`
  // — a banker could click "Board this loan" while disabled and only learn it
  // failed after a spinner. It now stays disabled up front, honestly. Not
  // memoized: new Date() inside a useMemo body defeats React Compiler's
  // memoization-preservation check, and this derivation is cheap regardless.
  const boardingAvailability = derivePortfolioBoardingAvailability(
    isAuthorizedOperator,
    resolution.gate,
    new Date().toISOString(),
  );

  function updateScalarSection<K extends keyof PortfolioLoanBoardingPackage>(section: K) {
    return (key: string, value: unknown) => {
      setPkg((prev) => ({
        ...prev,
        [section]: { ...(prev[section] as Record<string, unknown>), [key]: value },
      }));
    };
  }

  async function handleSubmit() {
    if (!pkg.source) setPkg((prev) => ({ ...prev, source: 'manual_boarding' }));
    await persistence.create(pkg.source ? pkg : { ...pkg, source: 'manual_boarding' });
  }

  return (
    <div style={styles.wrap} data-portfolio-boarding-form>
      <Card>
        <CardHeader
          title="Board a portfolio loan"
          subtitle="Manually enter a closed / existing loan into the LOS system of record."
          trailing={
            <Badge variant={formState.boardReady ? 'clear' : 'neutral'}>
              {formState.boardReady ? 'Board ready' : `${formState.blockers.length} outstanding`}
            </Badge>
          }
        />
        {!persistence.enabled && (
          <p style={styles.disabledNote} role="status">
            This form previews and validates a full boarding package, but saving here isn&rsquo;t
            available yet. To board a closed loan today, use &ldquo;Board existing loan&rdquo; in
            the Portfolio workspace, or advance the deal to the Boarded stage to board it
            automatically.
          </p>
        )}
        {persistence.state.kind === 'success' && (
          <p style={styles.successNote} role="status">Boarded successfully (record {persistence.state.result.operation}).</p>
        )}
        {persistence.state.kind === 'failure' && (
          <p style={styles.failureNote} role="status">{persistence.state.message ?? 'Boarding failed.'}</p>
        )}
        <CardFooter>
          {/* Factory Arc Phase 6 bug fix: previously only checked
              persistence.state.kind === 'pending', never persistence.enabled /
              boardingAvailability.available — a banker could click this while
              disabled and only learn it failed after a spinner. */}
          <button
            type="button"
            style={styles.submitButton}
            onClick={handleSubmit}
            disabled={persistence.state.kind === 'pending' || !persistence.enabled || !boardingAvailability.available}
            title={boardingAvailability.available ? undefined : describeUnavailability(toOperationalCapabilityState(boardingAvailability))}
          >
            {persistence.state.kind === 'pending' ? 'Boarding…' : 'Board this loan'}
          </button>
        </CardFooter>
      </Card>

      {formState.blockers.length > 0 && (
        <Card>
          <CardHeader title="Outstanding blockers" subtitle="Must be resolved before this loan is board-ready." />
          <ul style={styles.blockerList}>
            {formState.blockers.map((b) => <li key={b}>{b}</li>)}
          </ul>
        </Card>
      )}

      {sectionCard('loanIdentity', <BoardingScalarSectionEditor fields={IDENTITY_FIELDS} values={pkg.identity} onFieldChange={updateScalarSection('identity')} />)}
      {sectionCard('borrowerProfile', <BoardingScalarSectionEditor fields={BORROWER_FIELDS} values={pkg.borrower} onFieldChange={updateScalarSection('borrower')} />)}
      {sectionCard('loanTerms', <BoardingScalarSectionEditor fields={TERMS_FIELDS} values={pkg.terms} onFieldChange={updateScalarSection('terms')} />)}
      {sectionCard('closingInformation', <BoardingScalarSectionEditor fields={CLOSING_FIELDS} values={pkg.closing} onFieldChange={updateScalarSection('closing')} />)}
      {sectionCard('creditApproval', <BoardingScalarSectionEditor fields={CREDIT_APPROVAL_FIELDS} values={pkg.creditApproval} onFieldChange={updateScalarSection('creditApproval')} />)}
      {sectionCard('servicing', <BoardingScalarSectionEditor fields={SERVICING_FIELDS} values={pkg.servicing} onFieldChange={updateScalarSection('servicing')} />)}

      {sectionCard('collateral', (
        <BoardingRepeatableSectionEditor
          fields={COLLATERAL_ITEM_FIELDS}
          items={pkg.collateral.items}
          itemLabel="Collateral item"
          emptyItem={() => ({})}
          onItemsChange={(items) => setPkg((prev) => ({ ...prev, collateral: { items } }))}
        />
      ))}
      {sectionCard('guarantors', (
        <BoardingRepeatableSectionEditor
          fields={GUARANTOR_FIELDS}
          items={pkg.guarantors.guarantors}
          itemLabel="Guarantor"
          emptyItem={() => ({})}
          onItemsChange={(guarantors) => setPkg((prev) => ({ ...prev, guarantors: { guarantors } }))}
        />
      ))}
      {sectionCard('covenants', (
        <BoardingRepeatableSectionEditor
          fields={COVENANT_FIELDS}
          items={pkg.covenants.covenants}
          itemLabel="Covenant"
          emptyItem={() => ({})}
          onItemsChange={(covenants) => setPkg((prev) => ({ ...prev, covenants: { covenants } }))}
        />
      ))}
      {sectionCard('ticklers', (
        <BoardingRepeatableSectionEditor
          fields={TICKLER_FIELDS}
          items={pkg.ticklers.ticklers}
          itemLabel="Tickler"
          emptyItem={() => ({})}
          onItemsChange={(ticklers) => setPkg((prev) => ({ ...prev, ticklers: { ticklers } }))}
        />
      ))}
      {sectionCard('insurance', (
        <BoardingRepeatableSectionEditor
          fields={INSURANCE_FIELDS}
          items={pkg.insurance.policies}
          itemLabel="Insurance policy"
          emptyItem={() => ({})}
          onItemsChange={(policies) => setPkg((prev) => ({ ...prev, insurance: { policies } }))}
        />
      ))}
      {sectionCard('documents', (
        <BoardingRepeatableSectionEditor
          fields={DOCUMENT_FIELDS}
          items={pkg.documents.documents}
          itemLabel="Document"
          emptyItem={() => ({})}
          onItemsChange={(documents) => setPkg((prev) => ({ ...prev, documents: { documents } }))}
        />
      ))}
      {sectionCard('riskRating', (
        <BoardingRepeatableSectionEditor
          fields={RISK_RATING_FIELDS}
          items={pkg.riskRatings}
          itemLabel="Risk rating"
          emptyItem={() => ({})}
          onItemsChange={(riskRatings) => setPkg((prev) => ({ ...prev, riskRatings }))}
        />
      ))}
      {sectionCard('exceptions', (
        <BoardingRepeatableSectionEditor
          fields={EXCEPTION_FIELDS}
          items={pkg.exceptions}
          itemLabel="Exception"
          emptyItem={() => ({})}
          onItemsChange={(exceptions) => setPkg((prev) => ({ ...prev, exceptions }))}
        />
      ))}
      {sectionCard('reviews', (
        <BoardingRepeatableSectionEditor
          fields={REVIEW_FIELDS}
          items={pkg.reviewHistory}
          itemLabel="Review"
          emptyItem={() => ({})}
          onItemsChange={(reviewHistory) => setPkg((prev) => ({ ...prev, reviewHistory }))}
        />
      ))}
      {sectionCard('examinerNotes', (
        <BoardingRepeatableSectionEditor
          fields={EXAMINER_NOTE_FIELDS}
          items={pkg.examinerNotes}
          itemLabel="Examiner note"
          emptyItem={() => ({ noteId: newCorrelationId('note'), relatedEvidenceIds: [] })}
          onItemsChange={(examinerNotes) => setPkg((prev) => ({ ...prev, examinerNotes: examinerNotes as never }))}
        />
      ))}
    </div>
  );
}

function sectionCard(key: (typeof BOARDING_FORM_SECTIONS)[number]['key'], body: React.ReactNode) {
  const def = BOARDING_FORM_SECTIONS.find((s) => s.key === key)!;
  return (
    <Card key={key}>
      <CardHeader title={def.label} subtitle={def.description} />
      {body}
    </Card>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: spacing.lg },
  disabledNote: {
    background: palette.surfaceAlt,
    border: `1px solid ${palette.borderStrong}`,
    borderRadius: radius.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    color: palette.textMuted,
    fontSize: typography.size.sm,
  },
  successNote: { color: palette.clearFg, fontSize: typography.size.sm },
  failureNote: { color: palette.text, fontSize: typography.size.sm },
  blockerList: { margin: 0, paddingLeft: spacing.lg, color: palette.text, fontSize: typography.size.sm },
  submitButton: {
    border: `1px solid ${palette.borderStrong}`,
    borderRadius: radius.sm,
    background: palette.primary,
    color: palette.primaryFg,
    padding: `${spacing.xs} ${spacing.md}`,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
  },
};
