using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace CommercialLendingLOS.Plugins
{
    /// <summary>
    /// Server-side enforcement floor for the append-only lifecycle records and mutable funding
    /// authorization record. Register synchronously in PreOperation (stage 20) for the messages
    /// listed in DurableRecordGovernanceRegistration.json.
    ///
    /// The client remains responsible for user experience, audit, and timeline writes. This plugin
    /// independently re-resolves the initiating Dataverse user and current persisted state. Direct
    /// Web API, flow, import, and alternate-client writes therefore receive the same fail-closed
    /// identity, lifecycle, maker/checker, authority, and immutable-history checks.
    /// </summary>
    public sealed class DurableRecordGovernancePlugin : IPlugin
    {
        private const string CreditDecision = "cr664_creditapprovaldecision";
        private const string Commitment = "cr664_commitmentrecord";
        private const string Condition = "cr664_conditionverification";
        private const string ExecutedDocument = "cr664_executeddocattestation";
        private const string BookingQc = "cr664_bookingqccheck";
        private const string AdverseAction = "cr664_adverseactionrecord";
        private const string Funding = "cr664_fundingauthorization";

        private const string LoanDeal = "cr664_loandeal";
        private const string Banker = "cr664_banker";
        private const string PlatformUser = "cr664_platformuser";
        private const decimal FundingDualControlThreshold = 250000m;

        private static readonly HashSet<string> ProtectedEntities = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            CreditDecision, Commitment, Condition, ExecutedDocument, BookingQc, AdverseAction, Funding,
        };

        private static readonly HashSet<string> CreditDecisionStatuses = Set("RETURNED", "APPROVED", "APPROVED_WITH_CONDITIONS", "DECLINED");
        private static readonly HashSet<string> CommitmentStatuses = Set("ISSUED", "ACCEPTED", "DECLINED", "EXPIRED", "WITHDRAWN");
        private static readonly HashSet<string> CommitmentResponseStatuses = Set("ACCEPTED", "DECLINED", "EXPIRED", "WITHDRAWN");
        private static readonly HashSet<string> ConditionTypes = Set("CONDITIONS_PRECEDENT", "COLLATERAL", "INSURANCE");
        private static readonly HashSet<string> ConditionStatuses = Set("CLEARED", "WAIVED", "FAILED");
        private static readonly HashSet<string> ExecutedDocumentStatuses = Set("ATTESTED", "REVOKED");
        private static readonly HashSet<string> BookingStatuses = Set("PASSED", "FAILED", "WAIVED");
        private static readonly HashSet<string> AdverseActionStatuses = Set("SENT", "WAIVED");
        private static readonly HashSet<string> FundingTerminalStatuses = Set("REJECTED", "REVOKED", "FUNDED", "CANCELLED");

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            if (context == null || context.Stage != 20 || !ProtectedEntities.Contains(context.PrimaryEntityName)) return;
            if (!string.Equals(context.MessageName, "Create", StringComparison.OrdinalIgnoreCase)
                && !string.Equals(context.MessageName, "Update", StringComparison.OrdinalIgnoreCase)
                && !string.Equals(context.MessageName, "Delete", StringComparison.OrdinalIgnoreCase)) return;

            var service = ((IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory)))
                .CreateOrganizationService(context.InitiatingUserId);
            var actor = ResolveActor(service, context.InitiatingUserId);
            tracing.Trace("DurableRecordGovernance entity={0} message={1} actor={2}",
                context.PrimaryEntityName, context.MessageName, actor.Email);

            if (string.Equals(context.MessageName, "Delete", StringComparison.OrdinalIgnoreCase))
                Deny("Governed lifecycle and funding records are retained history and cannot be deleted.");

            var target = RequireTarget(context);
            if (string.Equals(context.MessageName, "Update", StringComparison.OrdinalIgnoreCase))
            {
                var pre = RequirePreImage(context);
                if (!string.Equals(context.PrimaryEntityName, Funding, StringComparison.OrdinalIgnoreCase))
                    Deny("This governed record is append-only. Record a superseding row instead of modifying history.");
                ValidateFundingUpdate(service, pre, target, actor);
                return;
            }

            RequireCorrelation(target);
            var deal = ResolveDeal(service, RequireText(target, "cr664_dealid", "Deal Id"));
            switch (context.PrimaryEntityName)
            {
                case CreditDecision: ValidateCreditDecision(service, target, deal, actor); break;
                case Commitment: ValidateCommitment(service, target, deal, actor); break;
                case Condition: ValidateCondition(service, target, deal, actor); break;
                case ExecutedDocument: ValidateExecutedDocument(service, target, deal, actor); break;
                case BookingQc: ValidateBookingQc(service, target, deal, actor); break;
                case AdverseAction: ValidateAdverseAction(service, target, deal, actor); break;
                case Funding: ValidateFundingCreate(service, target, deal, actor); break;
            }
        }

        private static void ValidateCreditDecision(IOrganizationService service, Entity target, Entity deal, Actor actor)
        {
            var status = RequireMember(target, "cr664_decisionstatus", CreditDecisionStatuses);
            var requestedBy = RequireEmail(target, "cr664_requestedby");
            RequireActor(target, "cr664_decidedby", actor);
            RequireText(target, "cr664_rationale", "Rationale");
            if (EmailsEqual(requestedBy, actor.Email)) Deny("The requester cannot decide their own credit request.");

            var banker = ResolveBanker(service, actor);
            var assigned = deal.GetAttributeValue<EntityReference>("cr664_assignedbanker");
            if (assigned != null && assigned.Id == banker.Id)
                Deny("The assigned/originating banker cannot approve their own deal.");

            var approvalLimit = MoneyOrDecimal(banker, "cr664_approvallimit");
            var committee = banker.GetAttributeValue<bool?>("cr664_creditcommitteemember");
            var overrideAuthority = banker.GetAttributeValue<bool?>("cr664_approvaloverrideauthority");
            if (!approvalLimit.HasValue || !committee.HasValue || !overrideAuthority.HasValue)
                Deny("The initiating banker's credit authority is not fully configured.");

            var amount = MoneyOrDecimal(deal, "cr664_amount");
            if (!amount.HasValue) Deny("The deal amount is unavailable for credit-authority enforcement.");
            if (!overrideAuthority.Value && (!committee.Value || amount.Value > approvalLimit.Value))
                Deny("The initiating banker does not have sufficient credit authority for this deal.");

            if ((status == "APPROVED" || status == "APPROVED_WITH_CONDITIONS")
                && string.IsNullOrWhiteSpace(target.GetAttributeValue<string>("cr664_authoritytier")))
                Deny("An approval must record its authority tier.");
        }

        private static void ValidateCommitment(IOrganizationService service, Entity target, Entity deal, Actor actor)
        {
            var status = RequireMember(target, "cr664_commitmentstatus", CommitmentStatuses);
            RequireActor(target, CommitmentResponseStatuses.Contains(status) ? "cr664_respondedby" : "cr664_issuedby", actor);
            if (status == "ISSUED")
            {
                RequireText(target, "cr664_keytermssummary", "Key terms summary");
                if (!Any(service, CreditDecision, "cr664_dealid", deal.Id.ToString(),
                    e => Set("APPROVED", "APPROVED_WITH_CONDITIONS").Contains(Text(e, "cr664_decisionstatus"))))
                    Deny("A durable approved credit decision is required before issuing a commitment.");
            }
            else
            {
                var prior = ResolveSuperseded(service, Commitment, "cr664_commitmentid",
                    RequireText(target, "cr664_supersedescommitmentid", "Superseded commitment Id"));
                if (!SameDeal(prior, deal) || Text(prior, "cr664_commitmentstatus") != "ISSUED")
                    Deny("A commitment response must supersede an issued commitment for the same deal.");
                if (status == "DECLINED") RequireText(target, "cr664_declinereason", "Decline reason");
            }
        }

        private static void ValidateCondition(IOrganizationService service, Entity target, Entity deal, Actor actor)
        {
            RequireMember(target, "cr664_conditiontype", ConditionTypes);
            RequireMember(target, "cr664_verificationstatus", ConditionStatuses);
            RequireActor(target, "cr664_verifiedby", actor);
            RequireText(target, "cr664_notes", "Notes");
            ValidateOptionalSupersession(service, target, deal, Condition, "cr664_recordid", "cr664_supersedesrecordid");
        }

        private static void ValidateExecutedDocument(IOrganizationService service, Entity target, Entity deal, Actor actor)
        {
            RequireMember(target, "cr664_attestationstatus", ExecutedDocumentStatuses);
            RequireActor(target, "cr664_attestedby", actor);
            RequireText(target, "cr664_notes", "Notes");
            if (!target.Contains("cr664_executeddate")) Deny("Executed date is required.");
            ValidateOptionalSupersession(service, target, deal, ExecutedDocument, "cr664_attestationid", "cr664_supersedesattestationid");
        }

        private static void ValidateBookingQc(IOrganizationService service, Entity target, Entity deal, Actor actor)
        {
            RequireMember(target, "cr664_qcstatus", BookingStatuses);
            RequireActor(target, "cr664_reviewedby", actor);
            RequireText(target, "cr664_notes", "Notes");
            var banker = ResolveBanker(service, actor);
            var assigned = deal.GetAttributeValue<EntityReference>("cr664_assignedbanker");
            if (assigned != null && assigned.Id == banker.Id)
                Deny("Booking QC must be performed by someone other than the originating banker.");
            ValidateOptionalSupersession(service, target, deal, BookingQc, "cr664_checkid", "cr664_supersedescheckid");
        }

        private static void ValidateAdverseAction(IOrganizationService service, Entity target, Entity deal, Actor actor)
        {
            RequireMember(target, "cr664_actionstatus", AdverseActionStatuses);
            RequireActor(target, "cr664_recordedby", actor);
            RequireText(target, "cr664_notes", "Notes");
            var statusRef = deal.GetAttributeValue<EntityReference>("cr664_statusreference");
            if (statusRef == null) Deny("The deal status is unavailable for adverse-action enforcement.");
            var status = service.Retrieve("cr664_dealstatusreferences", statusRef.Id, new ColumnSet("cr664_code"));
            if (Text(status, "cr664_code") != "DECLINED")
                Deny("Adverse-action completion may only be recorded for a declined deal.");
            ValidateOptionalSupersession(service, target, deal, AdverseAction, "cr664_recordid", "cr664_supersedesrecordid");
        }

        private static void ValidateFundingCreate(IOrganizationService service, Entity target, Entity deal, Actor actor)
        {
            if (RequireText(target, "cr664_authorizationstatus", "Authorization status") != "PENDING")
                Deny("A funding authorization must begin in PENDING status.");
            RequireActor(target, "cr664_requestedby", actor);
            var amount = DecimalValue(target, "cr664_requestedamount");
            if (!amount.HasValue || amount.Value <= 0) Deny("Requested funding amount must be positive.");
            var facility = MoneyOrDecimal(deal, "cr664_amount");
            if (!facility.HasValue || amount.Value > facility.Value)
                Deny("Requested funding exceeds the governed facility amount.");
            var supersedes = Text(target, "cr664_supersedesrecordid");
            if (!string.IsNullOrWhiteSpace(supersedes))
            {
                var prior = ResolveSuperseded(service, Funding, "cr664_recordid", supersedes);
                if (!SameDeal(prior, deal) || !FundingTerminalStatuses.Contains(Text(prior, "cr664_authorizationstatus")))
                    Deny("A replacement funding request must supersede a terminal authorization for the same deal.");
            }
        }

        private static void ValidateFundingUpdate(IOrganizationService service, Entity pre, Entity target, Actor actor)
        {
            EnsureImmutableFundingFields(pre, target);
            var deal = ResolveDeal(service, RequireText(pre, "cr664_dealid", "Deal Id"));
            var from = Text(pre, "cr664_authorizationstatus");
            var to = EffectiveText(pre, target, "cr664_authorizationstatus");
            if (FundingTerminalStatuses.Contains(from)) Deny("A terminal funding authorization is immutable.");
            var requester = Text(pre, "cr664_requestedby");
            var first = EffectiveText(pre, target, "cr664_authorizedby");
            var second = EffectiveText(pre, target, "cr664_secondapprovedby");
            var approved = EffectiveDecimal(pre, target, "cr664_approvedamount");
            var facility = MoneyOrDecimal(deal, "cr664_amount");

            if ((from == "PENDING" || from == "BLOCKED") && to == from
                && string.IsNullOrWhiteSpace(Text(pre, "cr664_authorizedby"))
                && target.Contains("cr664_authorizedby"))
            {
                if (EmailsEqual(requester, actor.Email)) Deny("The funding requester cannot approve their own request.");
                RequireEffectiveActor(target, "cr664_authorizedby", actor);
                if (!approved.HasValue || approved.Value < FundingDualControlThreshold) Deny("A first-only approval is valid only when dual control is required.");
                ValidateApprovedAmount(approved, facility);
                return;
            }
            if (from == to)
            {
                var allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "cr664_auditeventidsjson" };
                if (target.Attributes.Keys.Any(k => !allowed.Contains(k)))
                    Deny("Only audit-event linkage may be appended without a funding status transition.");
                return;
            }
            if (EmailsEqual(requester, actor.Email)) Deny("The funding requester cannot approve, reject, revoke, or confirm their own request.");
            if ((from == "PENDING" || from == "BLOCKED") && to == "APPROVED")
            {
                ValidateApprovedAmount(approved, facility);
                var priorFirst = Text(pre, "cr664_authorizedby");
                if (string.IsNullOrWhiteSpace(priorFirst))
                {
                    RequireEffectiveActor(target, "cr664_authorizedby", actor);
                    if (approved.Value >= FundingDualControlThreshold)
                        Deny("Funding at or above the dual-control threshold requires a second distinct approver.");
                }
                else
                {
                    RequireEffectiveActor(target, "cr664_secondapprovedby", actor);
                    if (EmailsEqual(priorFirst, actor.Email) || EmailsEqual(first, second))
                        Deny("The two funding approvals must be performed by distinct users.");
                    if (approved.Value < FundingDualControlThreshold)
                        Deny("A second approval is not accepted when dual control is not required.");
                }
                return;
            }
            if ((from == "PENDING" || from == "BLOCKED") && to == "REJECTED") return;
            if (from == "APPROVED" && to == "REVOKED") return;
            if (from == "APPROVED" && to == "FUNDED")
            {
                if (EmailsEqual(first, actor.Email) || EmailsEqual(second, actor.Email))
                    Deny("Disbursement confirmation must be performed by a user distinct from the funding approvers.");
                if (EffectiveText(pre, target, "cr664_destinationverificationstatus") != "verified")
                    Deny("Destination verification must be complete before funding confirmation.");
                if (EffectiveBool(pre, target, "cr664_conditionssatisfied") != true)
                    Deny("Funding conditions must be satisfied before funding confirmation.");
                var exceptions = EffectiveText(pre, target, "cr664_exceptionsjson") ?? "";
                if (exceptions.IndexOf("\"resolved\":false", StringComparison.OrdinalIgnoreCase) >= 0
                    || exceptions.IndexOf("\"resolved\": false", StringComparison.OrdinalIgnoreCase) >= 0)
                    Deny("Unresolved funding exceptions block funding confirmation.");
                EnsureRequiredDocumentsComplete(service, deal.Id);
                if (!target.Contains("cr664_fundingdate")) Deny("Funding date is required.");
                return;
            }
            Deny("This funding authorization status transition is not permitted.");
        }

        private static void EnsureRequiredDocumentsComplete(IOrganizationService service, Guid dealId)
        {
            var query = new QueryExpression("cr664_documentchecklist")
            {
                ColumnSet = new ColumnSet("cr664_required", "cr664_requirementstatus", "cr664_uploadstatus", "cr664_waived"),
            };
            query.Criteria.AddCondition("cr664_deal", ConditionOperator.Equal, dealId);
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            foreach (var row in service.RetrieveMultiple(query).Entities)
            {
                if (row.GetAttributeValue<bool?>("cr664_required") != true) continue;
                var status = row.GetAttributeValue<OptionSetValue>("cr664_requirementstatus");
                if (row.GetAttributeValue<bool?>("cr664_waived") == true
                    || status?.Value == 788190105
                    || status?.Value == 788190106)
                    continue;
                if (status?.Value != 788190104 || row.GetAttributeValue<bool?>("cr664_uploadstatus") != true)
                    Deny("All required documents must be reviewed, waived, or not applicable before funding confirmation.");
            }
        }

        private static Actor ResolveActor(IOrganizationService service, Guid systemUserId)
        {
            var systemUser = service.Retrieve("systemuser", systemUserId, new ColumnSet("internalemailaddress", "isdisabled"));
            if (systemUser.GetAttributeValue<bool?>("isdisabled") == true) Deny("The initiating Dataverse user is disabled.");
            var email = NormalizeEmail(systemUser.GetAttributeValue<string>("internalemailaddress"));
            if (string.IsNullOrWhiteSpace(email)) Deny("The initiating Dataverse user's email cannot be resolved.");
            var query = new QueryExpression(PlatformUser)
            {
                ColumnSet = new ColumnSet("cr664_coreuser", "cr664_activestatus", "statecode"),
                TopCount = 2,
            };
            query.Criteria.AddCondition("cr664_normalizedemail", ConditionOperator.Equal, email);
            var rows = service.RetrieveMultiple(query).Entities
                .Where(e => e.GetAttributeValue<bool?>("cr664_activestatus") == true
                    && (e.GetAttributeValue<OptionSetValue>("statecode") == null || e.GetAttributeValue<OptionSetValue>("statecode").Value == 0)
                    && e.GetAttributeValue<EntityReference>("cr664_coreuser") != null)
                .ToList();
            if (rows.Count != 1) Deny("The initiating user must resolve to exactly one active linked platform/core identity.");
            var coreUserId = rows[0].GetAttributeValue<EntityReference>("cr664_coreuser").Id;
            var coreUser = service.Retrieve("cr664_user", coreUserId, new ColumnSet("cr664_email", "cr664_activeaccessflag", "statecode"));
            if (coreUser.GetAttributeValue<bool?>("cr664_activeaccessflag") != true
                || (coreUser.GetAttributeValue<OptionSetValue>("statecode") != null
                    && coreUser.GetAttributeValue<OptionSetValue>("statecode").Value != 0)
                || !EmailsEqual(email, coreUser.GetAttributeValue<string>("cr664_email")))
                Deny("The initiating user's linked core identity must be active and match the Dataverse user email.");
            return new Actor(email, coreUserId);
        }

        private static Entity ResolveBanker(IOrganizationService service, Actor actor)
        {
            var query = new QueryExpression(Banker)
            {
                ColumnSet = new ColumnSet("cr664_email", "cr664_activeflag", "cr664_userloginmapping",
                    "cr664_approvallimit", "cr664_creditcommitteemember", "cr664_approvaloverrideauthority", "statecode"),
                TopCount = 2,
            };
            query.Criteria.AddCondition("cr664_email", ConditionOperator.Equal, actor.Email);
            var rows = service.RetrieveMultiple(query).Entities
                .Where(e => e.GetAttributeValue<bool?>("cr664_activeflag") == true
                    && (e.GetAttributeValue<OptionSetValue>("statecode") == null
                        || e.GetAttributeValue<OptionSetValue>("statecode").Value == 0)
                    && e.GetAttributeValue<EntityReference>("cr664_userloginmapping")?.Id == actor.CoreUserId)
                .ToList();
            if (rows.Count != 1)
                Deny("The initiating user must resolve to exactly one active banker profile linked to the same core identity.");
            return rows[0];
        }

        private static Entity ResolveDeal(IOrganizationService service, string dealId)
        {
            Guid id;
            if (!Guid.TryParse(dealId, out id)) Deny("Deal Id must be a Dataverse GUID.");
            try
            {
                return service.Retrieve(LoanDeal, id, new ColumnSet("cr664_amount", "cr664_assignedbanker", "cr664_statusreference"));
            }
            catch (Exception)
            {
                Deny("The governed deal could not be resolved.");
                return null;
            }
        }

        private static void ValidateOptionalSupersession(IOrganizationService service, Entity target, Entity deal, string entity, string idField, string supersedesField)
        {
            var id = Text(target, supersedesField);
            if (string.IsNullOrWhiteSpace(id)) return;
            if (!SameDeal(ResolveSuperseded(service, entity, idField, id), deal))
                Deny("A superseding record must reference prior history for the same deal.");
        }

        private static Entity ResolveSuperseded(IOrganizationService service, string entity, string idField, string value)
        {
            var query = new QueryExpression(entity) { ColumnSet = new ColumnSet(true), TopCount = 2 };
            query.Criteria.AddCondition(idField, ConditionOperator.Equal, value);
            var rows = service.RetrieveMultiple(query).Entities;
            if (rows.Count != 1) Deny("The superseded record could not be resolved uniquely.");
            return rows[0];
        }

        private static bool Any(IOrganizationService service, string entity, string field, string value, Func<Entity, bool> predicate)
        {
            var query = new QueryExpression(entity) { ColumnSet = new ColumnSet(true) };
            query.Criteria.AddCondition(field, ConditionOperator.Equal, value);
            return service.RetrieveMultiple(query).Entities.Any(predicate);
        }

        private static bool SameDeal(Entity row, Entity deal)
        {
            Guid id;
            return Guid.TryParse(Text(row, "cr664_dealid"), out id) && id == deal.Id;
        }

        private static Entity RequireTarget(IPluginExecutionContext context)
        {
            Entity target = null;
            if (!context.InputParameters.Contains("Target") || (target = context.InputParameters["Target"] as Entity) == null)
                Deny("The governed operation has no target record.");
            return target;
        }

        private static Entity RequirePreImage(IPluginExecutionContext context)
        {
            if (!context.PreEntityImages.Contains("PreImage")) Deny("The governed update has no PreImage.");
            return context.PreEntityImages["PreImage"];
        }

        private static void RequireCorrelation(Entity target)
        {
            var id = RequireText(target, "cr664_correlationid", "Correlation Id");
            Guid parsed;
            var normalized = id;
            var separator = id.IndexOf('-');
            if (separator > 0 && id.Length - separator - 1 == 36) normalized = id.Substring(separator + 1);
            if (!Guid.TryParse(normalized, out parsed)) Deny("Correlation Id must contain a valid GUID.");
        }

        private static string RequireMember(Entity target, string field, HashSet<string> values)
        {
            var value = RequireText(target, field, field);
            if (!values.Contains(value)) Deny("The governed status/type value is not permitted.");
            return value;
        }

        private static string RequireEmail(Entity target, string field)
        {
            var value = NormalizeEmail(RequireText(target, field, field));
            if (value.IndexOf('@') <= 0) Deny("A valid actor email is required.");
            return value;
        }

        private static void RequireActor(Entity target, string field, Actor actor)
        {
            if (!EmailsEqual(RequireEmail(target, field), actor.Email))
                Deny("The recorded actor must match the initiating Dataverse user.");
        }

        private static void RequireEffectiveActor(Entity target, string field, Actor actor)
        {
            RequireActor(target, field, actor);
        }

        private static string RequireText(Entity entity, string field, string label)
        {
            var value = Text(entity, field);
            if (string.IsNullOrWhiteSpace(value)) Deny(label + " is required.");
            return value.Trim();
        }

        private static string Text(Entity entity, string field)
        {
            return entity != null && entity.Contains(field) ? Convert.ToString(entity[field], CultureInfo.InvariantCulture)?.Trim() : null;
        }

        private static string EffectiveText(Entity pre, Entity target, string field)
        {
            return target.Contains(field) ? Text(target, field) : Text(pre, field);
        }

        private static decimal? DecimalValue(Entity entity, string field)
        {
            if (entity == null || !entity.Contains(field) || entity[field] == null) return null;
            var money = entity[field] as Money;
            if (money != null) return money.Value;
            return Convert.ToDecimal(entity[field], CultureInfo.InvariantCulture);
        }

        private static decimal? EffectiveDecimal(Entity pre, Entity target, string field)
        {
            return target.Contains(field) ? DecimalValue(target, field) : DecimalValue(pre, field);
        }

        private static decimal? MoneyOrDecimal(Entity entity, string field) { return DecimalValue(entity, field); }

        private static bool? EffectiveBool(Entity pre, Entity target, string field)
        {
            var source = target.Contains(field) ? target : pre;
            return source.Contains(field) ? source.GetAttributeValue<bool?>(field) : null;
        }

        private static void ValidateApprovedAmount(decimal? amount, decimal? facility)
        {
            if (!amount.HasValue || amount.Value <= 0) Deny("Approved amount must be positive.");
            if (!facility.HasValue || amount.Value > facility.Value) Deny("Approved amount exceeds the governed facility amount.");
        }

        private static void EnsureImmutableFundingFields(Entity pre, Entity target)
        {
            var immutable = Set("cr664_recordid", "cr664_dealid", "cr664_requestedamount", "cr664_requestedby",
                "cr664_requestedat", "cr664_correlationid", "cr664_supersedesrecordid");
            foreach (var field in target.Attributes.Keys)
                if (immutable.Contains(field) && !Equals(pre.Contains(field) ? pre[field] : null, target[field]))
                    Deny("Funding request identity, amount, correlation, and history-link fields are immutable.");
        }

        private static string NormalizeEmail(string email) { return (email ?? "").Trim().ToLowerInvariant(); }
        private static bool EmailsEqual(string a, string b) { return NormalizeEmail(a) == NormalizeEmail(b); }
        private static HashSet<string> Set(params string[] values) { return new HashSet<string>(values, StringComparer.OrdinalIgnoreCase); }

        private static void Deny(string message) { throw new InvalidPluginExecutionException(message); }

        private sealed class Actor
        {
            public Actor(string email, Guid coreUserId) { Email = email; CoreUserId = coreUserId; }
            public string Email { get; private set; }
            public Guid CoreUserId { get; private set; }
        }
    }
}
