/**
 * Phase 142A — Product / process profile deriver.
 *
 * PURE, READ-ONLY. Resolves a product/process template profile and reports
 * integrity: every profile is a template, carries document/covenant/evidence
 * requirements, references a known workflow route, and keeps delivery disabled.
 */

import { PRODUCT_PROCESS_REGISTRY, getProductProcessProfile } from './productProcessRegistry';
import { getWorkflowRoute } from '../workflow/workflowRouteRegistry';
import type { ProductProcessProfile } from './productProcessMetadataTypes';

export interface ProductProcessProfileResult {
  profile?: ProductProcessProfile;
  found: boolean;
  isTemplate: boolean;
  hasRequirements: boolean;
  workflowRouteKnown: boolean;
  deliveryDisabled: boolean;
}

export function deriveProductProcessProfile(profileKey: string): ProductProcessProfileResult {
  const profile = getProductProcessProfile(profileKey);
  if (!profile) {
    return { found: false, isTemplate: false, hasRequirements: false, workflowRouteKnown: false, deliveryDisabled: true };
  }
  return {
    profile,
    found: true,
    isTemplate: profile.isTemplate === true,
    hasRequirements: profile.documentRequirements.length > 0 || profile.covenantRequirementTemplates.length > 0 || profile.evidenceRequirements.length > 0,
    workflowRouteKnown: getWorkflowRoute(profile.workflowRouteKey) !== undefined,
    deliveryDisabled: profile.deliveryRestrictions.length > 0,
  };
}

export interface ProductProcessRegistryIntegrity {
  allTemplates: boolean;
  allHaveRequirements: boolean;
  allWorkflowRoutesKnown: boolean;
  allDeliveryDisabled: boolean;
}

export function deriveProductProcessRegistryIntegrity(): ProductProcessRegistryIntegrity {
  const results = PRODUCT_PROCESS_REGISTRY.map((p) => deriveProductProcessProfile(p.profileKey));
  return {
    allTemplates: results.every((r) => r.isTemplate),
    allHaveRequirements: results.every((r) => r.hasRequirements),
    allWorkflowRoutesKnown: results.every((r) => r.workflowRouteKnown),
    allDeliveryDisabled: results.every((r) => r.deliveryDisabled),
  };
}
