import type { DealIndustryProjection } from '../crm/dealIndustryProjection';

/**
 * Deal Industry hydration decision (PURE).
 *
 * Given the CRM/NAICS industry projection for a deal's linked client and the deal's CURRENT
 * `cr664_industry` value, decides whether the Intake "Industry" exit criterion is satisfied by a
 * GOVERNED classification, what honest source to display, whether to auto-apply the CRM-derived
 * value (only when the banker has not manually set Industry — a manual choice is never overwritten),
 * and — when unresolved — a direct remediation action.
 *
 * The CRM-derived classification is governed end-to-end: it comes only from a valid 6-digit NAICS on
 * the linked CRM organization, mapped through the shared NAICS→sector→industry logic. An invalid,
 * missing, or unmapped NAICS NEVER satisfies the criterion. Nothing is fabricated.
 */

export type DealIndustrySource = 'crm-derived' | 'manual' | 'none';

export type DealIndustryRemediation =
  | { readonly kind: 'link-crm-client' }
  | { readonly kind: 'edit-crm-naics'; readonly organizationId: string };

export interface DealIndustryHydration {
  /** Whether the Intake Industry exit criterion is satisfied by a governed classification. */
  readonly criterionSatisfied: boolean;
  /** Honest provenance of the satisfying value. */
  readonly source: DealIndustrySource;
  /**
   * The governed deal industry to AUTO-APPLY (persist to cr664_industry) — present ONLY when a CRM
   * NAICS classification is available AND the deal has no manual industry yet. It is NEVER set when a
   * manual industry already exists, so the derivation can never silently overwrite a banker's choice.
   */
  readonly industryToApply?: string;
  /** Honest one-line status for the banker (provenance, or why Industry is unresolved). */
  readonly status: string;
  /** A direct remediation action when Industry/NAICS is unresolved (undefined when satisfied). */
  readonly remediation?: DealIndustryRemediation;
  /** True when the derivation is honestly unavailable (CRM/NAICS schema not deployed / read failed). */
  readonly unavailable: boolean;
}

function manualSatisfied(manual: string, unavailable = false): DealIndustryHydration {
  return { criterionSatisfied: true, source: 'manual', status: `Manual (${manual})`, unavailable };
}

export function deriveDealIndustryHydration(
  projection: DealIndustryProjection,
  currentDealIndustry: string | undefined,
): DealIndustryHydration {
  const manual = (currentDealIndustry ?? '').trim();
  const hasManual = manual.length > 0;

  switch (projection.kind) {
    case 'derived': {
      if (!hasManual) {
        // A valid CRM NAICS provides the governed classification — auto-hydrate; the banker need not
        // re-enter Industry manually.
        return {
          criterionSatisfied: true,
          source: 'crm-derived',
          industryToApply: projection.dealIndustry,
          status: `CRM-derived · NAICS ${projection.naicsCode} · ${projection.sectorTitle} → ${projection.dealIndustry}`,
          unavailable: false,
        };
      }
      // A manual deal industry already exists — it wins and is NEVER overwritten by the derived value.
      return {
        criterionSatisfied: true,
        source: 'manual',
        status:
          manual === projection.dealIndustry
            ? `Manual (${manual}) · matches CRM-derived`
            : `Manual (${manual}) · CRM-derived differs (${projection.dealIndustry}) — manual value kept`,
        unavailable: false,
      };
    }

    case 'no-naics':
    case 'no-sector': {
      // A CRM company is linked but its NAICS is missing or not a valid classifiable code — the banker
      // can fix it directly in the governed CRM NAICS editor for that company.
      if (hasManual) return manualSatisfied(manual);
      return {
        criterionSatisfied: false,
        source: 'none',
        status:
          projection.kind === 'no-naics'
            ? 'Industry/NAICS unresolved — the linked CRM company has no NAICS code.'
            : `Industry/NAICS unresolved — NAICS ${projection.naicsCode} is not a classifiable code.`,
        remediation: { kind: 'edit-crm-naics', organizationId: projection.organizationId },
        unavailable: false,
      };
    }

    case 'no-mapping': {
      // NAICS + sector resolve, but no admin sector→industry mapping row exists. That is a maker/admin
      // gap, not something a banker fixes by editing NAICS, so no banker remediation is offered.
      if (hasManual) return manualSatisfied(manual);
      return {
        criterionSatisfied: false,
        source: 'none',
        status: `Industry/NAICS unresolved — sector ${projection.sectorTitle} has no industry mapping (admin).`,
        unavailable: false,
      };
    }

    case 'no-org-link': {
      if (hasManual) return manualSatisfied(manual);
      return {
        criterionSatisfied: false,
        source: 'none',
        status: 'Industry/NAICS unresolved — the linked client is not bridged to a CRM company with NAICS.',
        unavailable: false,
      };
    }

    case 'no-crm-link': {
      if (hasManual) return manualSatisfied(manual);
      return {
        criterionSatisfied: false,
        source: 'none',
        status: 'Industry/NAICS unresolved — no CRM client is linked to this deal.',
        remediation: { kind: 'link-crm-client' },
        unavailable: false,
      };
    }

    case 'unavailable': {
      // Schema not deployed / a read failed. A manual value still satisfies; otherwise honestly unavailable.
      if (hasManual) return manualSatisfied(manual, true);
      return {
        criterionSatisfied: false,
        source: 'none',
        status:
          'CRM/NAICS industry derivation is unavailable (schema not deployed). Enter Industry manually or deploy the CRM/NAICS schema.',
        unavailable: true,
      };
    }
  }
}

