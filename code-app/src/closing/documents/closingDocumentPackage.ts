import type {
  ClosingDocumentEligibility,
  ClosingDocumentTemplateKey,
  GeneratedClosingDocumentManifest,
} from './closingDocumentTypes';

/** The set of manifest ids that some OTHER manifest's `supersedesManifestId` points at — i.e. the
 *  superseded (non-authoritative) ones. */
function supersededManifestIds(manifests: readonly GeneratedClosingDocumentManifest[]): ReadonlySet<string> {
  return new Set(manifests.map((m) => m.supersedesManifestId).filter((id): id is string => Boolean(id)));
}

/** The most recent, non-superseded manifest per template key (the authoritative one to show). */
export function latestManifestsByTemplate(
  manifests: readonly GeneratedClosingDocumentManifest[],
): ReadonlyMap<ClosingDocumentTemplateKey, GeneratedClosingDocumentManifest> {
  const superseded = supersededManifestIds(manifests);
  const current = manifests.filter((m) => !superseded.has(m.manifestId));
  const byTemplate = new Map<ClosingDocumentTemplateKey, GeneratedClosingDocumentManifest>();
  for (const m of current) {
    const existing = byTemplate.get(m.templateKey);
    if (!existing || m.generatedAtIso > existing.generatedAtIso) byTemplate.set(m.templateKey, m);
  }
  return byTemplate;
}

export interface ClosingDocumentPackageSummary {
  readonly dealId: string;
  readonly documents: readonly GeneratedClosingDocumentManifest[];
  readonly missingTemplates: readonly ClosingDocumentTemplateKey[];
  readonly completeness: 'complete' | 'partial' | 'none';
}

/**
 * Summarize a deal's closing-document package: the current (non-superseded) generated documents,
 * and which ELIGIBLE templates have not yet been generated. Ineligible templates (wrong product,
 * missing facts, not approved) are never counted as "missing" — that would misleadingly suggest
 * the package is incomplete for a reason the banker cannot yet resolve.
 */
export function summarizeClosingDocumentPackage(
  dealId: string,
  eligibility: readonly ClosingDocumentEligibility[],
  manifests: readonly GeneratedClosingDocumentManifest[],
): ClosingDocumentPackageSummary {
  const currentByTemplate = latestManifestsByTemplate(manifests.filter((m) => m.dealId === dealId));
  const eligibleTemplateKeys = eligibility.filter((e) => e.kind === 'eligible').map((e) => e.template.key);
  const documents = eligibleTemplateKeys
    .map((key) => currentByTemplate.get(key))
    .filter((m): m is GeneratedClosingDocumentManifest => Boolean(m));
  const missingTemplates = eligibleTemplateKeys.filter((key) => !currentByTemplate.has(key));

  const completeness: ClosingDocumentPackageSummary['completeness'] =
    eligibleTemplateKeys.length === 0
      ? 'none'
      : missingTemplates.length === 0
        ? 'complete'
        : documents.length === 0
          ? 'none'
          : 'partial';

  return { dealId, documents, missingTemplates, completeness };
}
