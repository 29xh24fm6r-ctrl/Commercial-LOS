/**
 * Phase 142E — Servicing OBLIGATION deriver.
 *
 * PURE, READ-ONLY. Derives servicing obligations from product/process template
 * guidance + live covenant / annual-review / insurance / tickler / document
 * context. Template expectations are guidance unless backed by live/evidence
 * context; missing evidence stays missing. It creates no tasks and sends no
 * borrower requests.
 */

import type { ProductProcessTemplate } from '../platform/productProcessTemplateTypes';
import type {
  ServicingLifecycleObligation,
  ServicingObligationCategory,
  ServicingObligationStatus,
} from './servicingLifecycleTypes';

export interface ServicingLiveDocumentContext {
  documentType: string;
  label?: string;
  required?: boolean;
  accepted?: boolean;
  dueDate?: string;
}

export interface DeriveServicingObligationsInput {
  templates?: readonly ProductProcessTemplate[];
  annualReviewDueStatus?: 'not_due' | 'due' | 'past_due' | 'unknown';
  covenantResults?: readonly { covenantId: string; label?: string; status: string }[];
  insuranceStatus?: 'current' | 'expired' | 'missing' | 'unknown';
  insuranceExpirationDate?: string;
  ticklerOverdue?: boolean;
  liveDocuments?: readonly ServicingLiveDocumentContext[];
  asOfDate?: string | Date;
}

function nowMs(asOf?: string | Date): number {
  if (asOf instanceof Date) return asOf.getTime();
  if (typeof asOf === 'string') { const ms = Date.parse(asOf); if (!Number.isNaN(ms)) return ms; }
  return Date.now();
}

function docCategory(documentType: string): ServicingObligationCategory {
  if (documentType === 'tax_returns') return 'tax_return_delivery';
  if (documentType === 'borrowing_base_certificate') return 'borrowing_base_reporting';
  if (documentType === 'insurance_evidence') return 'insurance_renewal';
  return 'financial_reporting';
}

function obligation(
  obligationId: string, category: ServicingObligationCategory, label: string,
  source: ServicingLifecycleObligation['source'], status: ServicingObligationStatus,
  extra: Partial<ServicingLifecycleObligation> = {},
): ServicingLifecycleObligation {
  return {
    obligationId, category, label, source, status,
    evidenceRequired: extra.evidenceRequired ?? true,
    evidencePresent: extra.evidencePresent ?? false,
    sourceDocumentIds: extra.sourceDocumentIds ?? [],
    sourceTemplateKeys: extra.sourceTemplateKeys ?? [],
    dueDate: extra.dueDate,
    frequency: extra.frequency,
    blockers: extra.blockers ?? [],
    warnings: extra.warnings ?? [],
  };
}

export function deriveServicingObligations(
  input: DeriveServicingObligationsInput,
): readonly ServicingLifecycleObligation[] {
  const out: ServicingLifecycleObligation[] = [];
  const now = nowMs(input.asOfDate);

  // Annual review obligation.
  if (input.annualReviewDueStatus) {
    const status: ServicingObligationStatus =
      input.annualReviewDueStatus === 'past_due' ? 'overdue'
        : input.annualReviewDueStatus === 'due' ? 'due_soon'
          : input.annualReviewDueStatus === 'not_due' ? 'satisfied' : 'unknown_missing_data';
    out.push(obligation('obl-annual-review', 'annual_review', 'Annual review', 'annual_review', status));
  }

  // Covenant obligations from real covenant results.
  for (const c of input.covenantResults ?? []) {
    const status: ServicingObligationStatus =
      c.status === 'pass' ? 'satisfied'
        : c.status === 'fail' || c.status === 'review_required' ? 'review_required'
          : 'unknown_missing_data';
    out.push(obligation(`obl-cov-${c.covenantId}`, 'covenant_compliance', c.label ?? c.covenantId, 'covenant_definition', status));
  }

  // Insurance renewal obligation.
  if (input.insuranceStatus) {
    const status: ServicingObligationStatus =
      input.insuranceStatus === 'current' ? 'satisfied'
        : input.insuranceStatus === 'expired' ? 'overdue'
          : input.insuranceStatus === 'missing' ? 'missing_evidence' : 'unknown_missing_data';
    out.push(obligation('obl-insurance', 'insurance_renewal', 'Insurance renewal', 'live_evidence', status, { dueDate: input.insuranceExpirationDate, evidencePresent: input.insuranceStatus === 'current' }));
  }

  // Tickler follow-up.
  if (input.ticklerOverdue) {
    out.push(obligation('obl-tickler', 'tickler_follow_up', 'Tickler follow-up', 'live_evidence', 'overdue'));
  }

  // Live document obligations (outrank template guidance).
  const liveTypes = new Set<string>();
  for (const d of input.liveDocuments ?? []) {
    liveTypes.add(d.documentType);
    const overdue = d.accepted !== true && d.dueDate !== undefined && Date.parse(d.dueDate) < now;
    const status: ServicingObligationStatus =
      d.accepted === true ? 'satisfied'
        : overdue ? 'overdue'
          : d.required ? 'missing_evidence' : 'not_applicable';
    out.push(obligation(`obl-doc-${d.documentType}`, docCategory(d.documentType), d.label ?? d.documentType, 'live_evidence', status, { dueDate: d.dueDate, evidencePresent: d.accepted === true }));
  }

  // Template-only document obligations (guidance, not yet backed by live evidence).
  for (const t of input.templates ?? []) {
    for (const dr of t.documentRequirements) {
      if (liveTypes.has(dr.documentType)) continue;
      if (out.some((o) => o.obligationId === `obl-tpl-${dr.documentType}`)) continue;
      out.push(obligation(`obl-tpl-${dr.documentType}`, docCategory(dr.documentType), `${dr.label} (template guidance)`, 'template_guidance', 'review_required', { evidenceRequired: dr.required, evidencePresent: false, sourceTemplateKeys: [t.templateKey] }));
    }
  }

  return out;
}
