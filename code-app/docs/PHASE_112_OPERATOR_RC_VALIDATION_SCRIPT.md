# Phase 112 — Operator Release-Candidate Validation Script

**Audience:** an admin or release-operator running this script in
the deployed environment after Phase 111 sealed the
release-candidate snapshot. **You are doing this as a human, on a
deployed build, in a real Power Platform environment.** The script
is intentionally concrete — every step has a "do this", an
"expected result", and a "fail if". Skipping steps is allowed only
when a step's "skip if" condition matches your environment.

> **Hard prerequisite: the app must be landed in a Microsoft
> Power Platform environment before this script can run.** The
> Phase 112 script is NOT executable against a local build alone;
> §A.1 ("confirm environment + tenant") and §B.1 ("app loads")
> both fail without a deployed Code App. Complete
> [Phase 113 — Microsoft Environment Landing Plan](PHASE_113_MICROSOFT_ENVIRONMENT_LANDING_PLAN.md)
> §G solo-operator sequence first. Phase 113 §G.7 is the explicit
> handoff into this script.

**Prerequisites:**
- Familiarity with the Phase 110 wording rule ("Outlook accepted"
  is connector acceptance, not borrower delivery confirmation —
  see [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md) §4).
- Access to the Power Platform environment hosting the deployed
  Code App.
- An admin / banker test identity that can sign in and reach the
  Admin and Banker workspaces.
- A non-borrower controlled test inbox (your own, or a diagnostic
  mailbox the bank manages). **Do NOT use a real borrower
  address.**
- A test deal in the deployed environment that the test banker
  identity is authorized to view + write.

**Time budget:** 30–45 minutes if every step passes on the first
try. Reserve longer if any step fails — you'll be capturing
evidence.

**If you have to stop mid-script:** capture the current step
number, the section letter, what you observed, and any error
text. Section H below has the evidence template.

---

## Section A — Pre-flight

### A.1 Confirm environment + tenant

**Do:** sign into the Power Platform admin center for the target
environment. Confirm:
- Environment name matches the release-candidate target.
- Tenant id matches the bank's expected Entra tenant.
- The Office 365 Outlook connector is registered in this
  environment AND the connection is owned by an account the Code
  App can reach.

**Expected:** environment + tenant + connector all match.
**Fail if:** any mismatch. Stop the script; record the mismatch
in §H.

### A.2 Confirm build deployed

**Do:** open the Code App's deployment record (e.g. in Power
Platform CLI or the maker portal). Note:
- Build version / commit hash.
- Deployment timestamp.
- Confirm the deployed bundle was produced from a `npm run build`
  that completed clean against the Phase 111 release-candidate
  commit or later.

**Expected:** the build is from the locked snapshot or a later
forward-compatible commit (no Phase 110 lock failure has been
overridden).
**Fail if:** the deployed build predates Phase 111 (counts will
not match the snapshot) or postdates a commit that broke any pin.
Stop the script.

### A.3 Confirm `VITE_EMAIL_MODE`

**Do:** in the deployed app, this is a build-time environment
variable. Confirm by checking either:
- The app's bundled config (if your deployment exposes it), OR
- The Phase 109 diagnostics card mode badge once you reach §D.

**Skip if:** you don't know the build-time value yet — §D.2 will
read it from the running app for you.

**Fail if:** `VITE_EMAIL_MODE` is `LIVE` but the connector
registration in §A.1 is not actually in place. That would mean
LIVE sends will fail in production. Stop the script.

### A.4 Confirm operator/admin user can access Admin Workspace

**Do:** sign into the Code App with the admin test identity.
Navigate to the Admin Workspace.

**Expected:** Admin Workspace renders with the standard card
stack (Release Readiness Gate at the top, ten cards in total
including the Phase 109 Outlook LIVE Email Diagnostics card).
**Fail if:** the workspace renders an unauthorized message, or
the card stack is missing cards.

### A.5 Confirm test recipient is non-borrower / controlled

