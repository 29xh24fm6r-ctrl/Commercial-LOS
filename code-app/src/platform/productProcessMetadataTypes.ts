/**
 * Phase 142A — Configurable product / process metadata types.
 *
 * DigiFi/OpenCBS/Frappe-style configurability as a STATIC governed registry. No
 * user-editable admin screen, no schema mutation, and no fake products presented
 * as live data — every profile is explicitly marked as a template unless tied to
 * live Dataverse reference data.
 */

export type ProductProcessProfileType =
  | 'loan_product'
  | 'annual_review_type'
  | 'package_prep';

export interface ProductProcessProfile {
  profileKey: string;
  displayName: string;
  profileType: ProductProcessProfileType;
  /** STRUCTURAL: profiles are templates unless tied to live reference data. */
  isTemplate: boolean;
  documentRequirements: readonly string[];
  covenantRequirementTemplates: readonly string[];
  workflowRouteKey: string;
  approvalCheckpoints: readonly string[];
  packageRequirements: readonly string[];
  evidenceRequirements: readonly string[];
  /** Outbound delivery restrictions — all delivery stays disabled / approval-gated. */
  deliveryRestrictions: readonly string[];
  notes?: string;
}

export interface ProductProcessRegistryModel {
  profiles: readonly ProductProcessProfile[];
}
