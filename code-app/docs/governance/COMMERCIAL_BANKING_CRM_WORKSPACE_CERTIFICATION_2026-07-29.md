# Commercial Banking CRM Workspace Certification — 2026-07-29

Status: **CODE-CERTIFIED / TENANT GROWTH SCHEMA BLOCKED**

| Control | Result | Evidence |
|---|---|---|
| First-class routing and deep links | PASS | `/workspaces/crm/*`, CRM workspace switcher peer, Banker navigation |
| Authorization | PASS | `WorkspaceGate`; executive aggregate-only record policy |
| Real data / no fake metrics | PASS | ten-table loader, unknown partial domains, deterministic selectors |
| Company / Relationship 360 | PASS | overview, people/roles, graph, activity, provenance, duplicate warning |
| Person / Contact 360 | PASS | affiliation, explicit-role classification, channels/consent, activity |
| Opportunities / referrals | BLOCKED | operating model complete; tenant tables absent; writes fail closed |
| CRM-to-LOS conversion | BLOCKED | preview/idempotency contract complete; live opportunity table absent |
| Activity / tasks | PARTIAL PASS | shared timeline and governed writes; durable status/due-date schema blocked |
| Microsoft 365 | PASS WITH LIMITS | calendar read; capability matrix disclaims inbox sync |
| Copilot boundaries | PASS | existing governed boundary, sources/freshness, no autonomous action |
| Manager / team / executive | PASS | authorized-result-set labels; executive aggregate-only |
| Accessibility / responsive UX | PASS | semantic regions, labels, focus-visible, responsive grids, bounded overflow |
| Performance | PASS | parallel capped reads, 40-result search cap, cancellation guards, no record N+1 |
| Loan Workflow regression | TEST-GATED | existing workspace and deal tests included in release matrix |

No deployment, tenant mutation, fake CRM data, autonomous AI write, or `pac code push` occurred.

## Release matrix result

- CRM certification verifier: PASS, 23/23 tests.
- CRM write/governance focused run: PASS, 180/180 tests.
- CRM/Copilot focused run: PASS, 76/76 tests.
- Team/Manager/Executive CRM regression run: PASS, 72/72 tests.
- Routing/entitlement/Banker regression run: PASS, 121/121 tests.
- `npx tsc -b`: PASS.
- `npm run build`: PASS (1,098 modules transformed).
- Full `npm test`: FAIL. Vitest emitted 155 failure entries and three worker RPC timeouts. The failures are concentrated in legacy activation/default-posture contracts that disagree with the current base (for example tests asserting portfolio/checklist flags are off while the base ships them on), readiness-copy assertions, and router-less component tests. No first-class CRM focused suite failed. This is recorded as an existing repository certification blocker, not represented as a green full suite.