**Do:** decide which address you will type into the smoke test
(§D.6) and the banker send flows (§E, §F). Write it down in §H.

**Expected:** the address is one of:
- Your own inbox.
- A diagnostic mailbox the bank manages.
- A teammate's inbox they have consented to receive a test.

**Fail if:** the only address you have available is a real
borrower's. Stop the script. Get a controlled test inbox before
proceeding.

---

## Section B — App launch and access posture

### B.1 App loads without a fallback dashboard

**Do:** from a fresh browser window, navigate to the Code App
URL. Sign in if prompted.

**Expected:** the app loads to the Banker Command Center (if your
identity maps to a banker), or the Admin Workspace (if it maps to
an admin), or the role-appropriate workspace.
**Fail if:** the app loads a "fallback" placeholder dashboard,
shows a generic "you do not have access" error, or shows a
permission-resolution screen that never resolves. Capture
console errors in §H.

### B.2 Workspace routing resolves

**Do:** confirm the URL or in-app surface settles on the
role-appropriate workspace within a few seconds (no infinite
spinners, no stuck loading state).

**Expected:** workspace rendered; deal-list / command-center
content visible.
**Fail if:** spinner never resolves, or the app keeps redirecting.

### B.3 Permission-before-render posture is visible

**Do:** if your identity is a banker, the app should have called
`loadDealForBanker` (or equivalent) before child cards mount.
Verify by:
- Opening a deal you ARE authorized to view → cards render.
- Trying to URL-hack to a deal you are NOT authorized to view →
  Access Denied surface renders.

**Expected:** authorized deal renders; unauthorized deal shows
Access Denied.
**Fail if:** unauthorized deal renders any content beyond Access
Denied. Stop the script; this is a workspace-isolation regression.

### B.4 Unauthorized surfaces are absent or blocked honestly

**Do:** confirm these surfaces are absent or properly blocked for
your identity:
- Executive `/deals/:id` drill-through — should be Access Denied
  (Phase 15 snapshot-only invariant).
- Admin `/deals/:id` drill-through — should be Access Denied
  (governance non-goal).
- Borrower-facing pages — should NOT exist. URL-hack a guess
  like `/borrower/<some-id>` or `/portal` — should be a 404 /
  not-found / no-such-route, NOT a render.

**Expected:** every unauthorized URL is honestly blocked.
**Fail if:** any borrower-portal-shaped surface renders. That
would be a Phase 65 / Phase 110 lock regression — stop the
script.

---

## Section C — Release readiness / inventory

### C.1 Open the Release Readiness Gate

**Do:** sign in as the admin identity; navigate to the Admin
Workspace; scroll to **Release Readiness Gate** (the topmost
card).

**Expected:** the gate renders with an overall badge and a list
of category rows.

### C.2 Read the overall badge

**Expected:** the overall badge reads either *"Cannot fully
verify — signals not wired"* (acceptable when no blocker fires)
OR shows the expected **Blocked** state for **Stage progression
readiness** + the expected **Not Wired** state for **Test
coverage / build verification**.

**Fail if:** the overall badge reads "Critical alerts" or shows
an unexpected blocker. Capture which row is unexpected in §H.

### C.3 Verify Phase 111 counts in the Capability Inventory section

**Do:** scroll past the gate's category rows to the **Capability
Inventory (read-only)** section. Confirm the four group counts:

- **Governed writes** count is **12**.
- **Local-only flows** count is **16**.
- **Not wired** count is **8**.
- **Deliberately blocked** count is **1**.

**Expected:** counts match the Phase 111 snapshot
([PHASE_111_RELEASE_CANDIDATE_SNAPSHOT.md](PHASE_111_RELEASE_CANDIDATE_SNAPSHOT.md)
§0).
**Fail if:** any count differs. The deployed build is not the
Phase 111-anchored build OR the inventory data has drifted. Stop
the script; record which count drifted in §H.

### C.4 Verify `NOT_WIRED.email-delivery` is absent

