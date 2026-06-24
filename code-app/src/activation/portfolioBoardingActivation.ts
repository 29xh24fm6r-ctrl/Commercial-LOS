import {
  deriveCapabilitySmokeReadiness,
  type SmokeEvidenceRegistryInput,
} from '../access/operatorSmokeEvidenceRegistry';
import { evaluateLaunchGates, type CapabilityReadiness } from './launchReadiness';
import { deriveCrmSchemaGate, type CrmSchemaFacts } from './crmActivation';

/**
 * Phase 219 Ã¢â‚¬â€ Portfolio Boarding schema verification + persistence gate, and
 * Phase 220 Ã¢â‚¬â€ single-record boarding adapter seam.
 *
 * PURE and fail-closed. Boarding cannot be claimed ready until the portfolio schema
 * is verified. The adapter boards exactly ONE loan over an injected transport, then
 * reports each child data group as written / skipped / failed HONESTLY. No
 * uncontrolled bulk import, governed internal portfolio writes through injected transport + audit.
 */

export const PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED = false;
export const PORTFOLIO_BOARDING_ROUTE_ENABLED = false;

/** Reuse the shared schema-check shape; a portfolio schema gate is the same shape. */
export type PortfolioSchemaFacts = CrmSchemaFacts;

export function derivePortfolioSchemaGate(facts: PortfolioSchemaFacts) {
  return deriveCrmSchemaGate(facts);
}

export interface PortfolioBoardingActivationInput {
  readonly schema: PortfolioSchemaFacts;
  readonly livePersistenceEnabled?: boolean;
  readonly routeEnabled?: boolean;
  readonly actorAuthorized: boolean;
  readonly clientInjected: boolean;
  readonly auditWired: boolean;
  readonly singleRecordSmokeEnabled: boolean;
  readonly evidence: SmokeEvidenceRegistryInput;
}

export function derivePortfolioBoardingActivation(input: PortfolioBoardingActivationInput): { readiness: CapabilityReadiness; schemaVerified: boolean } {
  const schema = derivePortfolioSchemaGate(input.schema);
  const smoke = deriveCapabilitySmokeReadiness(input.evidence).find((r) => r.capability === 'portfolio-boarding')!;
  const readiness = evaluateLaunchGates('portfolio-boarding', [
    { name: 'portfolio schema verified', satisfied: schema.verified, detail: schema.missing.join('; ') || undefined },
    { name: 'PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED', satisfied: (input.livePersistenceEnabled ?? PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED) === true },
    { name: 'PORTFOLIO_BOARDING_ROUTE_ENABLED', satisfied: (input.routeEnabled ?? PORTFOLIO_BOARDING_ROUTE_ENABLED) === true },
    { name: 'actor authorized', satisfied: input.actorAuthorized === true },
    { name: 'Dataverse client injected', satisfied: input.clientInjected === true },
    { name: 'audit sink present', satisfied: input.auditWired === true },
    { name: 'singleRecordSmokeEnabled', satisfied: input.singleRecordSmokeEnabled === true },
    { name: 'boarding smoke passed + rollback verified', satisfied: !smoke.blocksGo, detail: smoke.blockReason ?? undefined },
  ]);
  return { readiness, schemaVerified: schema.verified };
}

// ---------------------------------------------------------------------------
// Phase 220 Ã¢â‚¬â€ single-record portfolio boarding adapter seam
// ---------------------------------------------------------------------------

export const PORTFOLIO_CHILD_GROUPS = ['borrower', 'collateral', 'guarantor', 'covenant', 'tickler', 'insurance'] as const;
export type PortfolioChildGroup = (typeof PORTFOLIO_CHILD_GROUPS)[number];
export type ChildGroupResult = 'written' | 'skipped' | 'failed';

export type PortfolioBoardingOutcome =
  | 'boarded'
  | 'disabled'
  | 'unauthorized'
  | 'schema_not_verified'
  | 'validation_error'
  | 'loan_master_failed'
  | 'audit_failed_partial_success';

