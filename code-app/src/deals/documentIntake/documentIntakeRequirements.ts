import { deriveRequiredDocuments, type DocumentRequirementDerivationInput, type RequiredDocumentDefinition } from '../documentRequirementDerivation';

export type DocumentRequirementGroup = 'CORE_UNDERWRITING' | 'PRODUCT' | 'COLLATERAL' | 'SBA' | 'BANKER_ADDED';

export interface IntakeRequirementDefinition extends RequiredDocumentDefinition {
  readonly requirementVersion: 1;
  readonly displayYear?: number;
  readonly group: DocumentRequirementGroup;
  readonly source: 'CANONICAL_CORE' | 'DERIVED_EXISTING';
  readonly applicability: 'REQUIRED' | 'CONDITIONAL_UNRESOLVED' | 'CONDITIONAL_APPLICABLE';
  readonly blockingLevel: 'BLOCKS_UNDERWRITING';
}

const CORE_FIXED = [
  ['current-income-statement', 'Current Income Statement', 'reviewed'],
  ['current-balance-sheet', 'Current Balance Sheet', 'reviewed'],
  ['business-debt-schedule', 'Business Debt Schedule', 'reviewed'],
  ['personal-financial-statement', 'Personal Financial Statement', 'reviewed'],
  ['business-credit-application', 'Business Credit Application', 'received'],
] as const;

function taxRequirements(packageYear: number | undefined, kind: 'business' | 'personal'): IntakeRequirementDefinition[] {
  const title = kind === 'business' ? 'Business Tax Return' : 'Personal Tax Return';
  return [3, 2, 1].map((minus) => ({
    key: `${kind}-tax-return-year-minus-${minus}`,
    requirementVersion: 1,
    documentName: `${title} — ${packageYear ? packageYear - minus : 'year unresolved'}`,
    displayYear: packageYear ? packageYear - minus : undefined,
    reason: packageYear ? `Canonical commercial underwriting package: ${title.toLowerCase()} for ${packageYear - minus}.` : 'Canonical requirement is blocking because the authoritative document-package year is unresolved.',
    reviewLevel: 'reviewed' as const,
    group: 'CORE_UNDERWRITING' as const,
    source: 'CANONICAL_CORE' as const,
    applicability: kind === 'personal' ? 'CONDITIONAL_UNRESOLVED' as const : 'REQUIRED' as const,
    blockingLevel: 'BLOCKS_UNDERWRITING' as const,
  }));
}

export function deriveDocumentPackageYear(authoritativeDate: string | undefined): number | undefined {
  if (!authoritativeDate) return undefined;
  const year = new Date(authoritativeDate).getUTCFullYear();
  return Number.isInteger(year) && year >= 2000 && year <= 2200 ? year : undefined;
}

export function deriveCoreUnderwritingRequirements(packageYear: number | undefined): readonly IntakeRequirementDefinition[] {
  const fixed = CORE_FIXED.map(([key, documentName, reviewLevel]): IntakeRequirementDefinition => ({
    key, documentName, reviewLevel, requirementVersion: 1,
    reason: 'Canonical commercial underwriting intake requirement.',
    group: 'CORE_UNDERWRITING', source: 'CANONICAL_CORE', applicability: 'REQUIRED', blockingLevel: 'BLOCKS_UNDERWRITING',
  }));
  return [...taxRequirements(packageYear, 'business'), ...taxRequirements(packageYear, 'personal'), ...fixed];
}

function groupFor(definition: RequiredDocumentDefinition): DocumentRequirementGroup {
  if (definition.key.startsWith('sba-')) return 'SBA';
  if (definition.key.includes('appraisal') || definition.key.includes('title') || definition.key.includes('equipment') || definition.key.includes('borrowing-base')) return 'COLLATERAL';
  return 'PRODUCT';
}

const REPLACED_BROAD_KEYS = new Set(['loan-application', 'business-financial-statements', 'business-tax-returns', 'personal-tax-returns', 'personal-financial-statement', 'debt-schedule']);

export function deriveDocumentIntakeRequirements(input: DocumentRequirementDerivationInput & { readonly documentPackageDate?: string }): readonly IntakeRequirementDefinition[] {
  const year = deriveDocumentPackageYear(input.documentPackageDate);
  const core = deriveCoreUnderwritingRequirements(year);
  const additional = deriveRequiredDocuments(input)
    .filter((definition) => !REPLACED_BROAD_KEYS.has(definition.key))
    .map((definition): IntakeRequirementDefinition => ({
      ...definition,
      requirementVersion: 1,
      group: groupFor(definition),
      source: 'DERIVED_EXISTING',
      applicability: 'CONDITIONAL_APPLICABLE',
      blockingLevel: 'BLOCKS_UNDERWRITING',
    }));
  const seen = new Set<string>();
  return [...core, ...additional].filter((definition) => !seen.has(definition.key) && Boolean(seen.add(definition.key)));
}

export function hasCompleteCoreRequirementDerivation(input: { readonly documentPackageDate?: string; readonly guarantorStructure?: string }): boolean {
  return Boolean(deriveDocumentPackageYear(input.documentPackageDate)) && Boolean(input.guarantorStructure?.trim());
}
