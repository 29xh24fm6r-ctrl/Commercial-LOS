# Commercial Banking CRM Workspace Architecture — 2026-07-29

## Decision

CRM is a peer workspace at `/workspaces/crm/*`, independent of deal selection. It shares governed Dataverse customer, relationship, activity, and LOS linkage truth with Loan Workflow; it is not a second system of record.

## Runtime flow

Authenticated Platform User → `WorkspaceGate` → role-aware CRM shell → bounded parallel reads of the ten verified `cr664_crm*` tables → deterministic selectors → Home, Company 360, Person 360, Relationships, Activities, Calendar, Insights, and Reports.

The Banker CRM Hub navigation moves to the CRM route. Company/person deep links use stable record IDs and browser history. Executive entry is aggregate-only. Banker, team, manager, portfolio, executive, and admin primary routes remain unchanged.

## Reused Dataverse truth

| Domain | Existing table / boundary | Use |
|---|---|---|
| Companies | `cr664_crmorganizations` | Company 360, search, portfolio counts |
| People | `cr664_crmpersons` | Person 360, affiliations |
| Relationships | `cr664_crmrelationships` | Relationship graph and active counts |
| Roles | `cr664_crmroleassignments` | Explicit role evidence |
| Contact channels | `cr664_crmcontactpoints` | Preferred/verified contact facts |
| Consent/preferences | `cr664_crmcommunicationpreferences`, `cr664_crmcontactauthorizations` | Contact governance |
| Activity | `cr664_crmtimelineevents` | Shared CRM/LOS timeline |
| Audit | `cr664_crmauditentries` | Provenance and governed writes |
| Vendors/advisers | `cr664_crmvendorprofiles` | Professional relationship facts |
| Deals/loans | Existing LOS linkages and deal routes | Navigation; no duplicated credit documents |

Reads are capped at 200 rows per domain, parallelized, and fail independently. Failed domains are unknown, never converted to zero. Search ranks exact title, prefix, title-token, then full-record token matches deterministically and returns at most 40 results. Recent searches are session-memory only.

## Derived facts

- “No recent contact” means no linked dated timeline event in 45 days.
- “Missing linked contact” means no loaded CRM person has the company lookup.
- Active relationship count excludes an explicit `Inactive` badge.
- No relationship composite score, sentiment, credit conclusion, weighted amount, exposure, deposit, or product penetration is fabricated.

## Governed writes

Existing company/contact/activity/follow-up/relationship actions reuse `crmWriteAdapter` and `crmUpdateAdapter`: actor authorization, validation, readback, audit, and structured outcomes. The proposed growth adapter additionally requires verified schema, correlation-ID duplicate protection, readback, audit, and timeline confirmation. Accepted-but-unconfirmed results require reconciliation.

## Genuine schema dependencies

The verified contract is ten tables / 147 columns / 28 relationships and contains no commercial opportunity, referral, or durable task entity. Exact proposed definitions live in `scripts/dataverse/schema/commercial-crm-growth.schema.json`. The plan-only script is `scripts/dataverse/create-commercial-crm-growth-schema.ps1`. Its `-Apply` path deliberately throws until an approved operator solution workflow is used and generated services are regenerated. Runtime growth writes stay disabled.

No schema provisioning, record seeding, deployment, or `pac code push` occurred in this arc.

## Microsoft 365 and Copilot

Calendar is an on-demand signed-in-user read through the existing adapter. Inbox synchronization is not claimed. Email, meeting, and Teams actions remain human-confirmed and connector-proven in their governed contexts.

Copilot uses `CopilotAssistPanel` and the existing Copilot Studio/Dataverse boundary. It receives only the loaded authorized snapshot plus a visible source/freshness ledger. It cannot write, send, schedule, convert, close, or complete.

## Tenant/operator actions

1. Review the three proposed table definitions and policy choices.
2. Provision through approved Dataverse solution tooling in a change window.
3. Regenerate services through approved tooling.
4. Run schema/readback/audit/timeline verification.
5. Attach evidence and change `CRM_GROWTH_SCHEMA_DEPENDENCY.verified` only in a separately reviewed change.