**Do:** scan the **Not wired** group on the gate. Look for a row
labeled "Borrower update email delivery (Outlook/Graph)" or any
row whose label contains "email delivery".

**Expected:** NO such row exists. The Phase 105 swap retired it.
**Fail if:** any "email delivery" row appears. The deployed build
is missing Phase 105 — stop the script.

### C.5 Verify the borrower-portal / automation / inbound / portal-messaging gaps remain honestly blocked

**Do:** in the **Not wired** group, find and read:
- **Borrower portal (external-user-facing)** — `compound` blocker.
  Read the reason text. It should mention Phase 104 + Phase 105
  + "no automation" + "no scheduled trigger" + "no event-driven
  push" + "no inbound-mail sync".

**Expected:** the row is present, its blocker kind is compound,
and the reason text honestly acknowledges the closed lanes
without claiming the open gaps are closed.
**Fail if:** the borrower-portal row is missing OR its reason
text claims automation / inbound / portal messaging are now
available. Stop the script.

### C.6 Verify Phase 101 summary handoffs remain local / copy-to-clipboard

**Do:** in the **Local-only flows** group, find:
- **Microsoft Outlook summary copy / mailto handoff** (Phase
  101).
- **Microsoft Teams relationship-memory copy handoff** (Phase
  100).
- **Microsoft Teams activity-timeline copy handoff** (Phase 99).
- **Microsoft Teams morning-catch-up copy handoff** (Phase 98).
- **Microsoft Teams deal-summary copy handoff** (Phase 96).
- **Microsoft Teams chat handoff** (Phase 86).

**Expected:** all six rows present, all carrying the
**Local-only · no Dataverse write** pin. Read the Phase 101
note's last sentence — it must explicitly say "copy-to-clipboard
regardless of EMAIL_MODE".
**Fail if:** any handoff row is missing the local-only pin OR
the Phase 101 note no longer says "regardless of EMAIL_MODE".

---

## Section D — Admin email diagnostics (Phase 109 card)

### D.1 Open the card

**Do:** still in the Admin Workspace, scroll to the **Outlook
LIVE Email Diagnostics** card (between Stage Governance
Diagnostics and Performance Diagnostics).

**Expected:** card renders with a header, a mode badge, three
status rows, an "Outlook accepted is connector acceptance" warning
banner, and an operator-only smoke-test form (with a clearly
disabled Run button by default).

### D.2 Verify the mode badge

**Do:** read the mode badge in the card header. It will read
either `Mode: DRY_RUN` or `Mode: LIVE`.

**Expected:** badge value matches the deployment's actual
`VITE_EMAIL_MODE`. Record the value in §H.A.3.

### D.3 Verify both governed-write paths show "Code-available"

**Do:** read the three status rows:
- **Document-request email LIVE path** → status badge:
  "Code-available".
- **Borrower-update email LIVE path** → status badge:
  "Code-available".
- **Phase 101 summary handoffs** → status badge:
  "Copy-to-clipboard".

**Expected:** all three statuses match.
**Fail if:** any LIVE path shows something other than
"Code-available" OR the Phase 101 row shows anything other than
"Copy-to-clipboard". Stop the script.

### D.4 Verify the "Outlook accepted" warning is present

**Do:** read the warning paragraph above the smoke-test form.

**Expected:** the literal sentence:
> **"Outlook accepted" is connector acceptance, not borrower
> delivery confirmation.** A successful smoke test means the
> connector took the request for handoff. It does NOT prove the
> test recipient received the message. Read the actual test
> inbox to verify receipt.

