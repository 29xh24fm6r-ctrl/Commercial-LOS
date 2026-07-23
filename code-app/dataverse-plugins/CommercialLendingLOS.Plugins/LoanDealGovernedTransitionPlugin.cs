using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace CommercialLendingLOS.Plugins
{
    /// <summary>
    /// Platform-Enforced Credit Workflow Governance (2026-07-21).
    ///
    /// SUPERSEDES LoanDealStageAuthorityPlugin (deleted in this same change) -- that plugin enforced
    /// only the CREDIT_APPROVAL -&gt; COMMITMENT approval-authority rule. This plugin enforces the FULL
    /// canonical transition policy from
    /// docs/governance/CANONICAL_TRANSITION_POLICY_CONTRACT.md, which is the single ratified source
    /// of truth this file is hand-ported from. If this file and that document ever disagree, the
    /// document is correct and this file has drifted -- fix the file.
    ///
    /// NOT COMPILED, REGISTERED, OR DEPLOYED in the session that authored this file -- no `dotnet`
    /// SDK, no Power Platform CLI, no Dataverse credentials were available. Reviewed by inspection
    /// for correctness against the TypeScript sources it mirrors, not verified by a compiler or a
    /// live registration at that time.
    ///
    /// UPDATE (2026-07-23, final-seven-workstreams Workstream 1): a `dotnet` SDK became available;
    /// this file now compiles cleanly (`dotnet build -c Release`, 0 warnings/0 errors) and is
    /// covered by a real xUnit suite (`../CommercialLendingLOS.Plugins.Tests/`, 41 tests) that
    /// exercises Execute() against a hand-rolled in-memory Dataverse fake. That pass found and fixed
    /// two real gaps in ResolveStage/ResolveStatusCode and the status-only branch (see their inline
    /// comments) -- both now fail closed instead of throwing a raw platform exception or silently
    /// allowing an unresolvable status through. Registration against a live org is STILL not done --
    /// that remains a live Dataverse admin action. See PLUGIN_DEPLOYMENT.md and
    /// docs/operator-runbooks/DATAVERSE_GOVERNANCE_PLUGIN_DEPLOYMENT.md before trusting this in
    /// production.
    ///
    /// ARCHITECTURE (see docs/governance/ADR_001_PLATFORM_ENFORCED_CREDIT_WORKFLOW_GOVERNANCE.md):
    /// registered TWICE, sharing this one Execute method:
    ///   - Stage 10 (Pre-validation) -- runs BEFORE the platform's database transaction begins. On a
    ///     REJECTED transition, writes a `cr664_auditevents` row (outcome = Blocked) THEN throws. That
    ///     audit write survives the throw because stage 10 is not part of the transaction the throw
    ///     aborts -- this is the mechanism that gives rejected attempts a durable, queryable audit
    ///     trail (requirement 6), not an exotic workaround.
    ///   - Stage 20 (Pre-operation) -- runs INSIDE the same transaction as the actual write, against
    ///     the FRESHEST pre-image. This is the authoritative, race-safe gate (see
    ///     docs/governance/CONCURRENCY_PROTECTION.md) -- a stale client's transition is re-validated
    ///     against the record's true current state and rejected if no longer legal. Does NOT attempt
    ///     an audit write on rejection (it would roll back with everything else); relies on stage 10
    ///     having already logged the overwhelming majority of rejections. See the ADR's accepted
    ///     residual-gap note for the narrow race window this does not cover.
    ///
    /// KEPT IN SYNC BY HAND with src/workflow/canonicalStageTransition.ts, src/workflow/
    /// stageOrderingContract.ts, src/workflow/statusReferenceContract.ts, and src/workflow/
    /// creditApprovalAuthority.ts -- there is no shared runtime across the TypeScript/C# boundary.
    /// src/workflow/governancePluginParityFixture.test.ts pins the literal values this file hardcodes
    /// against those canonical TypeScript sources; if that test fails, this file (or its live-deployed
    /// twin) has drifted from the ratified policy.
    /// </summary>
    public class LoanDealGovernedTransitionPlugin : IPlugin
    {
        // ---------------------------------------------------------------------------------------
        // Schema constants -- mirrors src/workflow/stageOrderingContract.ts, statusReferenceContract.ts,
        // src/deals/governedTransitionReasonSchema.ts. TODO CONFIRM against the live org before
        // registering (see PLUGIN_DEPLOYMENT.md) -- these were cross-checked against this repo's own
        // generated models, not against a live schema browse.
        // ---------------------------------------------------------------------------------------

        private const string LoanDealEntity = "cr664_loandeal";
        private const string StageReferenceAttribute = "cr664_stagereference";
        private const string StatusReferenceAttribute = "cr664_statusreference";
        private const string AmountAttribute = "cr664_amount";
        // Governance initiative reason column -- see governedTransitionReasonSchema.ts. Read
        // defensively (Contains check) so this plugin does not hard-fail before the column exists;
        // until it is provisioned, reason presence simply cannot be verified server-side (fails
        // closed to "cannot verify" -&gt; blocked, per the REQUIRE_REASON_FIELD_TO_ENFORCE toggle below).
        private const string GovernedActionReasonAttribute = "cr664_governedactionreason";

        private const string StageReferenceEntity = "cr664_dealstagereferences";
        private const string StageCodeAttribute = "cr664_code";
        private const string StageSequenceAttribute = "cr664_sequence";
        private const string StageActiveFlagAttribute = "cr664_activeflag";

        private const string StatusReferenceEntity = "cr664_dealstatusreferences";
        private const string StatusCodeAttribute = "cr664_code";
        private const string StatusActiveFlagAttribute = "cr664_activeflag";

        // The 7 canonical stage codes, in ratified order -- mirrors stageOrderingContract.ts's
        // CANONICAL_STAGE_CODES exactly. The live ORDER for adjacency comes from the seeded
        // cr664_sequence values (never from this array's order), matching the TS contract.
        private static readonly string[] CanonicalStageCodes =
        {
            "INTAKE", "UNDERWRITING", "CREDIT_APPROVAL", "COMMITMENT", "DOCUMENTATION", "CLOSING_FUNDING", "BOARDED",
        };

        private const string CreditApprovalCode = "CREDIT_APPROVAL";
        private const string CommitmentCode = "COMMITMENT";
        private const string BoardedCode = "BOARDED";

        // Mirrors canonicalStageTransition.ts's DealStatusCode / TERMINAL_STATUSES exactly.
        private const string StatusOpen = "OPEN";
        private const string StatusOnHold = "ON_HOLD";
        private const string StatusDeclined = "DECLINED";
        private const string StatusWithdrawn = "WITHDRAWN";
        private const string StatusBoarded = "BOARDED";
        private static readonly HashSet<string> TerminalStatuses = new HashSet<string>
        {
            StatusDeclined, StatusWithdrawn, StatusBoarded,
        };

        private const string BankerEntity = "cr664_banker";
        private const string BankerEmailAttribute = "cr664_email";
        private const string ApprovalLimitAttribute = "cr664_approvallimit";
        private const string CreditCommitteeMemberAttribute = "cr664_creditcommitteemember";
        private const string ApprovalOverrideAuthorityAttribute = "cr664_approvaloverrideauthority";

        private const string LoanRequestProfileEntity = "cr664_loanrequestprofile";
        private const string LoanRequestProfileRequestedAmountAttribute = "cr664_requestedamount";
        // Verified live (per the plugin this supersedes): cr664_loanrequestprofile.cr664_deal targets
        // cr664_loandeal. TODO CONFIRM still holds for this file.
        private const string LoanRequestProfileToLoanDealLookupAttribute = "cr664_deal";

        // Audit write target -- mirrors Cr664_auditeventsModel.ts's option-set integer values exactly
        // (LoanDeal=788190000, Lifecycle=788190002, StageChange=788190000, StatusChange=788190001,
        // Blocked=788190002). These are DATA values seeded by the solution, not guesses -- confirm
        // they still match the live org's option-set metadata before registering (a solution import
        // could in principle renumber them, though Dataverse option-set values are stable by design
        // once published).
        private const string AuditEventEntity = "cr664_auditevents";
        private const int AuditEntityTypeLoanDeal = 788190000;
        private const int AuditEventCategoryLifecycle = 788190002;
        private const int AuditEventTypeStageChange = 788190000;
        private const int AuditEventTypeStatusChange = 788190001;
        private const int AuditOutcomeBlocked = 788190002;

        // cr664_platformusers bridge -- mirrors src/deals/newDealAuditActorResolver.ts exactly (the
        // ChangedBy lookup targets the custom cr664_user table, never systemuser; a systemuser's
        // email is resolved to a cr664_platformusers row, whose cr664_CoreUser lookup value is the
        // real cr664_user id to bind). TODO CONFIRM the singular logical name below.
        private const string PlatformUserEntity = "cr664_platformuser";
        private const string PlatformUserEmailAttribute = "cr664_email";
        private const string PlatformUserNormalizedEmailAttribute = "cr664_normalizedemail";
        private const string PlatformUserActiveStatusAttribute = "cr664_activestatus";
        private const string PlatformUserCoreUserAttribute = "cr664_coreuser"; // OData _cr664_coreuser_value

        /// <summary>
        /// Fail-closed toggle: whether this plugin build requires the reason column to exist and be
        /// non-empty to allow a RETURN/DECLINE/WITHDRAW. Set true only once
        /// scripts/dataverse/create-governed-transition-reason-field.ps1 -Apply has actually run
        /// against the target org (mirrors GOVERNANCE_REASON_FIELD_ENABLED client-side). Left false
        /// here deliberately -- see docs/governance/DEPLOYMENT_AND_ROLLBACK_PLAN.md for the exact
        /// cutover sequence (provision schema, flip this constant, rebuild, redeploy, THEN this
        /// specific rule tightens from "advisory" to "enforced").
        /// </summary>
        private const bool RequireReasonFieldToEnforce = false;

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));

            if (!string.Equals(context.MessageName, "Update", StringComparison.OrdinalIgnoreCase)) return;
            if (!string.Equals(context.PrimaryEntityName, LoanDealEntity, StringComparison.OrdinalIgnoreCase)) return;
            // Only stage 10 (pre-validation, pre-transaction) and stage 20 (pre-operation,
            // in-transaction) are meaningful here -- see the class doc comment. Anything else
            // (main operation = 30, post-operation = 40) is too late to prevent the write.
            var isPreValidation = context.Stage == 10;
            var isPreOperation = context.Stage == 20;
            if (!isPreValidation && !isPreOperation) return;

            if (!(context.InputParameters.Contains("Target") && context.InputParameters["Target"] is Entity target))
            {
                return;
            }
            var touchesStage = target.Attributes.Contains(StageReferenceAttribute);
            var touchesStatus = target.Attributes.Contains(StatusReferenceAttribute);
            if (!touchesStage && !touchesStatus) return; // Every other loan-deal field write is unaffected.

            if (!context.PreEntityImages.Contains("PreImage"))
            {
                // Fail closed: without the pre-image we cannot know the FROM stage/status, so we cannot
                // safely evaluate the transition. Block rather than guess -- a misconfigured
                // registration (missing pre-image) must never silently allow a write through.
                Deny(serviceProvider, context, tracing, target, isPreValidation, null, null, null, null,
                    "This update could not be evaluated for governance policy (no prior-state image). Contact your administrator if this persists.");
                return;
            }
            var preImage = context.PreEntityImages["PreImage"];

            var service = ((IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory)))
                .CreateOrganizationService(context.InitiatingUserId);

            // ---- Resolve FROM/TO stage + status against the (fresh, at stage 20) pre-image ----
            var fromStageRef = preImage.GetAttributeValue<EntityReference>(StageReferenceAttribute);
            var fromStage = ResolveStage(service, fromStageRef);
            var toStageRef = touchesStage ? target.GetAttributeValue<EntityReference>(StageReferenceAttribute) : fromStageRef;
            var toStage = touchesStage ? ResolveStage(service, toStageRef) : fromStage;

            var fromStatusRef = preImage.GetAttributeValue<EntityReference>(StatusReferenceAttribute);
            var fromStatusCode = ResolveStatusCode(service, fromStatusRef);
            var toStatusRef = touchesStatus ? target.GetAttributeValue<EntityReference>(StatusReferenceAttribute) : fromStatusRef;
            var toStatusCode = touchesStatus ? ResolveStatusCode(service, toStatusRef) : fromStatusCode;

            if (fromStage == null || fromStatusCode == null)
            {
                // Fail closed: the deal's current stage/status could not be resolved to a canonical
                // value (unseeded reference table, or a non-canonical value on the record). Mirrors
                // stageOrderingContract.ts / statusReferenceContract.ts's `unavailable` fail-closed
                // result -- never guess.
                Deny(serviceProvider, context, tracing, target, isPreValidation, fromStage?.Code, toStage?.Code, fromStatusCode, toStatusCode,
                    "This deal's current stage or status could not be resolved against the governed reference data. Contact your administrator.");
                return;
            }

            // ---- §2/§7: terminal-status lock -- no further governed transition from a terminal status ----
            if (TerminalStatuses.Contains(fromStatusCode))
            {
                Deny(serviceProvider, context, tracing, target, isPreValidation, fromStage.Code, toStage?.Code, fromStatusCode, toStatusCode,
                    $"This deal's status ({fromStatusCode}) is terminal; no further governed change is permitted. See the canonical transition policy contract §7.");
                return;
            }

            var reasonText = target.Contains(GovernedActionReasonAttribute)
                ? target.GetAttributeValue<string>(GovernedActionReasonAttribute)
                : null;

            // ---- Classify the write and evaluate the matching §3 rule ----
            var statusChangingToTerminal = touchesStatus && (toStatusCode == StatusDeclined || toStatusCode == StatusWithdrawn);

            if (statusChangingToTerminal)
            {
                // DECLINE or WITHDRAW: §3.3/§3.4 -- no stage change, a reason is required, and neither
                // is legal once the deal is already BOARDED (portfolio-side actions apply instead).
                if (touchesStage && toStage == null)
                {
                    // The write's new stage reference does not resolve to a canonical stage at all --
                    // fail closed rather than silently allow a decline/withdrawal alongside an
                    // unrecognizable stage value.
                    Deny(serviceProvider, context, tracing, target, isPreValidation, fromStage.Code, null, fromStatusCode, toStatusCode,
                        "This deal's target stage could not be resolved against the governed reference data. Contact your administrator.");
                    return;
                }
                if (touchesStage && toStage.Code != fromStage.Code)
                {
                    Deny(serviceProvider, context, tracing, target, isPreValidation, fromStage.Code, toStage.Code, fromStatusCode, toStatusCode,
                        "A decline or withdrawal cannot also change the deal's stage in the same write.");
                    return;
                }
                if (fromStage.Code == BoardedCode)
                {
                    Deny(serviceProvider, context, tracing, target, isPreValidation, fromStage.Code, toStage?.Code, fromStatusCode, toStatusCode,
                        $"This deal is already boarded; {(toStatusCode == StatusDeclined ? "decline" : "withdrawal")} is not a governed transition from the boarded stage.");
                    return;
                }
                if (RequireReasonFieldToEnforce && string.IsNullOrWhiteSpace(reasonText))
                {
                    Deny(serviceProvider, context, tracing, target, isPreValidation, fromStage.Code, toStage?.Code, fromStatusCode, toStatusCode,
                        $"A reason is required to {(toStatusCode == StatusDeclined ? "decline" : "withdraw")} this deal.");
                    return;
                }
                // Allowed -- return normally, let the pipeline continue the write. (No explicit
                // "Denied" path left for adverse-action tracking here -- per the contract §3.3, that
                // remains an honest, untracked, non-blocking placeholder; this plugin never invents
                // enforcement for a capability the app itself does not yet track.)
                return;
            }

            if (touchesStage && toStage != null && toStage.Code != fromStage.Code)
            {
                if (toStage.Sequence > fromStage.Sequence)
                {
                    // ADVANCE (§3.1): must be the single adjacent next stage -- never a skip.
                    var next = NextStageBySequence(service, fromStage.Sequence);
                    if (next == null || next.Code != toStage.Code)
                    {
                        Deny(serviceProvider, context, tracing, target, isPreValidation, fromStage.Code, toStage.Code, fromStatusCode, toStatusCode,
                            next == null
                                ? $"{fromStage.Code} has no legal next stage."
                                : $"{toStage.Code} is not the next stage after {fromStage.Code} (expected {next.Code}).");
                        return;
                    }

                    // §3.1's one wired deep authority gate: CREDIT_APPROVAL -> COMMITMENT requires
                    // credit-approval authority. Every other forward exit's deep facts (risk rating,
                    // underwriting recommendation, conditions precedent, etc.) are enforced client-side
                    // only today (see the ADR's scope note) -- this plugin does not invent enforcement
                    // for facts that have no backing record in this schema yet.
                    if (fromStage.Code == CreditApprovalCode && toStage.Code == CommitmentCode)
                    {
                        var authorityDenial = EvaluateCreditApprovalAuthority(service, tracing, context, target, preImage);
                        if (authorityDenial != null)
                        {
                            Deny(serviceProvider, context, tracing, target, isPreValidation, fromStage.Code, toStage.Code, fromStatusCode, toStatusCode, authorityDenial);
                            return;
                        }
                    }
                    // Allowed.
                    return;
                }

                // RETURN (§3.2): any strictly earlier stage (by sequence) is a legal target; a reason
                // is required. No re-check of the destination stage's own forward-entry requirements
                // (a return is how work gets redone, not a second forward gate).
                if (toStage.Sequence < fromStage.Sequence)
                {
                    if (RequireReasonFieldToEnforce && string.IsNullOrWhiteSpace(reasonText))
                    {
                        Deny(serviceProvider, context, tracing, target, isPreValidation, fromStage.Code, toStage.Code, fromStatusCode, toStatusCode,
                            "A reason is required to return this deal to an earlier stage.");
                        return;
                    }
                    return; // Allowed.
                }
            }

            // touchesStatus only, staying within the non-terminal set (OPEN <-> ON_HOLD): this
            // contract does not define a distinct governed meaning for ON_HOLD beyond "not
            // terminal" (§2) -- not blocked here. It must still resolve to A canonical status,
            // though -- a dangling/malformed status reference is not "not terminal", it is
            // unresolvable, and must fail closed like every other unresolvable reference in this
            // file rather than sail through because it merely isn't literally DECLINED/WITHDRAWN.
            if (touchesStatus && !touchesStage)
            {
                if (toStatusCode == null)
                {
                    Deny(serviceProvider, context, tracing, target, isPreValidation, fromStage.Code, toStage?.Code, fromStatusCode, null,
                        "This deal's target status could not be resolved against the governed reference data. Contact your administrator.");
                    return;
                }
                return;
            }

            // Anything reaching here (e.g. a stage "advance" to the SAME sequence, which is not a
            // real transition) is not a recognized legal edge -- fail closed rather than silently
            // allow an unclassified write.
            Deny(serviceProvider, context, tracing, target, isPreValidation, fromStage.Code, toStage?.Code, fromStatusCode, toStatusCode,
                "This stage/status change does not match a recognized governed transition.");
        }

        /// <summary>
        /// Mirrors src/workflow/creditApprovalAuthority.ts's evaluateCreditApprovalAuthority exactly
        /// (see LoanDealStageAuthorityPlugin's original review for the line-by-line derivation this
        /// was carried over from). Returns null when authorized, or a safe, generic denial message.
        /// </summary>
        private static string EvaluateCreditApprovalAuthority(
            IOrganizationService service, ITracingService tracing, IPluginExecutionContext context, Entity target, Entity preImage)
        {
            var systemUser = service.Retrieve("systemuser", context.InitiatingUserId, new ColumnSet("internalemailaddress"));
            var email = systemUser.GetAttributeValue<string>("internalemailaddress");
            if (string.IsNullOrWhiteSpace(email))
            {
                return "We couldn't confirm your identity for this approval action.";
            }

            var bankerQuery = new QueryExpression(BankerEntity)
            {
                ColumnSet = new ColumnSet(ApprovalLimitAttribute, CreditCommitteeMemberAttribute, ApprovalOverrideAuthorityAttribute),
                TopCount = 1,
            };
            bankerQuery.Criteria = new FilterExpression();
            bankerQuery.Criteria.AddCondition(BankerEmailAttribute, ConditionOperator.Equal, email);
            var bankers = service.RetrieveMultiple(bankerQuery);
            if (bankers.Entities.Count == 0)
            {
                return "Your banker profile is not set up for approval actions. Contact your administrator.";
            }
            var banker = bankers.Entities[0];

            bool? approvalOverrideAuthority = banker.Contains(ApprovalOverrideAuthorityAttribute)
                ? banker.GetAttributeValue<bool>(ApprovalOverrideAuthorityAttribute) : (bool?)null;
            bool? creditCommitteeMember = banker.Contains(CreditCommitteeMemberAttribute)
                ? banker.GetAttributeValue<bool>(CreditCommitteeMemberAttribute) : (bool?)null;
            var approvalLimitMoney = banker.GetAttributeValue<Money>(ApprovalLimitAttribute);
            decimal? approvalLimit = approvalLimitMoney != null ? approvalLimitMoney.Value : (decimal?)null;

            // FAIL CLOSED: any of the three authority fields absent is "not authorized," never "false".
            if (!approvalOverrideAuthority.HasValue || !creditCommitteeMember.HasValue || !approvalLimit.HasValue)
            {
                return "Approval authority is not yet configured for your account. Contact your credit administrator.";
            }

            if (approvalOverrideAuthority.Value) return null; // Override bypasses committee + amount checks.

            var dealAmountEntity = target.Contains(AmountAttribute) ? target : preImage;
            var dealAmountMoney = dealAmountEntity.GetAttributeValue<Money>(AmountAttribute);
            decimal? dealAmount = dealAmountMoney != null ? dealAmountMoney.Value : (decimal?)null;
            decimal? requestProfileAmount = TryResolveRequestProfileAmount(service, target.Id, tracing);

            if (requestProfileAmount.HasValue && dealAmount.HasValue && requestProfileAmount.Value != dealAmount.Value)
            {
                return "This deal's loan amount does not match across records and must be reconciled before approval.";
            }
            var resolvedAmount = dealAmount ?? requestProfileAmount;
            if (!resolvedAmount.HasValue)
            {
                return "This deal's loan amount must be recorded before it can be approved.";
            }
            if (!creditCommitteeMember.Value)
            {
                return "This approval requires credit committee authority.";
            }
            if (resolvedAmount.Value > approvalLimit.Value)
            {
                return "This loan amount exceeds your individual approval authority.";
            }
            return null;
        }

        private static decimal? TryResolveRequestProfileAmount(IOrganizationService service, Guid dealId, ITracingService tracing)
        {
            try
            {
                var query = new QueryExpression(LoanRequestProfileEntity)
                {
                    ColumnSet = new ColumnSet(LoanRequestProfileRequestedAmountAttribute),
                    TopCount = 1,
                };
                query.Criteria = new FilterExpression();
                query.Criteria.AddCondition(LoanRequestProfileToLoanDealLookupAttribute, ConditionOperator.Equal, dealId);
                var result = service.RetrieveMultiple(query);
                if (result.Entities.Count == 0) return null;
                var money = result.Entities[0].GetAttributeValue<Money>(LoanRequestProfileRequestedAmountAttribute);
                return money != null ? money.Value : (decimal?)null;
            }
            catch (Exception ex)
            {
                tracing?.Trace("LoanDealGovernedTransitionPlugin: request-profile cross-check skipped: {0}", ex.Message);
                return null;
            }
        }

        private sealed class ResolvedStage
        {
            public string Code;
            public int Sequence;
        }

        private static ResolvedStage ResolveStage(IOrganizationService service, EntityReference stageReference)
        {
            if (stageReference == null) return null;
            Entity record;
            try
            {
                record = service.Retrieve(StageReferenceEntity, stageReference.Id, new ColumnSet(StageCodeAttribute, StageSequenceAttribute));
            }
            catch (Exception)
            {
                // Fail closed: a dangling/unresolvable stage-reference lookup (e.g. the referenced
                // row was deleted) must never surface as a raw platform fault -- it is exactly as
                // unresolvable as a null reference or a non-canonical code, and is denied the same way.
                return null;
            }
            var code = record.GetAttributeValue<string>(StageCodeAttribute);
            if (string.IsNullOrEmpty(code) || Array.IndexOf(CanonicalStageCodes, code) < 0) return null; // Non-canonical -- fail closed.
            if (!record.Contains(StageSequenceAttribute)) return null; // Not seeded -- fail closed (mirrors stageOrderingContract.ts).
            return new ResolvedStage { Code = code, Sequence = record.GetAttributeValue<int>(StageSequenceAttribute) };
        }

        /// <summary>
        /// The single active stage whose cr664_sequence is the smallest value strictly greater than
        /// `fromSequence` -- mirrors stageOrderingContract.ts's `nextStage()` (adjacency by seeded
        /// sequence, not by this file's CanonicalStageCodes array order).
        /// </summary>
        private static ResolvedStage NextStageBySequence(IOrganizationService service, int fromSequence)
        {
            var query = new QueryExpression(StageReferenceEntity)
            {
                ColumnSet = new ColumnSet(StageCodeAttribute, StageSequenceAttribute),
            };
            query.Criteria = new FilterExpression();
            query.Criteria.AddCondition(StageActiveFlagAttribute, ConditionOperator.Equal, true);
            query.Criteria.AddCondition(StageSequenceAttribute, ConditionOperator.GreaterThan, fromSequence);
            query.AddOrder(StageSequenceAttribute, OrderType.Ascending);
            query.TopCount = 1;
            var rows = service.RetrieveMultiple(query);
            if (rows.Entities.Count == 0) return null;
            var row = rows.Entities[0];
            var code = row.GetAttributeValue<string>(StageCodeAttribute);
            if (string.IsNullOrEmpty(code) || Array.IndexOf(CanonicalStageCodes, code) < 0) return null;
            return new ResolvedStage { Code = code, Sequence = row.GetAttributeValue<int>(StageSequenceAttribute) };
        }

        private static string ResolveStatusCode(IOrganizationService service, EntityReference statusReference)
        {
            if (statusReference == null) return null;
            Entity record;
            try
            {
                record = service.Retrieve(StatusReferenceEntity, statusReference.Id, new ColumnSet(StatusCodeAttribute));
            }
            catch (Exception)
            {
                // Fail closed -- see the matching comment in ResolveStage.
                return null;
            }
            var code = record.GetAttributeValue<string>(StatusCodeAttribute);
            var canonical = new[] { StatusOpen, StatusOnHold, StatusDeclined, StatusWithdrawn, StatusBoarded };
            return !string.IsNullOrEmpty(code) && Array.IndexOf(canonical, code) >= 0 ? code : null;
        }

        /// <summary>
        /// Resolve the acting systemuser's email to a cr664_ChangedBy bind
        /// (`/cr664_users(&lt;cr664_userid&gt;)`) via the cr664_platformusers bridge -- mirrors
        /// src/deals/newDealAuditActorResolver.ts exactly, including its fail-closed contract (zero
        /// matches, an inactive row, or a missing CoreUser link all return null -- never a fabricated
        /// bind, and never a systemuser id bound into cr664_ChangedBy).
        /// </summary>
        private static EntityReference ResolveChangedByBind(IOrganizationService service, Guid initiatingUserId)
        {
            try
            {
                var systemUser = service.Retrieve("systemuser", initiatingUserId, new ColumnSet("internalemailaddress"));
                var email = systemUser.GetAttributeValue<string>("internalemailaddress");
                if (string.IsNullOrWhiteSpace(email)) return null;

                var query = new QueryExpression(PlatformUserEntity)
                {
                    ColumnSet = new ColumnSet(PlatformUserCoreUserAttribute, PlatformUserActiveStatusAttribute),
                };
                query.Criteria = new FilterExpression(LogicalOperator.And);
                query.Criteria.AddCondition(PlatformUserActiveStatusAttribute, ConditionOperator.Equal, true);
                query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
                var emailFilter = new FilterExpression(LogicalOperator.Or);
                emailFilter.AddCondition(PlatformUserEmailAttribute, ConditionOperator.Equal, email);
                emailFilter.AddCondition(PlatformUserNormalizedEmailAttribute, ConditionOperator.Equal, email.Trim().ToLowerInvariant());
                query.Criteria.AddFilter(emailFilter);
                var rows = service.RetrieveMultiple(query);

                var coreUserIds = rows.Entities
                    .Select(r => r.GetAttributeValue<EntityReference>(PlatformUserCoreUserAttribute))
                    .Where(r => r != null)
                    .Select(r => r.Id)
                    .Distinct()
                    .ToList();
                if (coreUserIds.Count != 1) return null; // Zero or ambiguous (multiple distinct) -- fail closed.
                return new EntityReference("cr664_user", coreUserIds[0]);
            }
            catch
            {
                return null; // Never throw from audit attribution -- a failed audit write is reported, not fatal.
            }
        }

        /// <summary>
        /// Deny the transition. At stage 10 (pre-validation), also attempts a durable audit-of-
        /// rejection write BEFORE throwing (see the class doc comment for why that write survives
        /// the throw). At stage 20, only throws -- an audit write here would roll back with the
        /// aborted transaction, so it is not attempted (see the ADR's accepted residual-gap note).
        /// </summary>
        private static void Deny(
            IServiceProvider serviceProvider, IPluginExecutionContext context, ITracingService tracing, Entity target, bool isPreValidation,
            string fromStageCode, string toStageCode, string fromStatusCode, string toStatusCode, string safeMessage)
        {
            if (isPreValidation)
            {
                try
                {
                    WriteRejectionAudit(serviceProvider, context, tracing, target, fromStageCode, toStageCode, fromStatusCode, toStatusCode, safeMessage);
                }
                catch (Exception ex)
                {
                    tracing?.Trace("LoanDealGovernedTransitionPlugin: rejection audit write failed (non-fatal): {0}", ex.Message);
                }
            }
            throw new InvalidPluginExecutionException(safeMessage);
        }

        private static void WriteRejectionAudit(
            IServiceProvider serviceProvider, IPluginExecutionContext context, ITracingService tracing, Entity target,
            string fromStageCode, string toStageCode, string fromStatusCode, string toStatusCode, string reason)
        {
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            if (factory == null) return;
            var service = factory.CreateOrganizationService(context.InitiatingUserId);

            var changedBy = ResolveChangedByBind(service, context.InitiatingUserId);
            if (changedBy == null)
            {
                tracing?.Trace("LoanDealGovernedTransitionPlugin: rejection audit skipped -- actor could not be resolved to cr664_user (fail-closed, never fabricated).");
                return;
            }

            var eventType = toStatusCode != null && toStatusCode != fromStatusCode ? AuditEventTypeStatusChange : AuditEventTypeStageChange;
            var audit = new Entity(AuditEventEntity);
            audit["cr664_auditeventname"] = "Governed Transition Rejected";
            audit["cr664_ChangedBy"] = changedBy;
            audit["cr664_changeddate"] = DateTime.UtcNow;
            audit["cr664_entityid"] = target.Id.ToString();
            audit["cr664_entitytype"] = new OptionSetValue(AuditEntityTypeLoanDeal);
            audit["cr664_eventcategory"] = new OptionSetValue(AuditEventCategoryLifecycle);
            audit["cr664_eventtype"] = new OptionSetValue(eventType);
            audit["cr664_outcomestatus"] = new OptionSetValue(AuditOutcomeBlocked);
            audit["cr664_beforestate"] = fromStageCode + (fromStatusCode != null ? " / " + fromStatusCode : "");
            audit["cr664_afterstate"] = (toStageCode ?? fromStageCode) + (toStatusCode != null ? " / " + toStatusCode : "");
            audit["cr664_fieldname"] = eventType == AuditEventTypeStatusChange ? StatusReferenceAttribute : StageReferenceAttribute;
            audit["cr664_failurereason"] = reason;
            audit["cr664_notes"] = "Rejected by LoanDealGovernedTransitionPlugin (server-side enforcement) -- see docs/governance/CANONICAL_TRANSITION_POLICY_CONTRACT.md.";
            audit["cr664_sourcescreensourceprocess"] = "LoanDealGovernedTransitionPlugin/pre-validation";
            audit["cr664_correlationid"] = context.CorrelationId.ToString();
            audit["cr664_LoanDeal"] = new EntityReference(LoanDealEntity, target.Id);

            service.Create(audit);
        }
    }
}
