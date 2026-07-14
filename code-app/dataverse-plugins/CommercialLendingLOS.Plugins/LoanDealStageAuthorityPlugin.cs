using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace CommercialLendingLOS.Plugins
{
    /// <summary>
    /// 2026-07-14 Dataverse credit-authority integration.
    ///
    /// Synchronous PreOperation plugin on Update of cr664_loandeal, filtered to
    /// cr664_stagereference and cr664_statusreference. Enforces, server-side, the same
    /// fail-closed credit-authority rule that src/workflow/creditApprovalAuthority.ts enforces
    /// client-side — so a direct Web API call, data import, Power Automate flow, or any other
    /// integration writing directly to cr664_loandeal cannot bypass the application's approval
    /// gate. See docs/DATAVERSE_SECURITY_ROLE_RUNBOOK.md and
    /// docs/LOAN_WORKFLOW_INDEPENDENT_AUDIT_2026-07-14.md (finding C1) for why this exists.
    ///
    /// NOT COMPILED, REGISTERED, OR DEPLOYED in the session that authored this file — no `dotnet`
    /// SDK or Dataverse credentials were available there. Reviewed by inspection only. See
    /// PLUGIN_DEPLOYMENT.md for the build/registration steps a deploying engineer must run.
    ///
    /// KEPT IN SYNC BY HAND with src/workflow/creditApprovalAuthority.ts — there is no shared
    /// module across the TypeScript/C# boundary. If you change the policy in one, change it in
    /// both, or the client and server will disagree about who can approve what.
    ///
    /// TODO CONFIRM before deploying: LoanRequestProfileToLoanDealLookupAttribute below is a
    /// placeholder — the actual schema name of the lookup from cr664_loanrequestprofile to
    /// cr664_loandeal could not be verified from the authoring session (no live Dataverse
    /// access). Confirm it against the live CommercialLendingLOS solution. Until confirmed, the
    /// amount-conflict cross-check silently no-ops (logged via ITracingService) rather than
    /// fabricating a wrong comparison.
    /// </summary>
    public class LoanDealStageAuthorityPlugin : IPlugin
    {
        private const string LoanDealEntity = "cr664_loandeal";
        private const string StageReferenceAttribute = "cr664_stagereference";
        private const string StatusReferenceAttribute = "cr664_statusreference";
        private const string AmountAttribute = "cr664_amount";

        private const string StageReferenceEntity = "cr664_dealstagereferences";
        private const string StageCodeAttribute = "cr664_code";

        private const string CreditApprovalCode = "CREDIT_APPROVAL";
        private const string CommitmentCode = "COMMITMENT";

        private const string BankerEntity = "cr664_banker";
        private const string BankerEmailAttribute = "cr664_email";
        private const string ApprovalLimitAttribute = "cr664_approvallimit";
        private const string CreditCommitteeMemberAttribute = "cr664_creditcommitteemember";
        private const string ApprovalOverrideAuthorityAttribute = "cr664_approvaloverrideauthority";

        private const string LoanRequestProfileEntity = "cr664_loanrequestprofile";
        private const string LoanRequestProfileRequestedAmountAttribute = "cr664_requestedamount";
        // TODO CONFIRM — see class-level doc comment.
        private const string LoanRequestProfileToLoanDealLookupAttribute = "cr664_loandeal";

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));

            if (!string.Equals(context.MessageName, "Update", StringComparison.OrdinalIgnoreCase)) return;
            if (!string.Equals(context.PrimaryEntityName, LoanDealEntity, StringComparison.OrdinalIgnoreCase)) return;
            // Stage 20 = PreOperation. This MUST run synchronously and in-transaction — a
            // PostOperation or asynchronous registration would let the write land before (or
            // regardless of) this check, which defeats the entire point.
            if (context.Stage != 20) return;

            if (!(context.InputParameters.Contains("Target") && context.InputParameters["Target"] is Entity target))
            {
                return;
            }
            var touchesStage = target.Attributes.Contains(StageReferenceAttribute);
            var touchesStatus = target.Attributes.Contains(StatusReferenceAttribute);
            if (!touchesStage && !touchesStatus) return;

            if (!context.PreEntityImages.Contains("PreImage"))
            {
                // Fail closed: without the pre-image we cannot know the FROM stage, so we cannot
                // safely determine whether this is a CREDIT_APPROVAL exit. Block rather than guess
                // — a misconfigured registration (missing pre-image) must never silently allow.
                throw new InvalidPluginExecutionException(
                    "This update could not be evaluated for approval authority. Contact your administrator if this persists.");
            }
            var preImage = context.PreEntityImages["PreImage"];

            var service = ((IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory)))
                .CreateOrganizationService(context.InitiatingUserId);

            var fromCode = ResolveStageCode(service, preImage.GetAttributeValue<EntityReference>(StageReferenceAttribute));
            if (!string.Equals(fromCode, CreditApprovalCode, StringComparison.Ordinal))
            {
                return; // Not exiting Credit Approval — nothing for this plugin to enforce.
            }

            var targetStageRef = touchesStage
                ? target.GetAttributeValue<EntityReference>(StageReferenceAttribute)
                : preImage.GetAttributeValue<EntityReference>(StageReferenceAttribute);
            var toCode = ResolveStageCode(service, targetStageRef);
            if (!string.Equals(toCode, CommitmentCode, StringComparison.Ordinal))
            {
                // Scoped narrowly to the one real forward exit (CREDIT_APPROVAL -> COMMITMENT,
                // per loanWorkflowStages.ts) rather than blocking every stage/status write.
                return;
            }

            // Resolve the acting user's banker record BY EMAIL — mirrors BankerProvider.tsx's
            // client-side resolution strategy exactly, rather than guessing at an unverified
            // lookup relationship between systemuser and cr664_banker.
            var systemUser = service.Retrieve("systemuser", context.InitiatingUserId, new ColumnSet("internalemailaddress"));
            var email = systemUser.GetAttributeValue<string>("internalemailaddress");
            if (string.IsNullOrWhiteSpace(email))
            {
                Deny("We couldn't confirm your identity for this approval action.");
                return;
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
                Deny("Your banker profile is not set up for approval actions. Contact your administrator.");
                return;
            }
            var banker = bankers.Entities[0];

            bool? approvalOverrideAuthority = banker.Contains(ApprovalOverrideAuthorityAttribute)
                ? banker.GetAttributeValue<bool>(ApprovalOverrideAuthorityAttribute)
                : (bool?)null;
            bool? creditCommitteeMember = banker.Contains(CreditCommitteeMemberAttribute)
                ? banker.GetAttributeValue<bool>(CreditCommitteeMemberAttribute)
                : (bool?)null;
            var approvalLimitMoney = banker.GetAttributeValue<Money>(ApprovalLimitAttribute);
            decimal? approvalLimit = approvalLimitMoney != null ? approvalLimitMoney.Value : (decimal?)null;

            // FAIL CLOSED: any of the three authority fields being absent (never populated for
            // this banker) is treated as "not authorized," never as false.
            if (!approvalOverrideAuthority.HasValue || !creditCommitteeMember.HasValue || !approvalLimit.HasValue)
            {
                Deny("Approval authority is not yet configured for your account. Contact your credit administrator.");
                return;
            }

            if (approvalOverrideAuthority.Value)
            {
                return; // Override authority bypasses both the committee and amount checks below.
            }

            // Amount precedence contract: cr664_loandeal.cr664_amount is PRIMARY. A linked
            // cr664_loanrequestprofile.cr664_requestedamount is a CROSS-CHECK — if it disagrees,
            // that is a hard block, never silently resolved by picking one. Mirrors
            // resolveGovernedRequestedAmount in src/workflow/governedRequestedAmount.ts.
            var dealAmountEntity = target.Contains(AmountAttribute) ? target : preImage;
            var dealAmountMoney = dealAmountEntity.GetAttributeValue<Money>(AmountAttribute);
            decimal? dealAmount = dealAmountMoney != null ? dealAmountMoney.Value : (decimal?)null;
            decimal? requestProfileAmount = TryResolveRequestProfileAmount(service, target.Id, tracing);

            if (requestProfileAmount.HasValue && dealAmount.HasValue && requestProfileAmount.Value != dealAmount.Value)
            {
                Deny("This deal's loan amount does not match across records and must be reconciled before approval.");
                return;
            }
            var resolvedAmount = dealAmount ?? requestProfileAmount;
            if (!resolvedAmount.HasValue)
            {
                Deny("This deal's loan amount must be recorded before it can be approved.");
                return;
            }

            if (!creditCommitteeMember.Value)
            {
                Deny("This approval requires credit committee authority.");
                return;
            }
            if (resolvedAmount.Value > approvalLimit.Value)
            {
                Deny("This loan amount exceeds your individual approval authority.");
                return;
            }

            // All checks passed — return normally and let the pipeline continue the write.
        }

        /// <summary>
        /// Deliberately generic denial copy — no dollar amounts, no internal field names. Mirrors
        /// describeCreditApprovalAuthorityReason in src/workflow/creditApprovalAuthority.ts. This
        /// is the message a direct API caller (or a banker, if this were ever surfaced to the UI
        /// as a raw error) actually sees.
        /// </summary>
        private static void Deny(string safeMessage)
        {
            throw new InvalidPluginExecutionException(safeMessage);
        }

        private static string ResolveStageCode(IOrganizationService service, EntityReference stageReference)
        {
            if (stageReference == null) return null;
            var record = service.Retrieve(StageReferenceEntity, stageReference.Id, new ColumnSet(StageCodeAttribute));
            return record.GetAttributeValue<string>(StageCodeAttribute);
        }

        /// <summary>
        /// Best-effort cross-check read — see the TODO CONFIRM class-level note. Returns null (no
        /// cross-check performed, not a fabricated value) if the relationship cannot be resolved.
        /// </summary>
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
                if (tracing != null)
                {
                    tracing.Trace("LoanDealStageAuthorityPlugin: request-profile cross-check skipped: {0}", ex.Message);
                }
                return null;
            }
        }
    }
}
