using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.Serialization.Json;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace CommercialLendingLOS.Plugins
{
    /// <summary>
    /// Server host for cr664_RunCreditIntelligence. It produces a permission-
    /// scoped, evidence-linked Dataverse packet for Copilot Studio. It never
    /// calls a model, trusts browser identity/authority, or performs a lending
    /// decision. Copilot Studio supplies narration and external knowledge;
    /// Dataverse remains the evidence and governance authority.
    /// </summary>
    public sealed class CreditIntelligenceCustomApiPlugin : IPlugin
    {
        public const string MessageName = "cr664_RunCreditIntelligence";
        private const string RunTable = "cr664_creditintelligencerun";
        private const string EvidenceTable = "cr664_creditevidence";
        private const string FactTable = "cr664_creditfact";
        private const string PermissionTable = "cr664_creditintelligencepermission";
        private const string DealTable = "cr664_loandeal";
        private const string EvaluationTable = "cr664_governanceevaluation";
        private static readonly HashSet<string> Tools = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "research_party", "build_credit_evidence_packet", "explain_governance_route",
            "relationship_intelligence", "portfolio_monitoring", "policy_intelligence"
        };
        private static readonly string[] DealFactColumns =
        {
            "cr664_name", "cr664_amount", "cr664_totalrelationshipexposure",
            "cr664_producttype", "cr664_riskrating", "cr664_industry", "cr664_geography",
            "cr664_policyexception", "cr664_insiderstatus", "cr664_criticizedclassifiedstatus"
        };

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            if (context == null || !string.Equals(context.MessageName, MessageName, StringComparison.OrdinalIgnoreCase))
                Deny("MESSAGE_INVALID", "The credit-intelligence host accepts only its registered Custom API message.");
            if (context.Stage != 30 || context.Mode != 0)
                Deny("REGISTRATION_INVALID", "Credit intelligence must run synchronously as the Custom API main operation.");
            if (context.InitiatingUserId == Guid.Empty)
                Deny("ACTOR_UNRESOLVED", "The authenticated Dataverse actor is unavailable.");

            var correlationId = RequiredGuid(context.InputParameters, "CorrelationId");
            var tool = RequiredString(context.InputParameters, "Tool");
            if (!Tools.Contains(tool)) Deny("TOOL_INVALID", "The requested intelligence tool is not registered.");
            var bankId = RequiredString(context.InputParameters, "BankId");
            var dealId = OptionalGuid(context.InputParameters, "DealId");
            var governanceEvaluationId = OptionalGuid(context.InputParameters, "GovernanceEvaluationId");
            var requestedSources = ParseStringArray(OptionalString(context.InputParameters, "RequestedSourceIdsJson"));
            if (requestedSources.Count != 1 || !requestedSources.Contains("dataverse-los", StringComparer.OrdinalIgnoreCase))
                Deny("SOURCE_SCOPE_INVALID", "This host accepts only the permission-scoped Dataverse LOS evidence source; external sources require their governed server connector.");

            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var service = factory.CreateOrganizationService(context.InitiatingUserId);
            var actor = service.Retrieve("systemuser", context.InitiatingUserId,
                new ColumnSet("domainname", "internalemailaddress", "isdisabled"));
            if (actor.GetAttributeValue<bool>("isdisabled"))
                Deny("ACTOR_DISABLED", "The authenticated Dataverse actor is disabled.");
            RequirePermission(service, context.InitiatingUserId, tool, bankId, DateTime.UtcNow);

            var run = new Entity(RunTable, DeterministicGuid("run|" + correlationId.ToString("D")));
            run["cr664_name"] = correlationId.ToString("D") + " | " + tool;
            run["cr664_correlationid"] = correlationId.ToString("D");
            run["cr664_tool"] = tool;
            run["cr664_actor"] = actor.ToEntityReference();
            run["cr664_bankid"] = bankId;
            run["cr664_requestedat"] = DateTime.UtcNow;
            run["cr664_status"] = "STARTED";
            if (dealId.HasValue) run["cr664_deal"] = new EntityReference(DealTable, dealId.Value);
            try { service.Create(run); }
            catch (Exception ex) { Deny("AUDIT_UNAVAILABLE", Safe(ex, "The intelligence start audit could not be persisted.")); }

            try
            {
                var evidence = new List<Dictionary<string, object>>();
                var facts = new List<Dictionary<string, object>>();
                if (dealId.HasValue)
                    AddDealEvidence(service, run.Id, dealId.Value, evidence, facts);
                if (string.Equals(tool, "explain_governance_route", StringComparison.OrdinalIgnoreCase))
                {
                    if (!governanceEvaluationId.HasValue)
                        Deny("GOVERNANCE_EVALUATION_REQUIRED", "A stored governance evaluation is required for explanation.");
                    AddGovernanceEvidence(service, run.Id, governanceEvaluationId.Value, evidence, facts);
                }
                PersistFacts(service, run.Id, facts);
                var canonical = Serialize(new Dictionary<string, object>
                {
                    { "contractVersion", "ogb-credit-intelligence/v1" },
                    { "correlationId", correlationId.ToString("D") },
                    { "tool", tool },
                    { "actorSystemUserId", context.InitiatingUserId.ToString("D") },
                    { "evidence", evidence }, { "facts", facts }
                });
                var hash = Sha256(canonical);
                service.Update(new Entity(RunTable, run.Id)
                {
                    ["cr664_status"] = "COMPLETE",
                    ["cr664_completedat"] = DateTime.UtcNow,
                    ["cr664_evaluationhash"] = hash
                });
                var response = new Dictionary<string, object>
                {
                    { "status", "complete" }, { "correlationId", correlationId.ToString("D") },
                    { "tool", tool }, { "facts", facts }, { "evidence", evidence },
                    { "contradictions", new string[0] }, { "proposals", new object[0] },
                    { "warnings", new [] { "Copilot assistance only; the governed LOS remains authoritative." } },
                    { "evaluationHash", hash }, { "auditEventIds", new [] { run.Id.ToString("D") } }
                };
                context.OutputParameters["ResultJson"] = Serialize(response);
                tracing?.Trace("CreditIntelligence complete tool={0} actor={1} run={2} hash={3}", tool, context.InitiatingUserId, run.Id, hash);
            }
            catch (InvalidPluginExecutionException)
            {
                TryMarkBlocked(service, run.Id);
                throw;
            }
            catch (Exception ex)
            {
                TryMarkBlocked(service, run.Id);
                tracing?.Trace("CreditIntelligence fail-closed type={0} message={1}", ex.GetType().FullName, ex.Message);
                Deny("INTELLIGENCE_FAILED", Safe(ex, "The governed intelligence request failed."));
            }
        }

        private static void RequirePermission(IOrganizationService service, Guid actorId, string tool, string bankId, DateTime now)
        {
            var query = new QueryExpression(PermissionTable) { ColumnSet = new ColumnSet(true) };
            query.Criteria.AddCondition("cr664_actor", ConditionOperator.Equal, actorId);
            query.Criteria.AddCondition("cr664_tool", ConditionOperator.Equal, tool);
            query.Criteria.AddCondition("cr664_bankid", ConditionOperator.Equal, bankId);
            var rows = service.RetrieveMultiple(query).Entities.Where(row =>
            {
                if (row.Contains("statecode") && row.GetAttributeValue<OptionSetValue>("statecode")?.Value != 0) return false;
                var from = row.GetAttributeValue<DateTime?>("cr664_effectivefrom");
                var through = row.GetAttributeValue<DateTime?>("cr664_effectivethrough");
                return (!from.HasValue || from.Value <= now) && (!through.HasValue || through.Value >= now);
            }).ToList();
            if (rows.Count != 1)
                Deny(rows.Count == 0 ? "TOOL_PERMISSION_MISSING" : "TOOL_PERMISSION_AMBIGUOUS",
                    "Exactly one effective intelligence permission must authorize the authenticated actor and tool.");
        }

        private static void AddDealEvidence(IOrganizationService service, Guid runId, Guid dealId,
            IList<Dictionary<string, object>> evidence, IList<Dictionary<string, object>> facts)
        {
            var deal = service.Retrieve(DealTable, dealId, new ColumnSet(DealFactColumns));
            var retrievedAt = DateTime.UtcNow;
            var sourceSnapshot = new SortedDictionary<string, object>(StringComparer.Ordinal);
            foreach (var column in DealFactColumns)
                if (deal.Contains(column)) sourceSnapshot[column] = Primitive(deal[column]);
            var contentHash = Sha256(Serialize(sourceSnapshot));
            var evidenceId = DeterministicGuid("evidence|" + runId.ToString("D") + "|deal|" + dealId.ToString("D"));
            service.Create(new Entity(EvidenceTable, evidenceId)
            {
                ["cr664_name"] = "Dataverse deal " + dealId.ToString("D"),
                ["cr664_run"] = new EntityReference(RunTable, runId),
                ["cr664_sourceid"] = "dataverse-los",
                ["cr664_sourcetype"] = "dataverse",
                ["cr664_sourcerecordid"] = dealId.ToString("D"),
                ["cr664_locator"] = "dataverse:" + DealTable + "/" + dealId.ToString("D"),
                ["cr664_retrievedat"] = retrievedAt,
                ["cr664_contenthash"] = contentHash,
                ["cr664_permissionbasis"] = "Initiating-user Dataverse row access"
            });
            evidence.Add(new Dictionary<string, object>
            {
                { "evidenceId", evidenceId.ToString("D") }, { "sourceId", "dataverse-los" },
                { "sourceKind", "dataverse" }, { "recordId", dealId.ToString("D") },
                { "title", "Authorized deal snapshot" }, { "locator", "dataverse:" + DealTable + "/" + dealId.ToString("D") },
                { "retrievedAt", retrievedAt.ToString("o", CultureInfo.InvariantCulture) }, { "contentHash", contentHash },
                { "permissionBasis", "Initiating-user Dataverse row access" }, { "freshness", "current" }
            });
            foreach (var pair in sourceSnapshot)
                facts.Add(new Dictionary<string, object>
                {
                    { "factId", DeterministicGuid("fact|" + evidenceId + "|" + pair.Key).ToString("D") },
                    { "name", pair.Key }, { "value", pair.Value }, { "classification", "crm_provided_fact" },
                    { "evidenceIds", new [] { evidenceId.ToString("D") } }, { "requiresHumanVerification", false }
                });
        }

        private static void AddGovernanceEvidence(IOrganizationService service, Guid runId, Guid evaluationId,
            IList<Dictionary<string, object>> evidence, IList<Dictionary<string, object>> facts)
        {
            var row = service.Retrieve(EvaluationTable, evaluationId,
                new ColumnSet("cr664_decision", "cr664_policyid", "cr664_policyversion", "cr664_action", "cr664_findingsjson", "cr664_evaluationhash"));
            var hash = row.GetAttributeValue<string>("cr664_evaluationhash");
            if (string.IsNullOrWhiteSpace(hash)) Deny("GOVERNANCE_EVIDENCE_INVALID", "The stored governance evaluation lacks its immutable hash.");
            var evidenceId = DeterministicGuid("evidence|" + runId.ToString("D") + "|governance|" + evaluationId.ToString("D"));
            evidence.Add(new Dictionary<string, object>
            {
                { "evidenceId", evidenceId.ToString("D") }, { "sourceId", "dataverse-los" }, { "sourceKind", "dataverse" },
                { "recordId", evaluationId.ToString("D") }, { "title", "Authoritative governance evaluation" },
                { "locator", "dataverse:" + EvaluationTable + "/" + evaluationId.ToString("D") },
                { "retrievedAt", DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture) }, { "contentHash", hash },
                { "permissionBasis", "Initiating-user Dataverse row access" }, { "freshness", "current" }
            });
            foreach (var name in new [] { "cr664_decision", "cr664_policyid", "cr664_policyversion", "cr664_action", "cr664_findingsjson" })
                if (row.Contains(name)) facts.Add(new Dictionary<string, object>
                {
                    { "factId", DeterministicGuid("fact|" + evidenceId + "|" + name).ToString("D") },
                    { "name", name }, { "value", Primitive(row[name]) }, { "classification", "verified_source_fact" },
                    { "evidenceIds", new [] { evidenceId.ToString("D") } }, { "requiresHumanVerification", false }
                });
        }

        private static void PersistFacts(IOrganizationService service, Guid runId,
            IEnumerable<Dictionary<string, object>> facts)
        {
            foreach (var fact in facts)
            {
                var factId = Guid.Parse(Convert.ToString(fact["factId"], CultureInfo.InvariantCulture));
                var evidenceIds = (fact["evidenceIds"] as IEnumerable<string>) ?? Enumerable.Empty<string>();
                Guid evidenceId;
                if (!Guid.TryParse(evidenceIds.FirstOrDefault(), out evidenceId))
                    Deny("EVIDENCE_INTEGRITY_FAILED", "Every persisted fact must reference immutable evidence.");
                service.Create(new Entity(FactTable, factId)
                {
                    ["cr664_name"] = Convert.ToString(fact["name"], CultureInfo.InvariantCulture),
                    ["cr664_run"] = new EntityReference(RunTable, runId),
                    ["cr664_evidence"] = new EntityReference(EvidenceTable, evidenceId),
                    ["cr664_factname"] = Convert.ToString(fact["name"], CultureInfo.InvariantCulture),
                    ["cr664_factvaluejson"] = Serialize(fact["value"]),
                    ["cr664_factclass"] = Convert.ToString(fact["classification"], CultureInfo.InvariantCulture),
                    ["cr664_humanverificationrequired"] = Convert.ToBoolean(fact["requiresHumanVerification"], CultureInfo.InvariantCulture)
                });
            }
        }

        private static object Primitive(object value)
        {
            var money = value as Money; if (money != null) return money.Value;
            var option = value as OptionSetValue; if (option != null) return option.Value;
            var reference = value as EntityReference; if (reference != null) return reference.Id.ToString("D");
            var date = value as DateTime?; if (date.HasValue) return date.Value.ToUniversalTime().ToString("o", CultureInfo.InvariantCulture);
            return value;
        }
        private static Guid RequiredGuid(ParameterCollection values, string name) { var value = OptionalGuid(values, name); if (!value.HasValue) Deny("INPUT_INVALID", name + " is required."); return value.Value; }
        private static Guid? OptionalGuid(ParameterCollection values, string name) { if (!values.Contains(name) || values[name] == null) return null; Guid parsed; return Guid.TryParse(Convert.ToString(values[name], CultureInfo.InvariantCulture), out parsed) && parsed != Guid.Empty ? parsed : (Guid?)null; }
        private static string RequiredString(ParameterCollection values, string name) { var value = OptionalString(values, name); if (string.IsNullOrWhiteSpace(value)) Deny("INPUT_INVALID", name + " is required."); return value.Trim(); }
        private static string OptionalString(ParameterCollection values, string name) { return values.Contains(name) ? Convert.ToString(values[name], CultureInfo.InvariantCulture) : null; }
        private static List<string> ParseStringArray(string value) { if (string.IsNullOrWhiteSpace(value)) return new List<string>(); using (var stream = new MemoryStream(Encoding.UTF8.GetBytes(value))) return ((string[])new DataContractJsonSerializer(typeof(string[])).ReadObject(stream)).ToList(); }
        private static string Serialize(object value)
        {
            var builder = new StringBuilder();
            WriteJson(builder, value);
            return builder.ToString();
        }

        private static void WriteJson(StringBuilder builder, object value)
        {
            if (value == null) { builder.Append("null"); return; }
            var text = value as string;
            if (text != null) { WriteJsonString(builder, text); return; }
            if (value is Guid || value is DateTime)
            {
                WriteJsonString(builder, Convert.ToString(value, CultureInfo.InvariantCulture));
                return;
            }
            if (value is bool) { builder.Append((bool)value ? "true" : "false"); return; }
            if (value is byte || value is sbyte || value is short || value is ushort || value is int || value is uint ||
                value is long || value is ulong || value is float || value is double || value is decimal)
            {
                builder.Append(Convert.ToString(value, CultureInfo.InvariantCulture));
                return;
            }
            var dictionary = value as System.Collections.IDictionary;
            if (dictionary != null)
            {
                builder.Append('{');
                var keys = dictionary.Keys.Cast<object>().Select(item => Convert.ToString(item, CultureInfo.InvariantCulture))
                    .OrderBy(item => item, StringComparer.Ordinal).ToArray();
                for (var index = 0; index < keys.Length; index++)
                {
                    if (index > 0) builder.Append(',');
                    WriteJsonString(builder, keys[index]); builder.Append(':'); WriteJson(builder, dictionary[keys[index]]);
                }
                builder.Append('}');
                return;
            }
            var sequence = value as System.Collections.IEnumerable;
            if (sequence != null)
            {
                builder.Append('['); var first = true;
                foreach (var item in sequence) { if (!first) builder.Append(','); WriteJson(builder, item); first = false; }
                builder.Append(']');
                return;
            }
            WriteJsonString(builder, Convert.ToString(value, CultureInfo.InvariantCulture));
        }

        private static void WriteJsonString(StringBuilder builder, string value)
        {
            builder.Append('"');
            foreach (var character in value ?? string.Empty)
            {
                switch (character)
                {
                    case '"': builder.Append("\\\""); break;
                    case '\\': builder.Append("\\\\"); break;
                    case '\b': builder.Append("\\b"); break;
                    case '\f': builder.Append("\\f"); break;
                    case '\n': builder.Append("\\n"); break;
                    case '\r': builder.Append("\\r"); break;
                    case '\t': builder.Append("\\t"); break;
                    default:
                        if (character < 32) builder.Append("\\u").Append(((int)character).ToString("x4", CultureInfo.InvariantCulture));
                        else builder.Append(character);
                        break;
                }
            }
            builder.Append('"');
        }

        private static string Sha256(string value) { using (var sha = SHA256.Create()) return string.Concat(sha.ComputeHash(Encoding.UTF8.GetBytes(value)).Select(item => item.ToString("x2", CultureInfo.InvariantCulture))); }
        private static Guid DeterministicGuid(string value) { using (var sha = SHA256.Create()) { var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(value)).Take(16).ToArray(); bytes[7] = (byte)((bytes[7] & 0x0f) | 0x50); bytes[8] = (byte)((bytes[8] & 0x3f) | 0x80); return new Guid(bytes); } }
        private static void TryMarkBlocked(IOrganizationService service, Guid runId) { try { service.Update(new Entity(RunTable, runId) { ["cr664_status"] = "BLOCKED", ["cr664_completedat"] = DateTime.UtcNow }); } catch { } }
        private static string Safe(Exception error, string fallback) { return error is InvalidPluginExecutionException ? error.Message : fallback; }
        private static void Deny(string code, string message) { throw new InvalidPluginExecutionException(code + ": " + message); }
    }
}