**Fail if:** the warning is missing, or any forbidden phrase
appears in the card ("delivered", "email sent", "email
delivered", "sent successfully", "borrower was notified").

### D.5 Smoke test — verify the Run button starts disabled

**Do:** look at the smoke-test form. The "Test recipient email"
input is empty by default. The "Run smoke test" button is
disabled by default.

**Expected:** disabled until you type into the recipient field.
**Fail if:** the button is enabled with an empty recipient.

### D.6 Smoke test — type a controlled test recipient

**Do:** type the controlled test recipient from §A.5 into the
"Test recipient email" input.

**Expected:** the Run button becomes enabled.

### D.7 Smoke test — click Run smoke test

**Do:** click **Run smoke test**. Watch the button label.

**Expected:**
- Button label switches to "Running smoke test…" while the helper
  is in flight.
- After it resolves, the outcome panel renders below the form.

### D.8 Smoke test — verify outcome language

**Do:** read the outcome panel header. Match against the table:

| Outcome panel header | Outcome kind | What to do |
| --- | --- | --- |
| "Connector accepted the smoke message" | `accepted` | Continue. Verify the test inbox (§D.9). |
| "Invalid input — smoke test not run" | `invalid-input` | Fix the recipient and retry §D.6. |
| "Transient failure (mode: LIVE)" | `transient-failure` | Retry once. If it fails twice, capture in §H and continue. |
| "Permanent failure (mode: LIVE)" | `permanent-failure` | Stop the script. Capture the reason text in §H. |
| "Unknown error" | `unknown` | Capture the message in §H. Stop the script. |

**Expected:** the outcome reads one of the five exact headers
above. None of them contains "delivered" or "sent successfully".
**Fail if:** the outcome panel uses any forbidden vocabulary
(see §D.4 list). Stop the script.

### D.9 Smoke test — verify the test inbox actually received the message

**Skip if:** smoke test outcome was anything other than
"Connector accepted" — there's nothing in the inbox to verify.

**Do:** open the controlled test inbox from §A.5. Find the most
recent message with subject **"OGB LOS Outlook smoke test"**.
Confirm:
- Subject matches exactly.
- Body identifies the message as a smoke test from "Old Glory
  Bank Loan Origination System".
- Body does NOT mention any deal, borrower, or workflow context.
- Body ends with "— OGB LOS Admin Diagnostics".

**Expected:** the message arrived and matches the hardcoded
template.
**Fail if:** "Connector accepted" said the connector took the
request, but nothing arrived after a few minutes. This is the
*acceptance is not delivery confirmation* case — capture in §H.
Stop the script; this is a transport / permission / delivery-
policy issue outside the app and must be resolved before
promotion.

---

## Section E — Banker document-request email flow

### E.1 Sign in as the banker test identity

**Do:** sign out of the admin identity; sign in as the banker
test identity. Navigate to the test deal from §A.5 (record the
deal id in §H).

**Expected:** the Banker Deal Workspace renders for the test
deal.

### E.2 Open the Deal Documents card

**Do:** scroll to **Deal Documents**. Pick a document row in the
**Outstanding** group (one that has not yet been requested OR
one you can re-request without confusing the workflow).

**Expected:** the document row is visible with a **Request**
action affordance.

### E.3 Open the Request Document modal

**Do:** click the **Request** affordance for that document.

**Expected:** the Request Document modal opens with:
- A mode badge (`Mode: DRY_RUN` or `Mode: LIVE`) matching §D.2.
- A subject + body field pre-filled with the document name.
- A recipient field (empty by default).
- A Send affordance (disabled until the recipient is valid).
- A HANDOFF affordance (Phase 63 — opens the banker's own
  Outlook).

### E.4 Type the controlled test recipient

**Do:** type the controlled test recipient from §A.5 into the
recipient field.

**Expected:** the Send affordance becomes enabled.

### E.5 Send the request

**Do:** click **Send** (not the HANDOFF / Copy option).

**Expected:** the modal renders an outcome panel after a moment.

### E.6 Verify the outcome language

**Do:** read the outcome panel.

**Expected:** the panel header reads "Outlook accepted document
request to b\*\*\*@\<masked\>" (or the modal's success copy
contains the literal phrase "Outlook accepted").
**Fail if:** the panel says "delivered", "email sent", "email
delivered", "borrower was notified", or "sent successfully".
Stop the script and capture in §H.

