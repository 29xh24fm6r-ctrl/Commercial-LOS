/**
 * final-seven-workstreams Workstream 6 — Closing Document Generation Framework.
 *
 * Shared types for a governed, template-driven closing-document generation capability. This
 * capability is CONFIRMED GENUINELY MISSING from the app (only readiness/gate tracking exists —
 * `src/workflow/closingReadiness.ts`); this framework is a new build, not a rewiring of something
 * that already exists.
 *
 * Scope boundary (see closingDocumentTemplateRegistry.ts): this framework is deliberately built
 * around a SAFE PILOT set of administrative/internal documents (closing checklist, borrower
 * instruction letter, internal funding checklist, conditions-precedent certification, package cover
 * sheet) — it does NOT generate promissory notes, mortgages, deeds of trust, guaranties, security
 * agreements, or any other enforceable legal instrument. Those require approved legal templates and
 * counsel signoff this framework cannot provide on its own.
 */

/** The pilot template set — see closingDocumentTemplateRegistry.ts for the full definitions. */
export type ClosingDocumentTemplateKey =
  | 'closing_checklist'
  | 'borrower_closing_instruction_letter'
  | 'internal_funding_checklist'
  | 'conditions_precedent_certification'
  | 'closing_package_cover_sheet';

/** The deal/loan facts a template may require before it can generate. */
export type ClosingDocumentFactKey =
  | 'dealId'
  | 'dealName'
  | 'borrowerLegalName'
  | 'product'
  | 'loanAmount'
  | 'closingDate'
  | 'jurisdiction'
  | 'collateralDescription'
  | 'conditionsPrecedentResolved'
  | 'fundingInstructions';

/**
 * The facts known about a deal, as far as this framework is concerned. Every field is optional —
 * an absent fact is an HONEST unknown, never fabricated or defaulted. `jurisdiction` in particular
 * is not tracked anywhere else in this app today (confirmed: no state/jurisdiction field exists on
 * the deal schema), so it will be absent for every real deal until that changes — templates that
 * require it will honestly show as `missing_facts`, not silently skip the check.
 */
export interface ClosingDocumentFactModel {
  readonly dealId?: string;
  readonly dealName?: string;
  readonly borrowerLegalName?: string;
  readonly product?: string;
  readonly loanAmount?: number;
  readonly closingDate?: string;
  readonly jurisdiction?: string;
  readonly collateralDescription?: string;
  readonly conditionsPrecedentResolved?: boolean;
  readonly fundingInstructions?: string;
}

export interface ClosingDocumentTemplate {
  readonly key: ClosingDocumentTemplateKey;
  readonly title: string;
  /** Semantic-ish version string; bump on any content/requirement change. */
  readonly version: string;
  /**
   * True for every template in this pilot set — "approved" here means "included in this
   * framework's reviewed pilot set," NOT "reviewed and signed off by legal counsel for this
   * specific organization." An operator must still confirm real legal/compliance review before
   * relying on generated output in a live closing — see docs/final-seven-workstreams/
   * 06_CLOSING_DOCUMENT_FRAMEWORK.md.
   */
  readonly approved: boolean;
  readonly requiredFacts: readonly ClosingDocumentFactKey[];
  /** Undefined = applicable to every product. */
  readonly applicableProducts?: readonly string[];
  /** Undefined = applicable to every jurisdiction. */
  readonly applicableJurisdictions?: readonly string[];
  readonly requiresCollateralDescription?: boolean;
}

export type ClosingDocumentEligibility =
  | { readonly kind: 'eligible'; readonly template: ClosingDocumentTemplate }
  | { readonly kind: 'missing_facts'; readonly template: ClosingDocumentTemplate; readonly missingFacts: readonly ClosingDocumentFactKey[] }
  | { readonly kind: 'wrong_product'; readonly template: ClosingDocumentTemplate; readonly product: string | undefined }
  | { readonly kind: 'wrong_jurisdiction'; readonly template: ClosingDocumentTemplate; readonly jurisdiction: string | undefined }
  | { readonly kind: 'not_approved'; readonly template: ClosingDocumentTemplate };

/** An immutable record of one generated document. Regeneration creates a NEW manifest with
 *  `supersedesManifestId` set — the prior manifest is never mutated or deleted. */
export interface GeneratedClosingDocumentManifest {
  readonly manifestId: string;
  readonly templateKey: ClosingDocumentTemplateKey;
  readonly templateVersion: string;
  readonly dealId: string;
  readonly generatedAtIso: string;
  readonly generatedByActorEmail: string;
  readonly contentHash: string;
  readonly correlationId: string;
  readonly status: 'draft' | 'final';
  readonly supersedesManifestId?: string;
}

export type ClosingDocumentGenerationOutcome =
  | { readonly kind: 'preview'; readonly renderedContent: string; readonly template: ClosingDocumentTemplate }
  | { readonly kind: 'blocked_not_eligible'; readonly eligibility: ClosingDocumentEligibility }
  | { readonly kind: 'blocked_unauthorized'; readonly reason: string }
  | {
      readonly kind: 'generated';
      readonly manifest: GeneratedClosingDocumentManifest;
      readonly renderedContent: string;
      readonly auditRecorded: boolean;
      readonly auditError?: string;
    }
  | { readonly kind: 'write_failed'; readonly error: string; readonly correlationId: string };
