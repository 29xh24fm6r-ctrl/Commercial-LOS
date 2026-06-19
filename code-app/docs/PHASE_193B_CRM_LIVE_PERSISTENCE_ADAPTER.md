# Phase 193B — CRM Live Persistence Adapter

**Status:** Complete. Real CRM spine record create/update over the guarded
transport seam, defaulting to dry-run/no-write.

**Branch:** `phase193b-crm-live-persistence-adapter`.
**Depends on:** PR 193A (branched from its tip — shares the live gates).

## Delivered

- `src/crm/crmSalesforceSpinePersistenceAdapter.ts` — `persistCrmSpineRecords`.
- `src/crm/crmSalesforceSpineAudit.ts` — deterministic audit-payload builder.

## Entities

Accepts all 11 spine entity keys. Persistable (map to an allow-listed
`cr664_crm*` table): Account → organization, Contact → person,
AccountContactRelationship + DealRelationship → relationship, RelationshipRole +
CoverageTeamMember → roleAssignment, Activity → timelineEvent, SourceFact →
auditEntry. Derived/policy entities (Task, RelationshipHealth,
VisibilityRequirement) are honestly skipped — not directly persisted this phase.

## Capabilities + outcomes

dry-run create/update, live create/update, idempotent upsert (recordId →
update, else create), required-field validation, provenance capture, audit
payload per result, partial-success handling.

Outcomes: `created` · `updated` · `skipped_missing_required_data` ·
`blocked_gate_not_satisfied` · `failed_dataverse` · `partial_success` ·
`dry_run_only`.

## Safety

- No fabricated records; missing required fields (incl. `sourceFacts`) are
  rejected, never defaulted.
- Live writes require the persistence gate (incl. correlation id) AND a
  transport; otherwise blocked. No delete; no SDK/fetch import.
- Every write emits an audit payload (actor, target, action, outcome, source
  facts, correlation id, error).

## Validation

- `npm test -- phase193B crmSalesforceSpine persistence audit` — green.
- `npm run build` — green.
- `npm test -- crmGovernance noFakeProductionData releaseCandidateSnapshot` — green.