### E.7 Close the modal; verify the activity ledger refreshed

**Do:** close the modal. Scroll to **Borrower Communication**.

**Expected:** a new row appeared at the top with:
- Title: "Document request: \<document name\>".
- Event-type badge: **EmailLogged**.
- Summary: "Outlook accepted document request to b\*\*\*@\<masked\>."
  (LIVE) OR "Document request prepared for ... Mode: DRY_RUN;
  nothing left the client." (DRY_RUN).
- Time: recent (just now / a few seconds ago).
- Actor: your banker identity.

**Fail if:** no new row appeared (refresh wiring is broken), OR
the title doesn't begin with "Document request:", OR the badge
is wrong, OR the summary uses forbidden vocabulary. Capture in
§H.

### E.8 Verify the audit row landed (admin diagnostic)

**Skip if:** you don't have admin access in this environment.

**Do:** sign back into the admin identity in a new browser tab.
Open the **Audit Anomalies** card on the Admin Workspace and
look for anomalous behavior. Optionally check the Configuration
Overview or use Power Platform admin tooling to spot the new
`cr664_AuditEvent` row with name "DocumentRequest Outlook Send".

**Expected:** one new audit row, with:
- `cr664_auditeventname` = `'DocumentRequest Outlook Send'`.
- `cr664_notes` contains the FULL controlled test recipient + the
  subject.
- `cr664_correlationid` matches the timeline row's
  `cr664_eventsubtype` field (looking for `correlation:<uuid>`).

**Fail if:** the audit row is missing, OR its notes contain the
recipient in MASKED form (privacy invariant broken — the audit
row carries the full recipient; only the timeline uses the
masked form).

### E.9 Verify no delivery claim anywhere

**Do:** read the entire Borrower Communication card, the modal
outcome panel, and (if you checked it in §E.8) the audit-row
notes. Search for the words: `delivered`, `email sent`, `email
delivered`, `borrower was notified`, `sent successfully`.

**Expected:** none of these phrases appear.
**Fail if:** any appears. Stop the script. The Phase 110 wording
lock has been bypassed — capture the surface in §H.

---

## Section F — Banker borrower-update email flow

### F.1 Open the Draft Borrower Update modal

**Do:** still on the banker test deal, scroll to **Borrower
Communication**. Click **Draft Borrower Update**.

**Expected:** the modal opens with:
- Mode badge matching §D.2.
- A template selector with four options (General Status Update,
  Missing Documents Reminder, Underwriting Update, Closing
  Progress Update).
- A subject + body field pre-filled from the chosen template.
- A recipient field (empty by default).
- A "Banker note / reason for this update" field (required).
- A Copy draft button.
- A Send button (only when the parent is wired with
  `onSendEmail`; this is the Phase 105 enabled state).

### F.2 Verify the Copy path still works

**Do:** type a non-empty banker note into the "Banker note /
reason for this update" field. Leave the recipient blank. Click
**Copy draft**.

**Expected:** the modal renders a "Copied to clipboard" outcome.
Open a scratch text editor and paste — the clipboard contains
`Subject: ...\n\n<body>`. No Dataverse write, no audit row, no
timeline row was emitted (Copy is the local-only Phase 23 path).
**Fail if:** Copy is missing, or the modal claims a Send happened.

### F.3 Type the controlled test recipient

**Do:** type the controlled test recipient from §A.5 into the
recipient field. The banker note from §F.2 is still in place.

**Expected:** the Send button becomes enabled.

### F.4 Send the borrower update

**Do:** click **Send** (not Copy).

**Expected:** the button label switches to "Sending…" while the
action is in flight, then the outcome panel renders.

### F.5 Verify the outcome language

**Do:** read the outcome panel header.

**Expected:** the header reads "Outlook accepted borrower update
to b\*\*\*@\<masked\>" in LIVE mode, OR "DRY_RUN: borrower update
prepared for b\*\*\*@\<masked\>" in DRY_RUN mode.
**Fail if:** the panel uses any forbidden vocabulary. Capture in
§H. Stop the script.

