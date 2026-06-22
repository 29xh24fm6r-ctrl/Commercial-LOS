# Phase 204G — Live Admin Probe Gate Diagnostic (temporary)

## Why

204C–204F progressively fixed the admin probe (workspace-optional row shape →
access-level option-set → PlatformUser identity → active-gate alignment), yet Admin
Workspace may still not surface live. To stop guessing, this phase adds a
**temporary, read-only** diagnostic that prints the probe's **gate-by-gate**
outcome from real production data, so we can see the exact value that fails.

This phase changes **no authorization**, widens **no access**, performs **no
writes**, and adds **no schema**. It is intended to be removed once the live gate
failure is identified.

## What it shows

`loadAdminWorkspaceEntitlementDiagnostic(upn)` runs the **same query path** as the
real probe and returns sanitized detail:

- `platformUserFound`, `platformUserUsable`, `platformUserFullName`,
  `platformUserEmail` (the signed-in user's own identity — already shown in the app
  shell), `profileIdsCount`;
- `entitlementQuerySuccess`, `entitlementRowsReturned`;
- per returned row: `entitlementName`, `accessLevelRaw`, `accessLevelKind`,
  `active`, `workspaceName`, `losUserProfileName`, `hasAdminName`,
  `hasAdminWorkspace`, `identityMatched`, `identityMatchReason`
  (`profile-id | profile-label-upn | full-name-admin-prefix | upn-admin-prefix |
  none`), `finalEligible`;
- `finalResult` (`entitled | not-entitled | failed`) and `failureSummary`.

Each gate is recomputed from the **same pure helpers** the live probe uses
(`resolveAccessLevelKind`, `strictAdminEntitlementName`, `resolveWorkspaceRoute`,
`entitlementMeetsAdminGates`, `classifyCurrentUserIdentityMatch`), so the
diagnostic reflects the real decision rather than a parallel guess.

## Sanitization (no secrets, no GUIDs, no other identities)

- The raw `cr664_accesslevel` value is shown as text (an option-set number, not a
  secret); GUID lookups (`losUserProfileId`, `platformUserId`) are **never**
  surfaced.
- A row's `losUserProfileName` is shown only when it equals the **current user's
  own UPN**; any other identity is redacted to `«redacted-other-identity»`.
- A row's `entitlementName` is shown only when the row attributes to the current
  user; otherwise it is redacted.
- The signed-in user's own UPN and full name are shown because they already appear
  in the app shell (item 7).

## The card

`AdminEntitlementDiagnosticCard` ([src/admin](../src/admin/AdminEntitlementDiagnosticCard.tsx))
renders the diagnostic as a dashed read-only card titled **"Admin Entitlement
Diagnostic — temporary Phase 204G"**. It has **no buttons, no forms, no inputs, no
click/submit handlers** — it only reads and prints.

It is gated behind a single constant:

```ts
export const ADMIN_ENTITLEMENT_DIAGNOSTIC_ENABLED = true;
```

When the flag is off the component renders `null` and runs no probe.

### Composition & role isolation

The card is composed at the **workspace layer**
([src/workspaces/BankerWorkspace.tsx](../src/workspaces/BankerWorkspace.tsx)), not
inside `src/banker/`. Phase 48 forbids one role directory importing another
(`banker` → `admin`), so the card lives in `src/admin/` and is mounted by the
workspace route file, which is not a role directory. This keeps cross-role
isolation intact while showing the card inside the Banker Workspace.

## Not changed

The authorization path (`deriveHasAdminWorkspaceEntitlementForUser`,
`resolvePlatformUserUsableForAdminProbe`, the live `loadAdminWorkspaceEntitlement`)
is untouched. No owner-based authorization, no access widening, no operator email
hard-coded into app code.

## Verification

```bash
pnpm test
npm run build
git diff --check
git status --short
```