export interface PortfolioBoardingTransport {
  createLoanMaster(record: Record<string, unknown>): Promise<{ ok: boolean; id?: string; error?: string }>;
  writeChildGroup(group: PortfolioChildGroup, loanId: string, records: ReadonlyArray<Record<string, unknown>>): Promise<{ ok: boolean; error?: string }>;
}
export interface PortfolioBoardingAuditSink {
  write(a: { correlationId: string; loanId: string | null; outcome: PortfolioBoardingOutcome; childResults: Record<PortfolioChildGroup, ChildGroupResult> }): Promise<{ ok: boolean; error?: string }>;
}

export interface PortfolioBoardingInput {
  readonly enabled?: boolean;
  readonly actorAuthorized: boolean;
  readonly schemaVerified: boolean;
  readonly correlationId: string;
  readonly loanMaster: Record<string, unknown>;
  readonly loanMasterRequiredFields: ReadonlyArray<string>;
  /** Records per child group; an empty/absent group is reported as "skipped". */
  readonly childRecords?: Partial<Record<PortfolioChildGroup, ReadonlyArray<Record<string, unknown>>>>;
  readonly transport?: PortfolioBoardingTransport;
  readonly auditSink?: PortfolioBoardingAuditSink;
}

export interface PortfolioBoardingResult {
  readonly outcome: PortfolioBoardingOutcome;
  readonly loanId: string | null;
  readonly childResults: Record<PortfolioChildGroup, ChildGroupResult>;
  readonly correlationId: string;
  readonly blockedReason: string | null;
}

function emptyChildResults(): Record<PortfolioChildGroup, ChildGroupResult> {
  const r = {} as Record<PortfolioChildGroup, ChildGroupResult>;
  for (const g of PORTFOLIO_CHILD_GROUPS) r[g] = 'skipped';
  return r;
}

export async function boardPortfolioLoan(input: PortfolioBoardingInput): Promise<PortfolioBoardingResult> {
  const base = (outcome: PortfolioBoardingOutcome, blockedReason: string | null, loanId: string | null = null, childResults = emptyChildResults()): PortfolioBoardingResult => ({
    outcome, loanId, childResults, correlationId: input.correlationId, blockedReason,
  });

  if ((input.enabled ?? PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED) !== true) return base('disabled', 'Portfolio boarding live persistence is disabled.');
  if (input.actorAuthorized !== true) return base('unauthorized', 'Actor is not authorized to board portfolio loans.');
  if (input.schemaVerified !== true || !input.transport || !input.auditSink) return base('schema_not_verified', 'Portfolio schema not verified or transport/audit unavailable.');
  if (!input.correlationId) return base('validation_error', 'Missing correlationId.');
  const missing = input.loanMasterRequiredFields.filter((f) => input.loanMaster[f] === undefined || input.loanMaster[f] === null || input.loanMaster[f] === '');
  if (missing.length > 0) return base('validation_error', `Missing loan master field(s): ${missing.join(', ')}.`);

  const lm = await input.transport.createLoanMaster(input.loanMaster);
  if (!lm.ok || !lm.id) return base('loan_master_failed', lm.error ?? 'loan master create failed');
  const loanId = lm.id;

  // Write each child group honestly: skipped (no records), written (ok), failed (error).
  const childResults = emptyChildResults();
  for (const group of PORTFOLIO_CHILD_GROUPS) {
    const records = input.childRecords?.[group] ?? [];
    if (records.length === 0) {
      childResults[group] = 'skipped';
      continue;
    }
    const res = await input.transport.writeChildGroup(group, loanId, records);
    childResults[group] = res.ok ? 'written' : 'failed';
  }

  const audit = await input.auditSink.write({ correlationId: input.correlationId, loanId, outcome: 'boarded', childResults });
  if (!audit.ok) return base('audit_failed_partial_success', 'Loan boarded but audit failed.', loanId, childResults);

  return base('boarded', null, loanId, childResults);
}