### F.6 Verify the BorrowerUpdateSent row appears after close

**Do:** close the modal. Look at the Borrower Communication card.

**Expected:** a new row appears immediately at the top with:
- Title: **"Borrower update"** (exactly this — no document name
  suffix).
- Event-type badge: **BorrowerUpdateSent** (not EmailLogged —
  this is the schema-designer-reserved enum 788190014 that
  Phase 105 honors).
- Summary: "Outlook accepted borrower update to b\*\*\*@\<masked\>."
  (LIVE) OR "Borrower update prepared for ... Mode: DRY_RUN;
  nothing left the client." (DRY_RUN).
- Time: just now.

**Fail if:** the badge says `EmailLogged` (Phase 105 timeline-
event-type pin broken), OR the row doesn't appear (Phase 108
refresh wiring broken). Capture in §H.

### F.7 Verify masked recipient on the timeline

**Do:** in the Borrower Communication card, look at the new row's
summary text.

**Expected:** the recipient appears in MASKED form (`b***@e***.com`
or similar — first character + asterisks).
**Fail if:** the full controlled test recipient appears verbatim
on the timeline. Privacy invariant broken; stop the script.

### F.8 Verify no delivery claim

**Do:** re-read the Borrower Communication card + the modal
outcome (still open in your screen-record, or reopen the modal
briefly).

**Expected:** none of the forbidden phrases from §E.9 appear.
**Fail if:** any appears. Stop the script.

---

## Section G — Negative checks

### G.1 Missing recipient blocks Send

**Do:** open either modal (Request Document OR Draft Borrower
Update). Type a banker note (Draft Borrower Update only). Leave
the recipient field blank.

**Expected:** the Send button is **disabled**. Clicking it does
nothing. The action helper is not invoked.
**Fail if:** Send is enabled with an empty recipient. Stop the
script.

### G.2 Malformed recipient blocks Send

**Do:** type something obviously not an email into the recipient
field (e.g. `not-an-email`).

**Expected:** the Send button stays **disabled** (the
`isLikelyValidEmail` shape check rejects it before any network
call slot is consumed).
**Fail if:** Send is enabled. Stop the script.

### G.3 Read-only / unauthorized user cannot send

**Do:** sign out. Sign in as a manager identity (or any role
that is read-only on the deal). Navigate to the same test deal.

**Expected:**
- Manager workspace renders the deal in read-only mode (Phase 36
  invariant).
- The Borrower Communication card has NO **Draft Borrower
  Update** button (Phase 36 `readOnly` mode).
- The Deal Documents card has NO **Request** affordance on
  Outstanding rows.
**Fail if:** any write affordance is visible. Stop the script;
write-scoping is broken.

### G.4 Phase 101 summary handoffs do not send email

**Do:** sign back in as the banker. Navigate to the Banker
Command Center (NOT the deal workspace). Find the **Banker
Morning Catch-Up** card.

**Do:** click any "Open in Outlook" or "Copy email" button on a
Phase 101 surface.

**Expected:**
- "Open in Outlook" sets `window.location.href` to a `mailto:`
  URL → opens your default mail client. No `SendEmailV2` call
  fires. No audit row is created. No timeline row is created.
- "Copy email" writes a clipboard payload (Subject + body). Same:
  no Send, no audit, no timeline.

**Fail if:** the click causes a "Outlook accepted" outcome panel
(that would mean the summary surface now calls the connector —
Phase 110 lock regression). Stop the script.

### G.5 Borrower portal is not presented as available

**Do:** scan the entire app's navigation and any card affordances
visible to your banker identity. Search for the words "borrower
portal", "borrower invitation", "magic link", "external user".

**Expected:** no such words appear in any operator-facing
surface. The Admin Workspace's Release Readiness Gate
Capability Inventory does mention `NOT_WIRED.borrower-portal` —
that's correct because it's documenting that the surface DOESN'T
exist.
**Fail if:** any banker / manager / team / executive surface
suggests a borrower portal exists, accepts borrower
invitations, or generates magic links. Stop the script.

