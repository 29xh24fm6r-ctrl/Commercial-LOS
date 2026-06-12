# Phase 169D -- Admin Portfolio Boarding Onboarding

Date: 2026-06-12
Baseline: 5a3c8ab (Phase 169C). V1.0 tag v1.0.0-controlled-pilot at faf26d6.

## Case Outcome: CASE B (stack present; runtime persistence disabled by default)

The Phase 140 portfolio boarding stack is present in this checkout, but
live runtime persistence is disabled by default and the resolver fails
closed. No live create / import / document upload is enabled. This phase
adds a readiness / onboarding surface only.

## Portfolio Files / Adapters Found (verified in this checkout)

Present under `src/portfolioBoarding/`:

- `portfolioLoanBoardingDataverseAdapter.ts` + mapper + schema plan.
- `portfolioLoanBoardingWriteAdapter.ts`.
- `portfolioLoanDocumentUploadAdapter.ts` (+ `PortfolioLoanBoardingDocumentUploadPanel.tsx`).
- `resolvePortfolioLoanBoardingPersistenceAdapter.ts` / `resolvePortfolioLoanBoardingAdapter.ts`.
- `portfolioBoardingRuntimeSchemaGate.ts` (fail-closed schema gate).
- `portfolioLoanBoardingFeatureFlags.ts` / `portfolioBoardingFeatureFlags.ts`.
- `portfolioBoardingCommandCenterAdapter.ts`, `portfolioBoardingAccess.ts`.

So neither Case A (live, explicitly enabled) nor Case C (absent) applies.

## Runtime Persistence Flag State

`PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED` default = **false**
(`PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS`). The only places the flag is
set `true` are TEST files; it is never enabled in app config. The admin
model reads the real default constant (not a hardcoded value) so the
panel reports the true state.

The persistence resolver
(`resolvePortfolioLoanBoardingPersistenceAdapter`) fails closed: it
returns the live adapter ONLY when the live + route flags are enabled, an
authorized operator is present, the runtime schema gate verifies the
target schema, AND a Dataverse client is injected. None of these are
wired in the app runtime.

## What Is Visible In The Admin Console

`src/admin/PortfolioBoardingAdminPanel.tsx` (mounted inside the
authorized branch of `AdminOperationsConsole`) shows:

- Status badge: "Disabled by default" (reads the real flag).
- The fail-closed disabled-by-default reason.
- Readiness inventory: schema/model present, persistence adapter present,
  document upload adapter present (gated), runtime schema gate present,
  live runtime persistence = false.
- The nine required data groups: loan master, borrower, collateral,
  guarantors, covenants, ticklers, insurance, documents/evidence
  references, exceptions/reviews.
- Five next safe steps (verify schema -> regenerate/register SDK ->
  enable adapter behind explicit flag -> controlled test-tenant write ->
  only then expose live admin create/import).
- Three disabled action placeholders: "Portfolio create disabled",
  "Import disabled", "Document upload disabled".
- The explicit note: this surface does not create portfolio loan records
  until live persistence is explicitly enabled and certified.

No fabricated loans / documents / evidence are rendered -- the panel is a
static readiness model, not a data list.

## Why No Live Create / Import / Upload Was Enabled

`PORTFOLIO_BOARDING_ADMIN_LIVE_WRITE_ENABLED = false`. The underlying live
persistence flag is off by default, the resolver fails closed, no
authorized operator + injected client is wired, and this phase
deliberately does not enable broad import or document upload. Enabling any
of these would require turning on the feature flags intentionally, an
injected governed client, a verified schema, and a controlled
test-tenant certification first -- none of which is in scope here.

## Required Next Steps To Enable Safely

1. Verify the Dataverse boarding schema in the target environment via the
   runtime schema gate verification.
2. Regenerate / register the SDK + data-source manifest if needed.
3. Enable the adapter behind explicit flags
   (`PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED` + route flag) with an
   authorized operator and injected client.
4. Run a controlled single-record test-tenant write and verify the audit
   trail.
5. Only then expose a governed admin create/import behind the certified
   resolver. Never bulk-import uncontrolled.

## Guardrails Honored

- No schema / migrations / Dataverse records created.
- No live boarding persistence enabled; resolver stays fail-closed.
- No uncontrolled bulk import; no document upload wired.
- No fake portfolio loans / documents / evidence.
- No hardcoded GUIDs (pinned by source tests).
- No permission bypass / widening; admin-gated by the existing route +
  console gate.
- No external HTTP / fetch / Graph (pinned by source tests).
- New Deal / CRM / Copilot live connectors untouched.

## Files Changed

- `src/admin/adminPortfolioBoardingModel.ts` -- readiness/group/step model.
- `src/admin/PortfolioBoardingAdminPanel.tsx` -- readiness/onboarding panel.
- `src/admin/AdminOperationsConsole.tsx` -- mounts the panel.
- `src/admin/adminPortfolioBoardingModel.test.ts`,
  `src/admin/PortfolioBoardingAdminPanel.test.tsx` -- tests.
- `src/shared/governance/releaseCandidateSnapshot.test.ts` -- doc pin.
- `docs/PHASE_169D_ADMIN_PORTFOLIO_BOARDING_ONBOARDING.md` -- this doc.

## Route Delta

0. The panel renders inside the existing `/workspaces/admin` route. No
router file changed; no new route added.

## Validation

- `npm test -- Admin admin portfolioBoarding releaseCandidateSnapshot`: passed.
- `npm test`: passed (full suite).
- `npm run build`: passed (existing Vite chunk-size warning only).

## Deploy / Tag / Schema / Record

No deploy. No tag created or moved (`v1.0.0-controlled-pilot` stays at
`faf26d6`). No schema, migration, or Dataverse record created. No live
write enabled. No permission widened.
