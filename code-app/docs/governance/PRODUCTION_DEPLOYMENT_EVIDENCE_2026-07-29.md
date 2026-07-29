# Production Deployment Evidence — 2026-07-29

Status: **DEPLOYED — LIVE CERTIFICATION INCOMPLETE — NO-GO**

## Approved release

| Item | Value |
|---|---|
| Release commit | `8ea09ed085927b80ad0257c18eb2d2037abfcdaa` |
| Branch | `remediation/production-go-2026-07-29` |
| Environment ID | `5f2d77a5-de50-edeb-9d74-5b2400a2320d` |
| Organization | `https://org3a57b8d4.crm.dynamics.com/` |
| Organization ID | `d8c72df0-fd13-f111-afbe-000d3a34432b` |
| App ID | `63858e09-3d0b-47c9-b1d2-65cef742fda4` |
| Solution | `CommercialLendingLOS` |
| Operator | `mpaller@oldglorybank.com` |

Matthew explicitly approved deployment of the exact release commit to the
exact environment after verification results were presented.

## Pre-deployment verification

- Changed-surface test rerun: **188/188 passed** across 17 files.
- A first rerun exposed an unmounted tab-transition timer. The release was not
  deployed until the timer was cancelled on cleanup, a regression test was
  added, and the suite reran without unhandled errors.
- TypeScript: `npx tsc -b --pretty false` — **passed**.
- Production build: `npm run build` — **passed**.
- Non-blocking warnings: the main bundle exceeds the configured size warning
  threshold and several dynamic imports are also statically imported.
- `.env.production` was preserved and excluded from every commit.
- Unrelated modified and untracked files were excluded.

## Deployment result

The SHA was checked immediately before the push and matched the approved
release. `pac org who` confirmed the expected operator, organization, and
environment. The approved command was:

```text
pac code push --environment 5f2d77a5-de50-edeb-9d74-5b2400a2320d --solutionName CommercialLendingLOS
```

Power Platform CLI returned `App pushed successfully` and the production play
target for app `63858e09-3d0b-47c9-b1d2-65cef742fda4`.

No schema publication, SharePoint mutation, external email, record deletion,
or record merge was part of the deployment.

## Immediate post-deployment read-only verification

The Dataverse File schema check passed all six required upload columns:

- `cr664_documentfile` — File
- `cr664_originalfilename` — String
- `cr664_mimetype` — String
- `cr664_filesizebytes` — Integer
- `cr664_uploadedon` — DateTime
- `cr664_uploadedby` — Lookup

The stage reference table contained seven active rows with complete and unique
sequence values. `cr664_stagetype` remains unavailable and is not claimed.

The post-deployment inventory retained the expected seven governed findings
and did not mutate records. Its SHA-256 is
`52840f83fcc3e76fcbe9b6905e8f7e3e814b174a7e3d0291670194cbc808c8e0`.
The access token remained process-local and was cleared.

## Required live evidence

Deployment success does not establish Production GO. The following remain:

1. Open the freshly deployed app in compliant managed Edge and confirm the
   visible build identifier is
   `8ea09ed085927b80ad0257c18eb2d2037abfcdaa`.
2. Execute all 14 single-user acceptance lanes against the deployed release.
3. Upload an approved non-sensitive file through the live UI, reopen and
   download it, prove matching bytes/SHA-256, and reconcile metadata, audit,
   timeline, authorization, requirement state, and retention.
4. Create and finalize a controlled new memo version and prove persisted final
   content by readback. Historical final artifacts must not be rewritten.
5. Obtain authoritative servicing/core values for the incomplete Skeeterhawk
   boarded loan; no value may be fabricated.
6. Confirm the tenant retention/legal-hold policy applying to Dataverse File
   content and audit records.
7. Authenticate distinct requester, credit approver, funding authorizer, and
   boarding identities with their own MFA and execute all positive and
   negative segregation-of-duties scenarios.

Conditional Access previously rejected Chrome-for-Testing. Browser evidence
must therefore use the bank-managed Edge path; source tests and Dataverse API
reads cannot substitute for this acceptance.

The current verdict remains **NO-GO** until every live gate above passes.