### G.6 No automation / inbound / delivery-tracking UI appears

**Do:** scan the app for any of:
- A "schedule reminder" / "automated send" affordance.
- A "delivery confirmed" / "read receipt" indicator.
- An inbound-mail listing / borrower-reply feed.
- A subscription / webhook management UI.

**Expected:** none of these surfaces exist anywhere in the app.
The Phase 110 lock forbids them at CI; this is the human spot-
check that they did not silently appear post-deployment.
**Fail if:** any of these surfaces appears.

---

## Section H — Evidence capture template

Capture the following for the release-candidate evidence record.
This goes into the operator's promotion package alongside the
green CI run.

```
RELEASE-CANDIDATE VALIDATION RECORD
====================================
Operator name:           ____________________
Operator role:           [admin | banker | other: ________ ]
Date / time (UTC):       ____________________
Environment:             ____________________
Tenant id:               ____________________
Build version / commit:  ____________________
VITE_EMAIL_MODE:         [DRY_RUN | LIVE]

Test inputs
-----------
Test deal id:            ____________________
Smoke-test recipient:    ____________________
(non-borrower, controlled inbox? yes/no:   ____ )

Section results (one of: PASS, FAIL, SKIP-with-reason)
------------------------------------------------------
A.1 Environment + tenant:                ____________________
A.2 Build deployed:                      ____________________
A.3 VITE_EMAIL_MODE confirmed:           ____________________
A.4 Admin Workspace accessible:          ____________________
A.5 Test recipient confirmed:            ____________________

B.1 App loads without fallback:          ____________________
B.2 Workspace routing resolves:          ____________________
B.3 Permission-before-render visible:    ____________________
B.4 Unauthorized surfaces blocked:       ____________________

C.1 Release Readiness Gate opened:       ____________________
C.2 Overall badge state:                 ____________________
C.3 Phase 111 counts match:              ____________________
    (GOVERNED_WRITES=__, LOCAL_ONLY=__, NOT_WIRED=__, DB=__)
C.4 NOT_WIRED.email-delivery absent:     ____________________
C.5 Borrower-portal blockers honest:     ____________________
C.6 Phase 101 handoffs local-only:       ____________________

D.1 Diagnostics card opens:              ____________________
D.2 Mode badge value:                    [DRY_RUN | LIVE]
D.3 Status rows show expected states:    ____________________
D.4 Warning paragraph present verbatim:  ____________________
D.5 Run button disabled by default:      ____________________
D.6 Recipient typed:                     ____________________
D.7 Run smoke test clicked:              ____________________
D.8 Outcome panel header:                ____________________
D.9 Test inbox actually received:        [yes | no | skipped]

E.1 Banker workspace opened on test deal: ___________________
E.2 Deal Documents card visible:         ____________________
E.3 Request Document modal opened:       ____________________
E.4 Recipient typed:                     ____________________
E.5 Send clicked:                        ____________________
E.6 Outcome wording PASS:                ____________________
E.7 Activity ledger row appeared:        ____________________
E.8 Audit row contains full recipient:   ____________________
E.9 No delivery claim observed:          ____________________

F.1 Draft Borrower Update modal opened:  ____________________
F.2 Copy path still works:               ____________________
F.3 Recipient typed:                     ____________________
F.4 Send clicked:                        ____________________
F.5 Outcome wording PASS:                ____________________
F.6 BorrowerUpdateSent badge correct:    ____________________
F.7 Masked recipient on timeline:        ____________________
F.8 No delivery claim observed:          ____________________

G.1 Missing recipient blocks Send:       ____________________
G.2 Malformed recipient blocks Send:     ____________________
G.3 Read-only role cannot send:          ____________________
G.4 Phase 101 handoffs do not send:      ____________________
G.5 No borrower-portal surface:          ____________________
G.6 No automation / inbound / tracking:  ____________________

Screenshots / observations
--------------------------
(attach screenshots of: Release Readiness Gate, EmailLiveDiagnostics
card after smoke test, Borrower Communication card after each send
flow, any failure surface)

Overall outcome
---------------
[PASS — promote] [FAIL — do not promote] [PARTIAL — promote with caveat]

Caveats / environment-specific failures
---------------------------------------
(list any §H rows marked FAIL with a one-line root-cause statement
and a follow-up owner / phase candidate)

Signed off by:           ____________________
Date:                    ____________________
```

