# Phase 156 — Controlled External Platform Activation Certification

## 1. Purpose

Certifies that Phases 150-155 collectively implement a safe, incremental external platform integration path with no uncontrolled writes, no vendor names in UI copy, no embedded secrets, and no live activation without explicit operator gate progression.

## 2. Scope

All source files under `src/integrations/externalPlatforms/`, all UI panels created in Phases 150-155, and the governance test suite that pins these constraints.

## 3. File Inventory

| Phase | Source | Panel |
|-------|--------|-------|
| 150 | externalPlatformConnectorReadiness.ts | ExternalPlatformConnectorReadinessPanel.tsx |
| 151 | externalPlatformReadOnlyAdapter.ts | ExternalPlatformReadOnlyPanel.tsx |
| 152 | externalEntityMatchAgainstLiveRecords.ts | ExternalEntityMatchReviewPanel.tsx |
| 153 | liveExternalSyncPreview.ts | LiveExternalSyncPreviewPanel.tsx |
| 154 | externalWritebackSchemaValidator.ts, externalDryRunWritebackPlan.ts | ExternalDryRunWritebackPanel.tsx |
| 155 | externalAllowlistedWritePilot.ts | ExternalAllowlistedWritePilotPanel.tsx |

## 4. Safety Booleans — All Phases

Every result type across Phases 150-155 pins `liveWritePerformed: false` and `externalSystemChanged: false` as literal type values. These are not runtime flags that can be toggled; they are compile-time constants.

## 5. Vendor Name Discipline

No user-facing string literal in any UI panel contains third-party vendor or product names. Governance scans extract string literals and verify none match vendor patterns.

## 6. No Direct Network Calls

No source file under `src/integrations/externalPlatforms/` calls `fetch`, `XMLHttpRequest`, or `axios` directly. The read-only adapter accepts an injected transport function, keeping the network seam replaceable and testable.

## 7. No Secrets or Environment Values

No source file contains API keys, tokens, passwords, connection strings, or `process.env` references. Credentials are managed outside the codebase.

## 8. No Dangerous Action Handlers

No source file contains `syncNow`, `pushNow`, `writeNow`, or `enableLive` handler functions. All panels are read-only with no write affordance.

## 9. Activation Gate Progression

The integration path follows a strict progression: connector readiness (150) -> read-only pull (151) -> entity matching (152) -> sync preview (153) -> dry-run writeback (154) -> allowlisted write pilot scaffold (155). Each gate must be satisfied before the next is available.

## 10. Audit Trail

Every result type includes a proof ID or audit ID. These are deterministic identifiers that tie each evaluation to a specific input and timestamp.

## 11. Fail-Closed Behavior

All adapters default to disabled mode and fail closed. Missing configuration, missing auth, or missing transport results in a blocked/disabled/rejected status, never a fallback success.

## 12. Read-Only UI Contract

All six panels accept a result/viewModel prop and render it read-only. No panel contains a write button, sync button, push button, enable button, or any mutation affordance.

## 13. Governance Test Coverage

`src/shared/governance/externalPlatformActivationCertification.test.ts` pins:
- All 7 Phase 150-156 docs exist
- All source files exist
- No vendor names in UI panel string literals
- Safety booleans pinned in all source files
- No fetch/XHR/axios in source
- No secrets/env values
- No syncNow/pushNow/writeNow/enableLive handlers

## 14. Acceptance

```bash
npm test -- externalPlatformActivationCertification
npm test -- externalPlatformConnectorReadiness externalPlatformReadOnly externalEntityMatch liveExternalSyncPreview externalDryRunWriteback externalAllowlistedWritePilot
npm run build
```

All safety constraints pinned. No uncontrolled external platform activation. No vendor names in user-facing copy. No embedded secrets. No live writes.