/**
 * P1-7 — source-aware refresh of a deal's Industry after its linked company's NAICS may have changed.
 *
 * `deriveDealIndustryHydration` above is provenance-blind: any non-empty Industry looks manual, so it
 * will never update a value it once auto-derived. That is correct for first-time hydration but wrong
 * for an explicit "refresh from CRM NAICS" gesture, where a value that was previously CRM-derived
 * must track a later NAICS change, while a value the banker actually typed must be preserved.
 *
 * This decision takes the KNOWN provenance of the current stored value (`priorSource`) and:
 *  - applies the CRM-derived value when Industry is empty OR was previously CRM-derived and the
 *    derivation has since changed (explicit, auditable refresh — `previousIndustry` records the swap);
 *  - preserves an explicit manual override (priorSource 'manual') and never overwrites it;
 *  - reports up-to-date / unresolved honestly otherwise.
 *
 * The caller persists `industryToApply` (when present) through the same governed deal-profile write
 * (validate → write → readback → audit), so every refresh and every preserved override is auditable.
 */
export type DealIndustryRefreshAction = 'apply' | 'keep-manual' | 'up-to-date' | 'unresolved';

export interface DealIndustryRefreshDecision {
  readonly action: DealIndustryRefreshAction;
  readonly source: DealIndustrySource;
  /** The governed deal industry to persist — present ONLY when action === 'apply'. */
  readonly industryToApply?: string;
  /** The value being replaced by an explicit refresh (present only when a stale derived value changes). */
  readonly previousIndustry?: string;
  readonly status: string;
  readonly remediation?: DealIndustryRemediation;
  readonly unavailable: boolean;
}

export function deriveDealIndustryRefresh(
  projection: DealIndustryProjection,
  currentDealIndustry: string | undefined,
  priorSource: DealIndustrySource,
): DealIndustryRefreshDecision {
  const current = (currentDealIndustry ?? '').trim();
  const hasCurrent = current.length > 0;
  // An explicit manual override is authoritative and never auto-overwritten by a refresh.
  const treatAsManual = hasCurrent && priorSource === 'manual';

  if (projection.kind === 'derived') {
    if (treatAsManual) {
      return {
        action: 'keep-manual',
        source: 'manual',
        status:
          current === projection.dealIndustry
            ? `Manual (${current}) · matches CRM-derived`
            : `Manual (${current}) · CRM-derived differs (${projection.dealIndustry}) — manual override kept`,
        unavailable: false,
      };
    }
    // Empty, or a previously CRM-derived/unknown value: track the (possibly changed) derivation.
    if (hasCurrent && current === projection.dealIndustry) {
      return {
        action: 'up-to-date',
        source: 'crm-derived',
        status: `CRM-derived · NAICS ${projection.naicsCode} · ${projection.sectorTitle} → ${projection.dealIndustry} (up to date)`,
        unavailable: false,
      };
    }
    return {
      action: 'apply',
      source: 'crm-derived',
      industryToApply: projection.dealIndustry,
      previousIndustry: hasCurrent ? current : undefined,
      status: hasCurrent
        ? `CRM-derived refresh · NAICS ${projection.naicsCode} · ${projection.sectorTitle} → ${projection.dealIndustry} (was ${current})`
        : `CRM-derived · NAICS ${projection.naicsCode} · ${projection.sectorTitle} → ${projection.dealIndustry}`,
      unavailable: false,
    };
  }

  // Non-derived projections: a real manual override is preserved; otherwise mirror the hydration
  // decision's honest unresolved/unavailable status and remediation (no fabrication).
  if (treatAsManual) {
    const hydration = deriveDealIndustryHydration(projection, current);
    return {
      action: 'keep-manual',
      source: 'manual',
      status: hydration.status,
      unavailable: hydration.unavailable,
    };
  }
  const hydration = deriveDealIndustryHydration(projection, undefined);
  return {
    action: 'unresolved',
    source: 'none',
    status: hydration.status,
    remediation: hydration.remediation,
    unavailable: hydration.unavailable,
  };
}