---

## Section I — Failure handling

If any step says "stop the script" and you DID stop:

1. Do NOT promote the build to production. The release-candidate
   has not passed validation.
2. Capture the §H record up to the point of failure.
3. File the failure against the relevant phase doc:
   - Inventory count drift → Phase 111 doc + governance pin.
   - Communication-lane wording / payload drift → Phase 110
     release-lock test file.
   - Phase 101 handoff surface drift → Phase 106 release-readiness
     test file.
   - Modal layer breach → Phase 110 lock Block 3.
   - Smoke test outcome problem → Phase 109 helper test file.
   - Borrower-portal surface appearance → Phase 65 deferral doc.
4. If the failure is environmental (connector permissions, test
   inbox not receiving, tenant misconfiguration), capture the
   evidence and pass it to whoever owns the upstream environment
   — the app code itself may be fine.
5. Re-run this script after the underlying issue is resolved.

---

## Section J — What this script does NOT validate

- **Performance.** This is a correctness + boundary-honesty script.
  Performance regressions need their own validation (Phase 31
  observability or external load testing).
- **Bundle size.** The Phase 111 snapshot cites approximate sizes;
  this script does not check them. If you need a fresh measurement
  run `npm run build` against the deployed commit.
- **Schema migrations.** This script assumes the Dataverse schema
  is at the expected state. Schema validation belongs in the
  release-prep pipeline.
- **Cross-tenant / regulatory review.** This script validates the
  app's behavior; it does not replace bank legal / compliance
  sign-off.
- **Other lanes.** This script focuses on the Phase 104–110
  communication lane and the Phase 111 inventory snapshot. It does
  NOT exhaustively validate Lane C (uploads), Lane D (portal),
  Lane E (Teams), Lane F (AI), or Lane G (schema additions) —
  those lanes are still blocked at the upstream layer and have no
  in-repo validation surface to exercise.

---

## Section K — Cross-references

- [PHASE_104_OUTLOOK_LIVE_SEND.md](PHASE_104_OUTLOOK_LIVE_SEND.md) — document-request LIVE swap (covers §E behavior).
- [PHASE_105_BORROWER_UPDATE_LIVE_SEND.md](PHASE_105_BORROWER_UPDATE_LIVE_SEND.md) — borrower-update LIVE swap (covers §F behavior).
- [PHASE_106_EMAIL_MODE_RELEASE_READINESS.md](PHASE_106_EMAIL_MODE_RELEASE_READINESS.md) — operator promotion checklist this script supplements.
- [PHASE_107_COMMUNICATION_ACTIVITY_LEDGER.md](PHASE_107_COMMUNICATION_ACTIVITY_LEDGER.md) — activity-evidence shape this script verifies in §E.7 / §F.6.
- [PHASE_108_BORROWER_UPDATE_REFRESH.md](PHASE_108_BORROWER_UPDATE_REFRESH.md) — refresh wiring this script verifies in §F.6.
- [PHASE_109_EMAIL_LIVE_SMOKE_TEST.md](PHASE_109_EMAIL_LIVE_SMOKE_TEST.md) — smoke-test helper this script uses in §D.
- [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md) — wording rules + out-of-scope list this script enforces.
- [PHASE_111_RELEASE_CANDIDATE_SNAPSHOT.md](PHASE_111_RELEASE_CANDIDATE_SNAPSHOT.md) — inventory snapshot this script's §C verifies.
