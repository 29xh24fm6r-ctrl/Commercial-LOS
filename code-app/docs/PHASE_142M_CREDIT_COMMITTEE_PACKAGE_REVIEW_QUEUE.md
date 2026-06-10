# Phase 142M — Credit Committee Package Review Queue (No Voting)

> **What this is.** A read-only Credit Committee Package Review Queue that
> summarizes which credit packages are ready for HUMAN committee review, what
> evidence is present/missing, and what still blocks readiness. It does NOT
> implement committee voting, approvals, denials, recommendations, credit
> decisions, or any state mutation. It is pure / read-only, consumes only explicit
> input, and is honest when data is unavailable. **Review only — no voting or
> approvals.**

## 1. What was added

| File | Role |
|---|---|
| `src/committee/creditCommitteePackageQueue.ts` | Pure deriver: input/row/queue types + `deriveCreditCommitteePackageQueue` |
| `src/committee/CreditCommitteePackageReviewQueuePanel.tsx` | Read-only queue panel (KPI strip, rows, detail, empty/unavailable states) |

> The panel file name intentionally differs in case from the deriver
> (`creditCommitteePackageQueue.ts`) to avoid case-insensitive module-resolution
> collisions on Windows.

## 2. What data it consumes

A narrow, explicit input array of `CreditCommitteePackageInput` — `dealId`,
optional `dealName` / `clientName` / `bankerName` / `stage` / `status`, optional
`memoId` / `memoGeneratedAt`, an optional canonical-memo `committeeReadiness`
section (`hasDecisionSupport`, `remainingBlockers`, `decisionSupportCount`,
`highConfidenceSupportCount`, `evidenceCount`, `missingEvidenceLabels`), and
optional `blockers` / `evidenceCount` / `sourceCount` / `missingEvidenceLabels` /
`packageGeneratedAt` / `lastReviewedAt`. **No new loader is added** — the input is
populated from already-available local/read-only data by the caller.

## 3. Derivation rules

- No memo / package present → `not_generated`.
- Remaining committee-readiness blockers → `blocked`.
- Evidence count is zero, or missing-evidence labels exist → `needs_evidence`.
- Decision support present with no blockers and no missing evidence →
  `ready_for_review`.
- Required readiness fields missing / ambiguous → `unknown`.
- Approval readiness is **never** inferred from general deal completeness alone.
- Nothing is labeled "approved", "recommended by committee", "voted", or
  "decisioned". Counts and totals are deterministic.

## 4. Why there is no voting

Committee voting, approvals, and denials are human decisions with regulatory
weight. This phase surfaces **readiness decision support** for a human committee
only — it never records a vote, approval, denial, recommendation, or credit
decision, and it changes no deal state.

## 5. What is explicitly NOT implemented

No voting; no approve / deny / recommend action; no "committee-approved" copy; no
deal-state mutation; no lifecycle / status / stage change; no Dataverse write; no
CRM write; no PATCH/POST/PUT/DELETE; no fetch / XMLHttpRequest / axios; no schema
migration; no custom API; no Power Automate / Graph / Outlook call; no Copilot
live connector; no permission widening; no fake committee decisions; no fake
evidence; no fallback mock queue data in production code.

## 6. Safety / permission posture

The deriver is pure and the panel is read-only (no buttons, forms, or inputs).
The component is exported and fully tested but is **not mounted to any route** in
this phase — route / workspace mounting is deferred so no access is widened. If
mounted later, it must reuse an already-authorized read-only surface and pass
only already-authorized local data. An optional `dealHrefFor` builder renders an
internal link to an EXISTING deal route only; no new route is created.

## 7. Acceptance commands

```
npm test -- committee creditCommittee CreditCommittee releaseCandidateSnapshot governance
npm run build
npm test
```

## 8. Follow-up phase suggestions

- A later phase may mount the queue in an already-authorized manager / executive
  read-only surface using existing local data, without widening access.
- A future phase may add a governed, audited human-committee record model — still
  with explicit human action and no automated decisioning.

## 9. Next recommended phase

**Phase 142N — Live package export adapter seam, disabled by default.**
