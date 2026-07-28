import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { loadBoardedLoans } from '../portfolioBoarding/boardedLoansList';
import type {
  AnnualReviewCycle,
  AnnualReviewLoanSnapshot,
  AnnualReviewPackage,
} from '../shared/annualReview/annualReviewTypes';
import { deriveAnnualReviewCollectionPlan } from '../shared/annualReview/deriveAnnualReviewCollectionPlan';
import { deriveAnnualReviewReadiness } from '../shared/annualReview/deriveAnnualReviewReadiness';
import { deriveBorrowerSoundnessAssessment } from '../shared/annualReview/deriveBorrowerSoundnessAssessment';
import { palette, spacing, typography } from '../shared/theme';
import { createLiveAnnualReviewPersistenceAdapter } from './annualReviewPersistenceAdapter';
import { AnnualPortfolioReviewCommandCenter } from './AnnualPortfolioReviewCommandCenter';

function currentCycle(now = new Date()): AnnualReviewCycle {
  const year = now.getUTCFullYear();
  return {
    cycleId: `annual-review-${year}`,
    reviewYear: year,
    asOfDate: `${year}-12-31`,
    cycleStartDate: `${year}-01-01`,
    cycleEndDate: `${year}-12-31`,
    status: 'in_progress',
  };
}

function loanSnapshot(row: Awaited<ReturnType<typeof loadBoardedLoans>>[number]): AnnualReviewLoanSnapshot {
  const normalizedStatus = row.status?.toLowerCase().replace(/\s+/g, '_');
  const loanStatus =
    normalizedStatus === 'active' ||
    normalizedStatus === 'matured' ||
    normalizedStatus === 'renewed' ||
    normalizedStatus === 'paid_off' ||
    normalizedStatus === 'charged_off' ||
    normalizedStatus === 'closed'
      ? normalizedStatus
      : 'active';
  return {
    boardedLoanId: row.id,
    originatedDealId: row.originatedDealId,
    loanNumber: row.loanNumber,
    borrowerName: row.borrower,
    currentBalance: row.outstanding,
    maturityDate: row.maturityDate,
    loanStatus,
    riskRating: row.riskRating,
    watchlistFlag: row.watchlist,
    pastDueDays: row.pastDueDays,
    nextReviewDate: row.nextReviewDate,
    annualReviewDueDate: row.nextReviewDate,
    portfolioManager: row.portfolioManager,
    source: row.manuallyBoarded ? 'manual_boarding' : 'originated_closed_deal',
    accrualStatus:
      row.accrualStatus === 'accrual' || row.accrualStatus === 'nonaccrual'
        ? row.accrualStatus
        : undefined,
  };
}

function buildPackage(loan: AnnualReviewLoanSnapshot, cycle: AnnualReviewCycle): AnnualReviewPackage {
  const plan = deriveAnnualReviewCollectionPlan({ loans: [loan], cycle });
  const readiness = deriveAnnualReviewReadiness({ loan, cycle });
  return {
    cycleId: cycle.cycleId,
    loan,
    requirements: plan.requirementsByLoan[0]?.requirements ?? [],
    readiness,
    soundness: deriveBorrowerSoundnessAssessment({ loan }),
    status: readiness.annualReviewReady ? 'in_review' : 'blocked',
    escalations: plan.escalations,
    audit: [],
  };
}

async function loadAuthenticatedUpn(): Promise<string> {
  const { getContext } = await import('@microsoft/power-apps/app');
  const context = await getContext();
  const upn = context.user.userPrincipalName?.trim();
  if (!upn) throw new Error('The authenticated user principal name is unavailable.');
  return upn;
}

export function AnnualPortfolioReviewLiveSurface() {
  const cycle = useMemo(() => currentCycle(), []);
  const [actor, setActor] = useState<string>();
  const adapter = useMemo(
    () => actor ? createLiveAnnualReviewPersistenceAdapter({ cycle, actor }) : undefined,
    [actor, cycle],
  );
  const [loans, setLoans] = useState<readonly AnnualReviewLoanSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string>();
  const [completingLoanId, setCompletingLoanId] = useState<string>();

  useEffect(() => {
    let active = true;
    void Promise.all([loadBoardedLoans(), loadAuthenticatedUpn()])
      .then(([rows, upn]) => {
        if (active) {
          setLoans(rows.map(loanSnapshot));
          setActor(upn);
        }
      })
      .catch((error: unknown) => {
        if (active) setMessage(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function completeReview(loanId: string) {
    if (!adapter) return;
    const loan = loans.find((candidate) => candidate.boardedLoanId === loanId);
    if (!loan) return;
    setCompletingLoanId(loanId);
    setMessage(undefined);
    const saved = await adapter.saveAnnualReviewPackage(buildPackage(loan, cycle));
    if (!saved.ok) {
      setMessage(saved.message ?? 'Unable to save the annual-review package.');
      setCompletingLoanId(undefined);
      return;
    }
    const completed = await adapter.completeReview(loanId);
    setMessage(
      completed.ok
        ? `Annual review completed and audited for loan ${loan.loanNumber ?? loanId}.`
        : completed.message ?? 'Annual review completion was blocked.',
    );
    setCompletingLoanId(undefined);
  }

  if (loading) return <p style={statusStyle}>Loading the live boarded-loan review population…</p>;

  return (
    <>
      {message ? <p role="status" style={statusStyle}>{message}</p> : null}
      <AnnualPortfolioReviewCommandCenter
        loans={loans}
        cycle={cycle}
        onCompleteReview={completeReview}
        completingLoanId={completingLoanId}
      />
    </>
  );
}

const statusStyle: CSSProperties = {
  margin: spacing.lg,
  color: palette.textSubtle,
  fontSize: typography.size.sm,
};
