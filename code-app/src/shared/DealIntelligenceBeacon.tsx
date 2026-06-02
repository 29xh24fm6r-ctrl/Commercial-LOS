import { useDealIntelligence } from './dealIntelligenceContext';

/**
 * Phase 123B — Cockpit beacon.
 *
 * Renders nothing visible. Pins the shared
 * `DealIntelligenceViewModel` into the DOM as `data-vm-*` attributes
 * so:
 *
 *   1. Integration tests can prove the shared view-model is the
 *      source of truth for the banker cockpit (no duplicate
 *      per-screen derivation).
 *   2. Future surfaces (Manager / Team / Executive / Portfolio)
 *      have a stable, observable contract to verify once they wire
 *      in the same provider — by reading the same beacon attributes
 *      tests stay aligned across surfaces.
 *
 * Honest absence is preserved at the attribute boundary: when a VM
 * field is `undefined` the attribute is OMITTED from the DOM entirely
 * (not rendered as `"undefined"` / `"Not set"` / empty string). Tests
 * assert presence-vs-absence, matching the deriver's discipline.
 *
 * No visible UI. The wrapper carries `hidden` + `aria-hidden="true"`
 * so screen readers and the cockpit layout don't see it.
 */
export function DealIntelligenceBeacon() {
  const vm = useDealIntelligence();

  const attrs: Record<string, string | number> = {};
  attrs['data-vm-deal-id'] = vm.dealId;
  attrs['data-vm-closure'] = vm.closure;
  attrs['data-vm-completeness-pct'] = vm.completeness.completenessPct;
  attrs['data-vm-open-task-count'] = vm.openTaskCount;
  attrs['data-vm-overdue-task-count'] = vm.overdueTaskCount;
  attrs['data-vm-outstanding-document-count'] = vm.outstandingDocumentCount;
  attrs['data-vm-last-activity-state'] = vm.lastActivity.state;

  if (vm.clientName !== undefined) attrs['data-vm-client-name'] = vm.clientName;
  if (vm.bankerName !== undefined) attrs['data-vm-banker-name'] = vm.bankerName;
  if (vm.stageName !== undefined) attrs['data-vm-stage'] = vm.stageName;
  if (vm.statusName !== undefined) attrs['data-vm-status'] = vm.statusName;
  if (vm.productTypeName !== undefined)
    attrs['data-vm-product-type'] = vm.productTypeName;
  if (vm.loanStructureName !== undefined)
    attrs['data-vm-loan-structure'] = vm.loanStructureName;
  if (vm.pricingTypeName !== undefined)
    attrs['data-vm-pricing-type'] = vm.pricingTypeName;
  if (vm.blockerStatus !== undefined)
    attrs['data-vm-blocker-status'] = vm.blockerStatus;
  if (vm.nextBestAction !== undefined) {
    attrs['data-vm-next-best-action-id'] = vm.nextBestAction.id;
  }

  return (
    <div
      hidden
      aria-hidden="true"
      data-testid="deal-intelligence-beacon"
      data-deal-intelligence-beacon="banker-cockpit"
      {...attrs}
    />
  );
}
