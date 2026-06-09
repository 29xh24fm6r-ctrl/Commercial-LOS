/**
 * Phase 142D — Product / process requirement MERGE deriver.
 *
 * PURE, READ-ONLY. Merges template requirements (document / covenant / evidence /
 * approval / package / servicing) without duplicates, preserving source template
 * keys. Live / evidence-derived requirements OUTRANK generic templates. Missing
 * required documents become blockers. It creates no documents/tasks/covenants and
 * writes nothing.
 */

import type {
  ProductProcessTemplate,
  ProductProcessTemplateBlocker,
  ProductProcessTemplateWarning,
} from './productProcessTemplateTypes';

export interface LiveDocumentRequirement {
  documentType: string;
  label?: string;
  required?: boolean;
  received?: boolean;
  accepted?: boolean;
}

export interface MergedDocumentRequirement {
  documentType: string;
  label: string;
  required: boolean;
  source: 'template' | 'live';
  sourceTemplateKeys: readonly string[];
  satisfied?: boolean;
}

export interface MergedRequirementItem {
  key: string;
  label: string;
  required: boolean;
  source: 'template' | 'live';
  sourceTemplateKeys: readonly string[];
}

export interface DeriveProductProcessRequirementsInput {
  templates: readonly ProductProcessTemplate[];
  liveDocumentRequirements?: readonly LiveDocumentRequirement[];
  liveEvidenceKeys?: readonly string[];
}

export interface ProductProcessRequirementsResult {
  mergedDocumentRequirements: readonly MergedDocumentRequirement[];
  mergedCovenantTemplates: readonly MergedRequirementItem[];
  mergedEvidenceRequirements: readonly MergedRequirementItem[];
  mergedApprovalCheckpoints: readonly { checkpointKey: string; label: string; requiredRole: string; finalApproval: false }[];
  mergedPackageRequirements: readonly { packageType: string; label: string }[];
  mergedServicingExpectations: readonly { key: string; label: string }[];
  blockers: readonly ProductProcessTemplateBlocker[];
  warnings: readonly ProductProcessTemplateWarning[];
  auditSummary: { templateKeys: readonly string[]; containsFakeEvidence: false; readOnly: true };
}

export function deriveProductProcessRequirements(
  input: DeriveProductProcessRequirementsInput,
): ProductProcessRequirementsResult {
  const docMap = new Map<string, MergedDocumentRequirement>();
  const covMap = new Map<string, MergedRequirementItem>();
  const evMap = new Map<string, MergedRequirementItem>();
  const cpMap = new Map<string, { checkpointKey: string; label: string; requiredRole: string; finalApproval: false }>();
  const pkgMap = new Map<string, { packageType: string; label: string }>();
  const srvMap = new Map<string, { key: string; label: string }>();

  for (const t of input.templates) {
    for (const d of t.documentRequirements) {
      const existing = docMap.get(d.documentType);
      if (existing) {
        docMap.set(d.documentType, { ...existing, required: existing.required || d.required, sourceTemplateKeys: [...existing.sourceTemplateKeys, t.templateKey] });
      } else {
        docMap.set(d.documentType, { documentType: d.documentType, label: d.label, required: d.required, source: 'template', sourceTemplateKeys: [t.templateKey] });
      }
    }
    for (const c of t.covenantTemplates) {
      const existing = covMap.get(c.covenantType);
      if (existing) covMap.set(c.covenantType, { ...existing, required: existing.required || c.required, sourceTemplateKeys: [...existing.sourceTemplateKeys, t.templateKey] });
      else covMap.set(c.covenantType, { key: c.covenantType, label: c.label, required: c.required, source: 'template', sourceTemplateKeys: [t.templateKey] });
    }
    for (const e of t.evidenceRequirements) {
      const existing = evMap.get(e.evidenceKey);
      if (existing) evMap.set(e.evidenceKey, { ...existing, required: existing.required || e.required, sourceTemplateKeys: [...existing.sourceTemplateKeys, t.templateKey] });
      else evMap.set(e.evidenceKey, { key: e.evidenceKey, label: e.label, required: e.required, source: 'template', sourceTemplateKeys: [t.templateKey] });
    }
    for (const cp of t.approvalCheckpoints) if (!cpMap.has(cp.checkpointKey)) cpMap.set(cp.checkpointKey, cp);
    for (const p of t.packageRequirements) if (!pkgMap.has(p.packageType)) pkgMap.set(p.packageType, p);
    for (const s of t.servicingExpectations) if (!srvMap.has(s.key)) srvMap.set(s.key, s);
  }

  const blockers: ProductProcessTemplateBlocker[] = [];

  // Live / evidence-derived requirements OUTRANK generic template requirements.
  for (const live of input.liveDocumentRequirements ?? []) {
    const existing = docMap.get(live.documentType);
    const required = live.required ?? existing?.required ?? true;
    const merged: MergedDocumentRequirement = {
      documentType: live.documentType,
      label: live.label ?? existing?.label ?? live.documentType,
      required,
      source: 'live',
      sourceTemplateKeys: existing?.sourceTemplateKeys ?? [],
      satisfied: live.accepted === true,
    };
    docMap.set(live.documentType, merged);
    if (required && live.accepted !== true) {
      blockers.push({ code: 'missing_required_document', message: `Required document "${live.documentType}" is not received/accepted.` });
    }
  }

  // Evidence keys derived from live context outrank template evidence.
  for (const k of input.liveEvidenceKeys ?? []) {
    const existing = evMap.get(k);
    evMap.set(k, { key: k, label: existing?.label ?? k, required: existing?.required ?? true, source: 'live', sourceTemplateKeys: existing?.sourceTemplateKeys ?? [] });
  }

  return {
    mergedDocumentRequirements: Array.from(docMap.values()),
    mergedCovenantTemplates: Array.from(covMap.values()),
    mergedEvidenceRequirements: Array.from(evMap.values()),
    mergedApprovalCheckpoints: Array.from(cpMap.values()),
    mergedPackageRequirements: Array.from(pkgMap.values()),
    mergedServicingExpectations: Array.from(srvMap.values()),
    blockers,
    warnings: [],
    auditSummary: { templateKeys: input.templates.map((t) => t.templateKey), containsFakeEvidence: false, readOnly: true },
  };
}
