# Phase 169E -- Admin CRM Onboarding

Date: 2026-06-15
Baseline: b279de5 (Phase 169D). V1.0 tag v1.0.0-controlled-pilot at faf26d6.

## Case Outcome: CASE B (stack present; runtime CRM persistence disabled by default)

The Phase 141 CRM stack is present in this checkout, but live runtime CRM
persistence is disabled by default, the persistence resolver fails closed,
and the external CRM connector is disabled_by_default. No live create /
import / sync is enabled. This phase adds a readiness / onboarding surface
only.

## CRM Files / Adapters Found (verified in this checkout)

Present under `src/crm/`:

- `crmDataverseMapper.ts` + `crmDataverseSchemaPlan.ts` (schema/model).
- `crmLiveDataverseAdapter.ts`, `crmPersistenceAdapter.ts`,
  `crmPersistenceTypes.ts`.
- `resolveCrmPersistenceAdapter.ts` (fail-closed persistence resolver).
- `crmRuntimeSchemaGate.ts` (fail-closed schema gate).
- `crmFeatureFlags.ts`.
- `connectors/crmConnectorReadiness.ts` (Salesforce / nCino readiness
  audit, no live writes) and `writeback/` (policy-gated writeback pilots).

So neither Case A (live, explicitly enabled) nor Case C (absent) applies.

## Runtime Persistence Flag State

`CRM_LIVE_PERSISTENCE_ENABLED` default = **false** (and every other CRM
flag in `CRM_FEATURE_FLAG_DEFAULTS` is false). The flag is set `true` only
in TEST files; it is never enabled in app config. The admin model reads
the real default constant (not a hardcoded value) so the panel reports the
true state.

The persistence resolver (`resolveCrmPersistenceAdapter`) fails closed: it
returns the live adapter ONLY when the live persistence flag is enabled,
an authorized operator is present, the runtime schema gate verifies the
target schema, AND a transport is injected. None of these are wired in the
app runtime.

## External Connector State

`CRM_CONNECTOR_MODE = 'disabled_by_default'`. The connector readiness
audit (Salesforce / nCino) is pure and performs NO live writes; its
statuses are `not_configured` / `blocked` / `ready_for_dry_run` /
`rejected`. No external CRM connector is enabled, and this phase enables
none.

## What Is Visible In The Admin Console

`src/admin/CrmOnboardingAdminPanel.tsx` (mounted inside the authorized
branch of `AdminOperationsConsole`) shows:

- Status badge: "Disabled by default" (reads the real flag).
- The fail-closed disabled-by-default reason.
- External connector status: "Not configured (disabled by default)".
- Readiness inventory: schema/model present, persistence adapter present,
  runtime schema gate present, live persistence = false, external
  connector = off.
- The ten required onboarding data groups: organizations, people, contact
  points, relationships, role assignments, communication preferences,
  contact authorizations, vendor profiles, timeline events, audit entries.
- Five next safe steps (verify CRM schema -> register/regenerate SDK ->
  enable CRM runtime persistence behind explicit flag -> controlled
  test-tenant write -> only then expose live admin create/import).
- Three disabled action placeholders: "CRM create disabled", "CRM import
  disabled", "CRM sync disabled".
- The explicit note: this surface does not create CRM records or sync
  external CRM data until live persistence is explicitly enabled and
  certified; no borrower outreach, upload links, or external sync occur.

No fabricated CRM records are rendered -- the panel is a static readiness
model, not a data list.

## Why No Live Create / Import / Sync Was Enabled

`CRM_ADMIN_LIVE_WRITE_ENABLED = false`. The underlying live persistence
flag is off by default, the resolver fails closed, the external connector
is disabled_by_default, no authorized operator + injected transport is
wired, and this phase deliberately does not enable broad import or sync.
Enabling any of these would require turning on the feature flag
intentionally, an injected governed transport, a verified schema, and a
controlled test-tenant certification first -- none of which is in scope
here.

## Required Next Steps To Enable Safely

1. Verify the CRM Dataverse schema in the target environment via the
   runtime schema gate verification.
2. Register / regenerate the SDK + data-source manifest if needed.
3. Enable CRM runtime persistence behind an explicit flag
   (`CRM_LIVE_PERSISTENCE_ENABLED`) with an authorized operator and
   injected transport.
4. Run a controlled single-record test-tenant write and verify the audit
   trail.
5. Only then expose a governed admin create/import behind the certified
   resolver. Never bulk-import uncontrolled; no external sync until
   separately certified.

## Guardrails Honored

- No schema / migrations / Dataverse records created.
- No live CRM persistence enabled; resolver stays fail-closed.
- No CRM organizations / people / contacts / relationships / roles /
  preferences / authorizations / timeline events / audit entries created.
- No uncontrolled bulk import; no external CRM connector enabled.
- No fake CRM records.
- No hardcoded GUIDs (pinned by source tests).
- No permission bypass / widening; admin-gated by the existing route +
  console gate.
- No external HTTP / fetch / Graph (pinned by source tests).
- New Deal / portfolio write enablement / Copilot untouched.

## Files Changed

- `src/admin/adminCrmOnboardingModel.ts` -- readiness/group/step model.
- `src/admin/CrmOnboardingAdminPanel.tsx` -- readiness/onboarding panel.
- `src/admin/AdminOperationsConsole.tsx` -- mounts the panel.
- `src/admin/adminCrmOnboardingModel.test.ts`,
  `src/admin/CrmOnboardingAdminPanel.test.tsx` -- tests.
- `src/shared/governance/releaseCandidateSnapshot.test.ts` -- doc pin.
- `docs/PHASE_169E_ADMIN_CRM_ONBOARDING.md` -- this doc.

## Route Delta

0. The panel renders inside the existing `/workspaces/admin` route. No
router file changed; no new route added.

## Validation

- `npm test -- Admin admin crm releaseCandidateSnapshot`: passed.
- `npm test`: passed (full suite).
- `npm run build`: passed (existing Vite chunk-size warning only).

## Deploy / Tag / Schema / Record

No deploy. No tag created or moved (`v1.0.0-controlled-pilot` stays at
`faf26d6`). No schema, migration, or Dataverse record created. No live
write/import/sync enabled. No permission widened.
