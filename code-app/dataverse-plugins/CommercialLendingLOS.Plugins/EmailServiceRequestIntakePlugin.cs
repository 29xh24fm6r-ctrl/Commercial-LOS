using System;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace CommercialLendingLOS.Plugins
{
    /// <summary>
    /// Transactional main-operation host for cr664_ProcessInboundServiceRequest.
    /// Outlook and Copilot provide facts/classification; this host alone decides
    /// whether an assigned LOS task may be created. Native deterministic GUIDs
    /// make concurrent duplicate delivery fail closed without alternate keys.
    /// </summary>
    public sealed class EmailServiceRequestIntakePlugin : IPlugin
    {
        public const string MessageName = "cr664_ProcessInboundServiceRequest";
        private const string IntakeTable = "cr664_emailservicerequestintake";
        private const string PermissionTable = "cr664_emailautomationpermission";
        private const string TaskTable = "cr664_dealtask1";
        private const string DealTable = "cr664_loandeal";
        private const string AuditTable = "cr664_auditevent";
        private const string TimelineTable = "cr664_dealtimelineevent";

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var trace = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            if (context == null || !string.Equals(context.MessageName, MessageName, StringComparison.OrdinalIgnoreCase))
                Deny("MESSAGE_INVALID", "The email-intake host accepts only its registered Custom API message.");
            if (context.Stage != 30 || context.Mode != 0)
                Deny("REGISTRATION_INVALID", "Email intake must run synchronously as the Custom API main operation.");
            if (context.InitiatingUserId == Guid.Empty)
                Deny("ACTOR_UNRESOLVED", "The authenticated service actor is unavailable.");

            var correlationId = RequiredGuid(context.InputParameters, "CorrelationId");
            var mailboxId = RequiredString(context.InputParameters, "MailboxId").ToLowerInvariant();
            var messageId = RequiredString(context.InputParameters, "InternetMessageId");
            var contentHash = RequiredSha256(context.InputParameters, "ContentHash");
            var sender = RequiredString(context.InputParameters, "SenderAddress").ToLowerInvariant();
            var receivedAt = RequiredDate(context.InputParameters, "ReceivedAt");
            var subject = RequiredString(context.InputParameters, "Subject", 500);
            var category = RequiredString(context.InputParameters, "Category", 80).ToLowerInvariant();
            var confidence = RequiredDecimal(context.InputParameters, "Confidence");
            var isServiceRequest = RequiredBool(context.InputParameters, "IsServiceRequest");
            var suspicious = RequiredBool(context.InputParameters, "SuspiciousContent");
            var usedProtectedCharacteristic = RequiredBool(context.InputParameters, "UsedProtectedCharacteristic");
            var matchStatus = RequiredString(context.InputParameters, "MatchStatus", 40).ToLowerInvariant();
            var dealId = OptionalGuid(context.InputParameters, "DealId");
            var assigneeId = OptionalGuid(context.InputParameters, "AssigneeSystemUserId");
            var requestedDueAt = OptionalDate(context.InputParameters, "RequestedDueAt");
            var suggestedTitle = OptionalString(context.InputParameters, "SuggestedTaskTitle", 200);
            var rationale = OptionalString(context.InputParameters, "Rationale", 2000);
            var hasAttachments = RequiredBool(context.InputParameters, "HasAttachments");
            if (confidence < 0m || confidence > 1m) Deny("CLASSIFICATION_INVALID", "Classification confidence must be between zero and one.");

            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var service = factory.CreateOrganizationService(context.InitiatingUserId);
            var actor = service.Retrieve("systemuser", context.InitiatingUserId, new ColumnSet("isdisabled", "internalemailaddress"));
            if (actor.GetAttributeValue<bool>("isdisabled")) Deny("ACTOR_DISABLED", "The authenticated service actor is disabled.");
            var permission = ResolvePermission(service, context.InitiatingUserId, mailboxId, DateTime.UtcNow);

            var idempotencyKey = Sha256(mailboxId + "|" + messageId);
            var intakeId = DeterministicGuid("email-intake|" + idempotencyKey);
            var existing = TryRetrieve(service, IntakeTable, intakeId, new ColumnSet("cr664_contenthash", "cr664_task"));
            if (existing != null)
            {
                if (!string.Equals(existing.GetAttributeValue<string>("cr664_contenthash"), contentHash, StringComparison.OrdinalIgnoreCase))
                    Deny("MESSAGE_ID_CONFLICT", "The message identity already exists with different content.");
                context.OutputParameters["ResultJson"] = Result("duplicate", correlationId, intakeId, existing.GetAttributeValue<EntityReference>("cr664_task")?.Id);
                return;
            }

            var status = "TRIAGE_REQUIRED";
            var reason = "Human triage is required.";
            var autoCreate = permission.GetAttributeValue<bool>("cr664_automatictaskcreation");
            var minimumConfidence = permission.GetAttributeValue<decimal?>("cr664_minimumconfidence") ?? 1m;
            var maxAgeHours = permission.GetAttributeValue<int?>("cr664_maximumagehours") ?? 24;
            var defaultDueHours = permission.GetAttributeValue<int?>("cr664_defaultduehours") ?? 24;
            var allowed = (permission.GetAttributeValue<string>("cr664_allowedcategoriescsv") ?? "")
                .Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries).Select(value => value.Trim().ToLowerInvariant()).ToArray();
            if ((DateTime.UtcNow - receivedAt.ToUniversalTime()).TotalHours > maxAgeHours)
                Deny("MESSAGE_TOO_OLD", "The inbound message is outside the authorized processing window.");
            if (usedProtectedCharacteristic)
                Deny("PROTECTED_CHARACTERISTIC_REJECTED", "A protected characteristic cannot be used in service-request classification.");
            if (!isServiceRequest) { status = "IGNORED"; reason = "The message is not a service request."; }
            else if (suspicious) reason = "Suspicious content requires human review.";
            else if (confidence < minimumConfidence) reason = "Classification confidence is below the automatic-task threshold.";
            else if (!allowed.Contains(category)) reason = "The category is not approved for automatic task creation.";
            else if (!autoCreate) reason = "Automatic task creation is disabled by policy.";
            else if (!string.Equals(matchStatus, "unique", StringComparison.Ordinal) || !dealId.HasValue || !assigneeId.HasValue)
                reason = "A unique authorized deal and assignee match is required.";
            else { status = "TASK_AUTHORIZED"; reason = "Deterministic policy authorized monitored-task creation."; }

            var intake = new Entity(IntakeTable, intakeId)
            {
                ["cr664_name"] = subject,
                ["cr664_correlationid"] = correlationId.ToString("D"),
                ["cr664_idempotencykey"] = idempotencyKey,
                ["cr664_contenthash"] = contentHash,
                ["cr664_mailboxid"] = mailboxId,
                ["cr664_internetmessageidhash"] = Sha256(messageId),
                ["cr664_senderaddress"] = sender,
                ["cr664_receivedat"] = receivedAt,
                ["cr664_subject"] = subject,
                ["cr664_hasattachments"] = hasAttachments,
                ["cr664_category"] = category,
                ["cr664_confidence"] = confidence,
                ["cr664_classificationrationale"] = rationale,
                ["cr664_status"] = status,
                ["cr664_statusreason"] = reason,
                ["cr664_serviceactor"] = actor.ToEntityReference(),
                ["cr664_evaluationhash"] = Sha256(string.Join("|", idempotencyKey, contentHash, category, confidence.ToString(CultureInfo.InvariantCulture), status, reason))
            };
            if (dealId.HasValue) intake["cr664_deal"] = new EntityReference(DealTable, dealId.Value);
            if (assigneeId.HasValue) intake["cr664_assignee"] = new EntityReference("systemuser", assigneeId.Value);
            try { service.Create(intake); }
            catch (Exception ex)
            {
                var raced = TryRetrieve(service, IntakeTable, intakeId, new ColumnSet("cr664_contenthash", "cr664_task"));
                if (raced != null && string.Equals(raced.GetAttributeValue<string>("cr664_contenthash"), contentHash, StringComparison.OrdinalIgnoreCase))
                {
                    context.OutputParameters["ResultJson"] = Result("duplicate", correlationId, intakeId, raced.GetAttributeValue<EntityReference>("cr664_task")?.Id);
                    return;
                }
                trace?.Trace("Email intake atomic claim failed type={0}", ex.GetType().FullName);
                Deny("IDEMPOTENCY_CLAIM_FAILED", "The inbound message could not be claimed transactionally.");
            }

            Guid? taskId = null;
            if (status == "TASK_AUTHORIZED")
            {
                service.Retrieve(DealTable, dealId.Value, new ColumnSet(false));
                service.Retrieve("systemuser", assigneeId.Value, new ColumnSet("isdisabled"));
                var dueAt = requestedDueAt.HasValue && requestedDueAt.Value >= DateTime.UtcNow
                    ? requestedDueAt.Value : DateTime.UtcNow.AddHours(defaultDueHours);
                taskId = DeterministicGuid("email-task|" + idempotencyKey);
                var task = new Entity(TaskTable, taskId.Value)
                {
                    ["cr664_taskname"] = string.IsNullOrWhiteSpace(suggestedTitle) ? "Review service request: " + subject : suggestedTitle,
                    ["cr664_completed"] = false,
                    ["cr664_duedate"] = dueAt,
                    ["cr664_assignedto"] = new EntityReference("systemuser", assigneeId.Value),
                    ["cr664_deal"] = new EntityReference(DealTable, dealId.Value)
                };
                service.Create(task);
                var coreUser = permission.GetAttributeValue<EntityReference>("cr664_coreuser");
                if (coreUser == null || coreUser.LogicalName != "cr664_user") Deny("AUDIT_ACTOR_UNRESOLVED", "The service actor has no approved core-user audit identity.");
                CreateEvidence(service, correlationId, intakeId, taskId.Value, dealId.Value, coreUser, subject, reason);
                service.Update(new Entity(IntakeTable, intakeId) { ["cr664_status"] = "TASK_CREATED", ["cr664_task"] = new EntityReference(TaskTable, taskId.Value) });
                status = "task-created";
            }
            else status = status == "IGNORED" ? "ignored" : "triage-required";

            context.OutputParameters["ResultJson"] = Result(status, correlationId, intakeId, taskId);
            trace?.Trace("Email service request complete status={0} intake={1} task={2}", status, intakeId, taskId);
        }

        private static Entity ResolvePermission(IOrganizationService service, Guid actorId, string mailboxId, DateTime now)
        {
            var query = new QueryExpression(PermissionTable) { ColumnSet = new ColumnSet(true) };
            query.Criteria.AddCondition("cr664_serviceactor", ConditionOperator.Equal, actorId);
            query.Criteria.AddCondition("cr664_mailboxid", ConditionOperator.Equal, mailboxId);
            var rows = service.RetrieveMultiple(query).Entities.Where(row =>
            {
                if (row.Contains("statecode") && row.GetAttributeValue<OptionSetValue>("statecode")?.Value != 0) return false;
                var from = row.GetAttributeValue<DateTime?>("cr664_effectivefrom");
                var through = row.GetAttributeValue<DateTime?>("cr664_effectivethrough");
                return (!from.HasValue || from <= now) && (!through.HasValue || through >= now);
            }).ToList();
            if (rows.Count != 1) Deny(rows.Count == 0 ? "EMAIL_PERMISSION_MISSING" : "EMAIL_PERMISSION_AMBIGUOUS", "Exactly one effective mailbox permission is required.");
            return rows[0];
        }

        private static void CreateEvidence(IOrganizationService service, Guid correlationId, Guid intakeId, Guid taskId, Guid dealId, EntityReference coreUser, string subject, string reason)
        {
            service.Create(new Entity(AuditTable, DeterministicGuid("email-audit|" + intakeId))
            {
                ["cr664_auditeventname"] = "Email Service Request Task Created", ["cr664_eventcategory"] = new OptionSetValue(788190002),
                ["cr664_eventtype"] = new OptionSetValue(788190002), ["cr664_entitytype"] = new OptionSetValue(788190000),
                ["cr664_entityid"] = taskId.ToString("D"), ["cr664_relatedentitytype"] = TaskTable,
                ["cr664_relatedentityid"] = taskId.ToString("D"), ["cr664_loandeal"] = new EntityReference(DealTable, dealId),
                ["cr664_outcomestatus"] = new OptionSetValue(788190000), ["cr664_changeddate"] = DateTime.UtcNow,
                ["cr664_changedby"] = coreUser, ["cr664_fieldname"] = "cr664_taskname", ["cr664_oldvalue"] = "",
                ["cr664_newvalue"] = subject, ["cr664_beforestate"] = "No task", ["cr664_afterstate"] = "Monitored task created",
                ["cr664_notes"] = reason, ["cr664_sourcescreensourceprocess"] = "Copilot/Outlook/ServiceRequestIntake",
                ["cr664_correlationid"] = correlationId.ToString("D")
            });
            service.Create(new Entity(TimelineTable, DeterministicGuid("email-timeline|" + intakeId))
            {
                ["cr664_title"] = "Email service request task created", ["cr664_summary"] = reason,
                ["cr664_eventat"] = DateTime.UtcNow, ["cr664_eventtype"] = new OptionSetValue(788190004),
                ["cr664_visibilityscope"] = new OptionSetValue(788190000), ["cr664_issystemgenerated"] = true,
                ["cr664_relatedentitytype"] = TaskTable, ["cr664_relatedentityid"] = taskId.ToString("D"),
                ["cr664_deal"] = new EntityReference(DealTable, dealId), ["cr664_eventby"] = coreUser,
                ["cr664_eventsubtype"] = "correlation:" + correlationId.ToString("D")
            });
        }

        private static Entity TryRetrieve(IOrganizationService service, string table, Guid id, ColumnSet columns)
        { try { return service.Retrieve(table, id, columns); } catch { return null; } }
        private static string Result(string status, Guid correlationId, Guid intakeId, Guid? taskId) =>
            "{\"status\":\"" + status + "\",\"correlationId\":\"" + correlationId.ToString("D") + "\",\"intakeId\":\"" + intakeId.ToString("D") + "\",\"taskId\":" + (taskId.HasValue ? "\"" + taskId.Value.ToString("D") + "\"" : "null") + "}";
        private static string RequiredString(ParameterCollection p, string key, int max = 500) { var value = p.Contains(key) ? Convert.ToString(p[key], CultureInfo.InvariantCulture)?.Trim() : null; if (string.IsNullOrWhiteSpace(value) || value.Length > max) Deny("INPUT_INVALID", key + " is missing or invalid."); return value; }
        private static string OptionalString(ParameterCollection p, string key, int max) { var value = p.Contains(key) ? Convert.ToString(p[key], CultureInfo.InvariantCulture)?.Trim() : null; if (value != null && value.Length > max) Deny("INPUT_INVALID", key + " is too long."); return value ?? ""; }
        private static Guid RequiredGuid(ParameterCollection p, string key) { Guid value = Guid.Empty; if (!p.Contains(key) || !Guid.TryParse(Convert.ToString(p[key]), out value) || value == Guid.Empty) Deny("INPUT_INVALID", key + " is invalid."); return value; }
        private static Guid? OptionalGuid(ParameterCollection p, string key) { if (!p.Contains(key) || p[key] == null || string.IsNullOrWhiteSpace(Convert.ToString(p[key]))) return null; Guid value; if (!Guid.TryParse(Convert.ToString(p[key]), out value) || value == Guid.Empty) Deny("INPUT_INVALID", key + " is invalid."); return value; }
        private static bool RequiredBool(ParameterCollection p, string key) { if (!p.Contains(key) || !(p[key] is bool)) Deny("INPUT_INVALID", key + " is invalid."); return p.Contains(key) && p[key] is bool && (bool)p[key]; }
        private static decimal RequiredDecimal(ParameterCollection p, string key) { try { return Convert.ToDecimal(p[key], CultureInfo.InvariantCulture); } catch { Deny("INPUT_INVALID", key + " is invalid."); return 0; } }
        private static DateTime RequiredDate(ParameterCollection p, string key) { DateTime value = default(DateTime); if (!p.Contains(key) || !DateTime.TryParse(Convert.ToString(p[key], CultureInfo.InvariantCulture), CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal, out value)) Deny("INPUT_INVALID", key + " is invalid."); return value.ToUniversalTime(); }
        private static DateTime? OptionalDate(ParameterCollection p, string key) { if (!p.Contains(key) || p[key] == null || string.IsNullOrWhiteSpace(Convert.ToString(p[key]))) return null; return RequiredDate(p, key); }
        private static string RequiredSha256(ParameterCollection p, string key) { var value = RequiredString(p, key, 64).ToLowerInvariant(); if (value.Length != 64 || value.Any(c => !Uri.IsHexDigit(c))) Deny("INPUT_INVALID", key + " must be SHA-256."); return value; }
        private static string Sha256(string value) { using (var sha = SHA256.Create()) return string.Concat(sha.ComputeHash(Encoding.UTF8.GetBytes(value)).Select(b => b.ToString("x2"))); }
        private static Guid DeterministicGuid(string value) { var bytes = SHA256.Create().ComputeHash(Encoding.UTF8.GetBytes(value)); var guid = new byte[16]; Array.Copy(bytes, guid, 16); return new Guid(guid); }
        private static void Deny(string code, string message) { throw new InvalidPluginExecutionException(code + ": " + message); }
    }
}
