/**
 * Phase 144A — System-wide drill-through registry.
 *
 * A pure, in-memory registry that lets any surface register a builder which maps
 * its already-derived view-model payload into a read-only {@link DrillThroughTarget}.
 * Surfaces stay decoupled from the panel: the registry is the system-wide contract
 * proving every summarized metric/status/row can explain itself.
 *
 * No live call, no write, no navigation, no embedded sample data. Builders are
 * pure functions of caller-supplied payloads.
 */

import {
  buildDrillThroughTarget,
  validateDrillThroughTarget,
  type DrillThroughEntityKind,
  type DrillThroughInput,
  type DrillThroughSurface,
  type DrillThroughTarget,
} from './drillThroughTypes';

/** A builder maps an arbitrary caller payload into a normalized target. */
export type DrillThroughBuilder<P = unknown> = (payload: P) => DrillThroughTarget;

/** Static metadata describing a registered surface. */
export interface DrillThroughSurfaceDescriptor {
  surface: DrillThroughSurface;
  /** Human label for docs / governance output. */
  label: string;
  /** Default entity kind for cards on this surface. */
  entityKind: DrillThroughEntityKind;
  /** Origin phase, for traceability in the governance report. */
  phase: string;
}

interface RegistryEntry {
  descriptor: DrillThroughSurfaceDescriptor;
  builder: DrillThroughBuilder;
}

export interface DrillThroughRegistry {
  register<P>(descriptor: DrillThroughSurfaceDescriptor, builder: DrillThroughBuilder<P>): void;
  has(surface: DrillThroughSurface): boolean;
  get(surface: DrillThroughSurface): RegistryEntry | undefined;
  build(surface: DrillThroughSurface, payload: unknown): DrillThroughTarget | undefined;
  list(): readonly DrillThroughSurfaceDescriptor[];
  surfaces(): readonly DrillThroughSurface[];
}

/** Creates an isolated registry instance (tests use their own; app uses the shared one). */
export function createDrillThroughRegistry(): DrillThroughRegistry {
  const entries = new Map<DrillThroughSurface, RegistryEntry>();
  return {
    register(descriptor, builder) {
      entries.set(descriptor.surface, {
        descriptor,
        builder: builder as DrillThroughBuilder,
      });
    },
    has(surface) {
      return entries.has(surface);
    },
    get(surface) {
      return entries.get(surface);
    },
    build(surface, payload) {
      return entries.get(surface)?.builder(payload);
    },
    list() {
      return Object.freeze([...entries.values()].map((e) => e.descriptor));
    },
    surfaces() {
      return Object.freeze([...entries.keys()]);
    },
  };
}

/**
 * A generic builder usable by any surface that already produced a summary, source
 * facts, counts, warnings, blockers, and a next step. When the payload carries no
 * content and no route, it yields an honest unavailable target — never a blank or
 * fabricated drawer.
 */
export type GenericSurfacePayload = Omit<DrillThroughInput, 'surface' | 'entityKind'> & {
  surface?: DrillThroughSurface;
  entityKind?: DrillThroughEntityKind;
};

export function buildGenericSurfaceTarget(
  descriptor: DrillThroughSurfaceDescriptor,
  payload: GenericSurfacePayload,
): DrillThroughTarget {
  return buildDrillThroughTarget({
    ...payload,
    surface: payload.surface ?? descriptor.surface,
    entityKind: payload.entityKind ?? descriptor.entityKind,
  });
}

/**
 * The recent Phase 142/143 surfaces this phase brings under the drill-through
 * contract. Each is registered with a generic builder so its cards/rows expose
 * read-only detail (or an honest unavailable reason). Panel-level wiring of older
 * legacy surfaces is tracked in the Phase 144A doc as a follow-up.
 */
export const RECENT_SURFACE_DESCRIPTORS: readonly DrillThroughSurfaceDescriptor[] = Object.freeze([
  { surface: 'executive_command_center', label: 'Executive Command Center', entityKind: 'kpi', phase: '142H/142I' },
  { surface: 'product_strategy', label: 'Executive Product Strategy', entityKind: 'summary_card', phase: '142H' },
  { surface: 'product_profitability_roe', label: 'Product Profitability / ROE Availability', entityKind: 'metric', phase: '142S' },
  { surface: 'committee_package_queue', label: 'Credit Committee Package Review Queue', entityKind: 'queue_row', phase: '142M' },
  { surface: 'package_export', label: 'Committee Package Export Adapter', entityKind: 'summary_card', phase: '142N' },
  { surface: 'esign_envelope', label: 'E-Sign Envelope Adapter (PandaDoc, disabled)', entityKind: 'summary_card', phase: '142O' },
  { surface: 'core_banking_lookup', label: 'Core Banking Read-Only Lookup', entityKind: 'summary_card', phase: '142P' },
  { surface: 'aml_kyc_policy_gate', label: 'AML/KYC + Bureau Policy Gate', entityKind: 'status', phase: '142Q' },
  { surface: 'servicing_lifecycle', label: 'Servicing Lifecycle Mapper', entityKind: 'summary_card', phase: '142R' },
  { surface: 'crm_relationship_intelligence', label: 'CRM Relationship Intelligence Cockpit', entityKind: 'cockpit_widget', phase: '143H' },
  { surface: 'crm_connector_readiness', label: 'CRM Connector Readiness', entityKind: 'summary_card', phase: '143B' },
  { surface: 'crm_entity_matching', label: 'CRM Entity Matching', entityKind: 'summary_card', phase: '143C' },
  { surface: 'crm_sync_preview', label: 'CRM Sync Preview', entityKind: 'queue_row', phase: '143D' },
  { surface: 'crm_writeback_policy', label: 'CRM Writeback Policy / Dry-Run', entityKind: 'status', phase: '143E/143F' },
  { surface: 'crm_activity_timeline', label: 'CRM Activity Timeline', entityKind: 'queue_row', phase: '143G' },
]);

/** Builds a registry pre-populated with the recent-surface descriptors. */
export function createRecentSurfaceRegistry(): DrillThroughRegistry {
  const registry = createDrillThroughRegistry();
  for (const descriptor of RECENT_SURFACE_DESCRIPTORS) {
    registry.register<GenericSurfacePayload>(descriptor, (payload) =>
      buildGenericSurfaceTarget(descriptor, payload),
    );
  }
  return registry;
}

/** Convenience: validate a freshly-built target, returning issue problems only. */
export function drillThroughIssues(target: DrillThroughTarget): readonly string[] {
  return validateDrillThroughTarget(target).map((i) => i.problem);
}
