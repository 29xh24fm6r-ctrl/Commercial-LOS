# Production Data Remediation Evidence — 2026-07-29

Status: **APPLIED AND VERIFIED — OVERALL VERDICT REMAINS NO-GO**

This report records the approval-gated production data remediation executed
against `https://org3a57b8d4.crm.dynamics.com` on 2026-07-29. It does not claim
deployment, end-to-end acceptance, byte-level file persistence, or independent
multi-user certification.

## Authorization and controls

Matthew approved all work after reviewing the record-level mutation manifest.
The applied manifest was:

- committed source:
  `docs/governance/PROPOSED_PRODUCTION_DATA_MUTATION_2026-07-29.json`
- approved manifest SHA-256:
  `895b31c79b15e616f5765f252012f582ed923bf5cef73245cdef6b1d6cb5656d`
- operator: `mpaller@oldglorybank.com`
- organization:
  `https://org3a57b8d4.crm.dynamics.com`

Every PATCH used the previously observed ETag, was read back from Dataverse,
and matched the approved values. The apply script contains no delete or merge
operation. The access token remained process-local and was cleared after use.

## Applied and verified record changes

| Entity | Record ID | Approved correction | Verified readback |
|---|---|---|---|
| Loan deal | `e262b023-5a8b-f111-ab10-70a8a59b1fe2` | Set `cr664_istestrecord` to `true` | `true` |
| Loan deal | `00404e2f-5d71-f111-ab0d-70a8a59be491` | Deactivate empty, unlinked duplicate | `statecode=1`, `statuscode=2` |
| Loan deal | `b06c5dcd-8e74-f111-ab0f-70a8a59be491` | Deactivate empty, unlinked duplicate | `statecode=1`, `statuscode=2` |
| Workspace entitlement | `792f17d4-ef9b-431a-9d3b-a718be1c8b35` | Deactivate later physical duplicate | `statecode=1`, `statuscode=2` |

The retained OmniCare deal is
`70dc1d05-8f74-f111-ab0f-70a8a59be491`; it is linked and had later business
activity. The retained entitlement is
`fc62592c-d47e-40e9-972b-c58c618427d0`; it was the earlier identical grant.

Sanitized local apply evidence SHA-256:
`381a14a899a31b2a71fd1d9ef9630db285ae3657a03261a23d9044b1399eea56`.

## Before and after reconciliation

| Population | Before | After | Result |
|---|---:|---:|---|
| Active deals | 25 | 23 | Two approved empty/unlinked duplicates deactivated |
| Governed operational deals | 15 | 13 | Same two duplicate operational rows removed |
| Open tasks | 16 | 16 | Retained; every task belongs to a controlled parent |
| Active CRM organizations | 4 | 4 | Three controlled organizations retained and governed out of operational defaults |
| Active entitlements | 10 | 9 | Later duplicate grant deactivated |
| Active boarded loans | 1 | 1 | Retained; authoritative completion values still required |
| Active document checklist rows | 24 | 24 | No metadata/file inconsistency found by the read-only inventory |
| Active credit memos | 8 | 8 | Two controlled-test final-content inconsistencies retained for governed review |

Pre-apply inventory SHA-256:
`5451cfc33e79f48f0942fbd2773ecc1cc30fda43bffbb809ccfd3aca188313b6`.

Post-apply inventory SHA-256:
`6c07c83fe69f158066f275f6bdfdf1dda3e3593bcd5a962829f5302812bb56de`.

The post-apply inventory reduced findings from ten to seven. The controlled
classification conflict, duplicate-deal cluster, and duplicate-entitlement
finding closed.

## Retained findings and required disposition

1. Sixteen open tasks remain on five controlled parent deals. They are retained
   as controlled test evidence and excluded from operational queues by parent
   classification. Closing or reassigning them requires a separate business
   disposition; it is not necessary to reconcile operational task totals.
2. Three controlled CRM organizations remain. They are retained and excluded
   from operational CRM and New Deal populations through the governed client
   classifier. They are not deleted or represented as customer organizations.
3. Boarded loan `2b55128b-5376-f111-ab0f-70a8a59be491` lacks servicing owner,
   loan status, and risk rating. These values must come from an authoritative
   servicing or core source; no value was synthesized.
4. Credit memo records `55bf05ba-6f88-f111-ab10-70a8a59b1fe2` and
   `2d59cf59-5f8b-f111-ab10-70a8a59b1fe2` have final status paired with draft
   naming/content. Both belong to controlled test deals. The immutable
   historical artifacts were not rewritten; any correction must be a governed
   new version after review.

## Certification boundary

This evidence closes the approved record-classification and duplicate
remediation gate. It does not close:

- production deployment of the remediation release;
- managed-Edge single-user acceptance;
- live byte upload/download and SHA-256 proof;
- finalized memo creation/readback on the deployed release;
- authoritative completion of the boarded-loan record;
- retention-policy confirmation; or
- independent requester, approver, funder, and boarder certification with
  distinct live identities and MFA.

Until those gates pass, the production verdict remains **NO-GO**.
