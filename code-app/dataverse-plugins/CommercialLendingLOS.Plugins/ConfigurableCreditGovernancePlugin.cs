using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.Serialization.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace CommercialLendingLOS.Plugins
{
    /// <summary>
    /// Registered, synchronous server host for the configurable credit-governance engine.
    /// Each step supplies an explicit bank/action configuration. The host resolves all
    /// identity, policy, authority, evidence, and case data from Dataverse using the
    /// authenticated InitiatingUserId; client claims are never trusted.
    /// </summary>
    public sealed class ConfigurableCreditGovernancePlugin : IPlugin
    {
        private readonly string bankId;
        private readonly GovernedCreditAction action;

        public ConfigurableCreditGovernancePlugin()
        {
            bankId = null;
        }

        public ConfigurableCreditGovernancePlugin(string unsecureConfiguration, string secureConfiguration)
        {
            var values = ParseConfiguration(unsecureConfiguration);
            bankId = Required(values, "bankId");
            GovernedCreditAction parsed;
            if (!Enum.TryParse(Required(values, "action"), true, out parsed))
                throw new InvalidPluginExecutionException("CONFIGURATION_INVALID: unknown governance action.");
            action = parsed;
            if (!string.IsNullOrWhiteSpace(secureConfiguration))
                throw new InvalidPluginExecutionException("CONFIGURATION_INVALID: secure configuration is not supported.");
        }

        public void Execute(IServiceProvider serviceProvider)
        {
            if (string.IsNullOrWhiteSpace(bankId))
                Deny("CONFIGURATION_MISSING", "The configurable governance step has no bank/action configuration.");
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            if (context == null || (context.Stage != 10 && context.Stage != 20 && context.Stage != 40) || context.Mode != 0)
                Deny("REGISTRATION_INVALID", "Configurable governance must run synchronously in PreValidation or PostOperation.");
            if (!string.Equals(context.MessageName, "Create", StringComparison.OrdinalIgnoreCase) &&
                !string.Equals(context.MessageName, "Update", StringComparison.OrdinalIgnoreCase))
                Deny("MESSAGE_INVALID", "The configurable governance host accepts only Create or Update.");
            var target = context.InputParameters.Contains("Target")
                ? context.InputParameters["Target"] as Entity
                : null;
            if (target == null) Deny("TARGET_MISSING", "The governed write target is unavailable.");

            var service = ((IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory)))
                .CreateOrganizationService(context.InitiatingUserId);
            var source = Merge(target, context.PreEntityImages.Contains("PreImage")
                ? context.PreEntityImages["PreImage"]
                : null);
            var repository = new DataverseBankCreditGovernanceRepository(
                service, bankId, context.InitiatingUserId, context.CorrelationId, source);
            var caseId = repository.ResolveLoanDealId();
            var stableOperationId = StableOperationId(
                bankId, action, context.PrimaryEntityName, target, source, caseId);
            var evaluationId = stableOperationId.ToString("N") + "-" + action;
            if (context.Stage == 40 && action != GovernedCreditAction.Originate)
            {
                repository.AppendActionEvidence(
                    action,
                    caseId,
                    context.PrimaryEntityName,
                    target.Id,
                    evaluationId);
                return;
            }
            var command = new ServerGovernanceEvaluationCommand
            {
                ContractVersion = ServerGovernanceEvaluationCommand.SupportedContractVersion,
                EvaluationId = evaluationId,
                BankId = bankId,
                CaseId = caseId.ToString("D"),
                Action = action,
                ActorSystemUserId = context.InitiatingUserId.ToString("D"),
                RequestedAt = DateTimeOffset.UtcNow,
                OperationCorrelationId = stableOperationId.ToString("D"),
            };
            tracing?.Trace(
                "ConfigurableCreditGovernance bank={0} action={1} deal={2} actor={3} correlation={4}",
                bankId, action, caseId, context.InitiatingUserId, context.CorrelationId);
            var response = new BankCreditGovernanceServer(repository, repository, repository)
                .Evaluate(command).GetAwaiter().GetResult();
            if (!BankCreditGovernanceServer.PermitsAction(response))
            {
                var code = response?.ReasonCode ??
                    response?.Result?.Findings?.FirstOrDefault()?.Code ??
                    "CONFIGURABLE_POLICY_BLOCKED";
                var message = response?.SafeMessage ??
                    response?.Result?.Findings?.FirstOrDefault()?.Message ??
                    "The configured bank policy blocked this action.";
                Deny(code, message);
            }
            if (context.Stage == 40)
            {
                repository.AppendActionEvidence(
                    action,
                    caseId,
                    context.PrimaryEntityName,
                    target.Id,
                    command.EvaluationId);
            }
        }

        private static Dictionary<string, string> ParseConfiguration(string value)
        {
            var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var part in (value ?? string.Empty).Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var pair = part.Split(new[] { '=' }, 2);
                if (pair.Length != 2 || string.IsNullOrWhiteSpace(pair[0]) || result.ContainsKey(pair[0].Trim()))
                    throw new InvalidPluginExecutionException("CONFIGURATION_INVALID: expected unique key=value pairs.");
                result[pair[0].Trim()] = pair[1].Trim();
            }
            return result;
        }

        private static Guid StableOperationId(
            string bank,
            GovernedCreditAction governedAction,
            string entityName,
            Entity target,
            Entity source,
            Guid caseId)
        {
            var clientCorrelation = source.GetAttributeValue<string>("cr664_correlationid");
            var operationKey = !string.IsNullOrWhiteSpace(clientCorrelation)
                ? "correlation:" + clientCorrelation.Trim().ToLowerInvariant()
                : target.Id != Guid.Empty
                    ? "record:" + target.Id.ToString("D")
                    : "case:" + caseId.ToString("D");
            var canonical = string.Join("|", new[]
            {
                bank.Trim().ToLowerInvariant(),
                governedAction.ToString().ToLowerInvariant(),
                (entityName ?? string.Empty).Trim().ToLowerInvariant(),
                operationKey,
            });
            using (var sha = SHA256.Create())
            {
                var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(canonical)).Take(16).ToArray();
                bytes[7] = (byte)((bytes[7] & 0x0f) | 0x50);
                bytes[8] = (byte)((bytes[8] & 0x3f) | 0x80);
                return new Guid(bytes);
            }
        }

        private static string Required(IDictionary<string, string> values, string key)
        {
            string value;
            if (!values.TryGetValue(key, out value) || string.IsNullOrWhiteSpace(value))
                throw new InvalidPluginExecutionException("CONFIGURATION_INVALID: missing " + key + ".");
            return value;
        }

        private static Entity Merge(Entity target, Entity preImage)
        {
            var merged = preImage == null
                ? new Entity(target.LogicalName, target.Id)
                : new Entity(preImage.LogicalName, preImage.Id);
            if (preImage != null)
                foreach (var pair in preImage.Attributes) merged[pair.Key] = pair.Value;
            foreach (var pair in target.Attributes) merged[pair.Key] = pair.Value;
            if (merged.Id == Guid.Empty) merged.Id = target.Id;
            return merged;
        }

        private static void Deny(string code, string message)
        {
            throw new InvalidPluginExecutionException(code + ": " + message);
        }
    }

    /// <summary>
    /// Dataverse adapter for all three server ports. One instance is used for one
    /// synchronous evaluation so the exact resolved profile/policy/case tokens are
    /// carried into the append-only evaluation write.
    /// </summary>
    public sealed class DataverseBankCreditGovernanceRepository :
        IBankCreditGovernancePolicyRepository,
        IBankCreditGovernanceEvidenceRepository,
        IBankCreditGovernanceEvaluationRepository
    {
        private const string ProfileTable = "cr664_creditgovernanceprofile";
        private const string PolicyTable = "cr664_creditpolicyversion";
        private const string RoleTable = "cr664_governanceroleassignment";
        private const string GrantTable = "cr664_authoritygrant";
        private const string MembershipTable = "cr664_governancecommitteemember";
        private const string ActionEvidenceTable = "cr664_governedactionevidence";
        private const string VoteTable = "cr664_governanceapprovalvote";
        private const string EvaluationTable = "cr664_governanceevaluation";
        private const string LoanDealTable = "cr664_loandeal";

        private readonly IOrganizationService service;
        private readonly string bankId;
        private readonly Guid actorId;
        private readonly Guid correlationId;
        private readonly Entity source;
        private Entity profile;
        private Entity policyRow;
        private Entity deal;
        private IDictionary<string, string> resolvedTokens;

        public DataverseBankCreditGovernanceRepository(
            IOrganizationService service,
            string bankId,
            Guid actorId,
            Guid correlationId,
            Entity source)
        {
            this.service = service ?? throw new ArgumentNullException(nameof(service));
            this.bankId = bankId;
            this.actorId = actorId;
            this.correlationId = correlationId;
            this.source = source ?? throw new ArgumentNullException(nameof(source));
        }

        public Guid ResolveLoanDealId()
        {
            if (string.Equals(source.LogicalName, LoanDealTable, StringComparison.OrdinalIgnoreCase))
            {
                if (source.Id == Guid.Empty) throw Fail("CASE_ID_MISSING", "The loan-deal ID is unavailable.");
                return source.Id;
            }
            foreach (var name in new[] { "cr664_loandeal", "cr664_originatedloandeal" })
            {
                var reference = source.GetAttributeValue<EntityReference>(name);
                if (reference != null && reference.Id != Guid.Empty) return reference.Id;
            }
            var text = source.GetAttributeValue<string>("cr664_dealid");
            Guid parsed;
            if (Guid.TryParse(text, out parsed) && parsed != Guid.Empty) return parsed;
            var boarded = source.GetAttributeValue<EntityReference>("cr664_portfolioboardedloan");
            var boardedId = boarded?.Id ??
                (string.Equals(source.LogicalName, "cr664_portfolioboardedloan", StringComparison.OrdinalIgnoreCase)
                    ? source.Id : Guid.Empty);
            if (boardedId != Guid.Empty)
            {
                var row = service.Retrieve(
                    "cr664_portfolioboardedloan", boardedId,
                    new ColumnSet("cr664_originatedloandeal"));
                var dealRef = row.GetAttributeValue<EntityReference>("cr664_originatedloandeal");
                if (dealRef != null && dealRef.Id != Guid.Empty) return dealRef.Id;
            }
            throw Fail("CASE_ID_MISSING", "The governed record is not linked to a loan deal.");
        }

        public System.Threading.Tasks.Task<ActivePolicyResolution> ResolveActivePolicy(
            string requestedBankId,
            DateTimeOffset effectiveAt)
        {
            if (!Same(requestedBankId, bankId))
                return Result(new ActivePolicyResolution { Kind = "missing" });
            var profiles = Query(ProfileTable,
                Eq("cr664_bankkey", bankId),
                Eq("cr664_profileenabled", true));
            if (profiles.Count != 1)
                return Result(new ActivePolicyResolution { Kind = "missing" });
            profile = profiles[0];
            var policies = Query(PolicyTable,
                Eq("cr664_governanceprofile", profile.Id),
                Eq("cr664_policystatus", "ACTIVE"))
                .Where(row => Effective(row, effectiveAt, "cr664_effectivefrom", "cr664_effectivethrough"))
                .ToList();
            if (policies.Count != 1)
                return Result(new ActivePolicyResolution { Kind = "missing" });
            policyRow = policies[0];
            var snapshot = policyRow.GetAttributeValue<string>("cr664_snapshotjson");
            var expectedHash = policyRow.GetAttributeValue<string>("cr664_snapshotsha256");
            if (string.IsNullOrWhiteSpace(snapshot) || !Same(Hash(snapshot), expectedHash))
                return Result(new ActivePolicyResolution { Kind = "invalid" });
            BankCreditGovernancePolicy policy;
            try
            {
                policy = Deserialize<BankCreditGovernancePolicy>(NormalizePolicyJson(snapshot));
            }
            catch
            {
                return Result(new ActivePolicyResolution { Kind = "invalid" });
            }
            if (policy == null ||
                !Same(policy.PolicyId, policyRow.GetAttributeValue<string>("cr664_policyid")) ||
                policy.Version != policyRow.GetAttributeValue<int>("cr664_versionnumber") ||
                !Same(policy.Status, "ACTIVE"))
                return Result(new ActivePolicyResolution { Kind = "invalid" });
            return Result(new ActivePolicyResolution
            {
                Kind = "resolved",
                Policy = policy,
                SnapshotId = policyRow.Id.ToString("D"),
            });
        }

        public System.Threading.Tasks.Task<GovernanceCaseResolution> ResolveCase(
            string requestedBankId,
            string caseId,
            GovernedCreditAction action,
            string actorSystemUserId,
            DateTimeOffset effectiveAt)
        {
            Guid parsedCase;
            Guid parsedActor;
            if (profile == null || !Same(requestedBankId, bankId) ||
                !Guid.TryParse(caseId, out parsedCase) ||
                !Guid.TryParse(actorSystemUserId, out parsedActor) ||
                parsedActor != actorId)
                return Result(new GovernanceCaseResolution { Kind = "failed" });
            Entity user;
            try
            {
                user = service.Retrieve("systemuser", actorId,
                    new ColumnSet("systemuserid", "isdisabled", "azureactivedirectoryobjectid"));
            }
            catch
            {
                return Result(new GovernanceCaseResolution { Kind = "actor-unresolved" });
            }
            if (user.GetAttributeValue<bool>("isdisabled") ||
                user.GetAttributeValue<Guid>("azureactivedirectoryobjectid") == Guid.Empty)
                return Result(new GovernanceCaseResolution { Kind = "actor-unresolved" });
            try
            {
                deal = service.Retrieve(LoanDealTable, parsedCase, new ColumnSet(true));
            }
            catch
            {
                return Result(new GovernanceCaseResolution { Kind = "failed" });
            }

            var roles = Query(RoleTable,
                Eq("cr664_governanceprofile", profile.Id),
                Eq("cr664_officer", actorId),
                Eq("cr664_assignmentstate", "ACTIVE"))
                .Where(row => Effective(row, effectiveAt, "cr664_effectivefrom", "cr664_effectivethrough"))
                .Select(row => row.GetAttributeValue<string>("cr664_rolecode"))
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            var grants = Query(GrantTable,
                Eq("cr664_governanceprofile", profile.Id),
                Eq("cr664_officer", actorId),
                Eq("cr664_grantstate", "ACTIVE"))
                .Where(row => Effective(row, effectiveAt, "cr664_effectivefrom", "cr664_effectivethrough"))
                .Select(ParseGrant)
                .Where(value => value != null)
                .ToList();
            var memberships = Query(MembershipTable,
                Eq("cr664_officer", actorId),
                Eq("cr664_membershipstate", "ACTIVE"),
                Eq("cr664_mayvote", true))
                .Where(row => Effective(row, effectiveAt, "cr664_effectivefrom", "cr664_effectivethrough"))
                .Select(row => row.GetAttributeValue<EntityReference>("cr664_committee")?.Id.ToString("D"))
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .ToList();

            var history = Query(ActionEvidenceTable,
                Eq("cr664_governanceprofile", profile.Id),
                Eq("cr664_loandeal", parsedCase))
                .Select(ParseActionEvidence).Where(value => value != null).ToList();
            var approvals = Query(VoteTable,
                Eq("cr664_governanceprofile", profile.Id),
                Eq("cr664_loandeal", parsedCase))
                .Select(ParseApproval).Where(value => value != null).ToList();
            resolvedTokens = new Dictionary<string, string>
            {
                ["profile"] = ProfileIdentityToken(profile),
                ["policy"] = Token(policyRow),
                ["deal"] = Token(deal),
                ["actor"] = ActorIdentityToken(user),
            };
            return Result(new GovernanceCaseResolution
            {
                Kind = "resolved",
                Facts = ResolveFacts(deal),
                Actor = new GovernanceActor
                {
                    ActorId = actorId.ToString("D"),
                    Roles = roles,
                    CommitteeMemberships = memberships,
                    AuthorityGrants = grants,
                },
                ActionHistory = history,
                Approvals = approvals,
                SourceVersionTokens = resolvedTokens,
            });
        }

        public System.Threading.Tasks.Task<EvaluationAppendResult> AppendEvaluation(
            PersistedGovernanceEvaluation evaluation)
        {
            if (profile == null || policyRow == null || deal == null || resolvedTokens == null)
                return Result(new EvaluationAppendResult { Kind = "failed" });
            var currentPolicies = Query(PolicyTable, Eq("cr664_policyid", policyRow.GetAttributeValue<string>("cr664_policyid")),
                Eq("cr664_versionnumber", policyRow.GetAttributeValue<int>("cr664_versionnumber")));
            if (currentPolicies.Count != 1 || !Same(Token(currentPolicies[0]), resolvedTokens["policy"]))
                return Result(new EvaluationAppendResult { Kind = "stale-policy" });
            var existing = Query(EvaluationTable, Eq("cr664_evaluationid", evaluation.Request.EvaluationId));
            if (existing.Count > 1) return Result(new EvaluationAppendResult { Kind = "failed" });
            if (existing.Count == 1)
            {
                var existingRow = existing[0];
                if (existingRow.GetAttributeValue<EntityReference>("cr664_policyversion")?.Id != policyRow.Id)
                    return Result(new EvaluationAppendResult { Kind = "stale-policy" });
                if (
                    existingRow.GetAttributeValue<EntityReference>("cr664_loandeal")?.Id != deal.Id ||
                    existingRow.GetAttributeValue<EntityReference>("cr664_actor")?.Id != actorId ||
                    !Same(existingRow.GetAttributeValue<string>("cr664_actioncode"),
                        evaluation.Request.Action.ToString().ToUpperInvariant()) ||
                    !Same(existingRow.GetAttributeValue<string>("cr664_correlationid"),
                        evaluation.OperationCorrelationId))
                    return Result(new EvaluationAppendResult { Kind = "concurrent-update-binding" });
                if (!Same(ComparableRequestHash(existingRow.GetAttributeValue<string>("cr664_requestjson")),
                    ComparableRequestHash(evaluation.Request)))
                    return Result(new EvaluationAppendResult { Kind = "concurrent-update-request" });
                if (!Same(ComparableResultHash(existingRow.GetAttributeValue<string>("cr664_resultjson")),
                    ComparableResultHash(evaluation.Result)))
                    return Result(new EvaluationAppendResult { Kind = "concurrent-update-result" });
                if (!Same(ComparableSourceTokens(existingRow.GetAttributeValue<string>("cr664_sourceversiontokensjson")),
                    ComparableSourceTokens(evaluation.SourceVersionTokens)))
                    return Result(new EvaluationAppendResult { Kind = "concurrent-update-source" });
                return Result(new EvaluationAppendResult
                {
                    Kind = "duplicate",
                    EvaluationRecordId = existingRow.Id.ToString("D"),
                });
            }

            Entity currentDeal;
            try { currentDeal = service.Retrieve(LoanDealTable, deal.Id, new ColumnSet(true)); }
            catch { return Result(new EvaluationAppendResult { Kind = "concurrent-update" }); }
            if (!Same(Token(currentDeal), resolvedTokens["deal"]))
                return Result(new EvaluationAppendResult { Kind = "concurrent-update" });

            var requestJson = Serialize(evaluation.Request);
            var resultJson = Serialize(evaluation.Result);
            var row = new Entity(EvaluationTable)
            {
                ["cr664_name"] = evaluation.Request.EvaluationId,
                ["cr664_governanceprofile"] = profile.ToEntityReference(),
                ["cr664_policyversion"] = policyRow.ToEntityReference(),
                ["cr664_loandeal"] = deal.ToEntityReference(),
                ["cr664_actor"] = new EntityReference("systemuser", actorId),
                ["cr664_evaluationid"] = evaluation.Request.EvaluationId,
                ["cr664_contractversion"] = evaluation.ContractVersion,
                ["cr664_actioncode"] = evaluation.Request.Action.ToString().ToUpperInvariant(),
                ["cr664_decisioncode"] = evaluation.Result.Decision.ToString().ToUpperInvariant(),
                ["cr664_evaluatedat"] = evaluation.Request.EvaluatedAt.UtcDateTime,
                ["cr664_requestjson"] = requestJson,
                ["cr664_resultjson"] = resultJson,
                ["cr664_sourceversiontokensjson"] = Serialize(evaluation.SourceVersionTokens),
                ["cr664_requestsha256"] = Hash(requestJson),
                ["cr664_resultsha256"] = Hash(resultJson),
                ["cr664_correlationid"] = evaluation.OperationCorrelationId,
            };
            var id = service.Create(row);
            return Result(new EvaluationAppendResult { Kind = "appended", EvaluationRecordId = id.ToString("D") });
        }

        private static string ComparableRequestHash(GovernanceEvaluationRequest request)
        {
            if (request == null) return null;
            var evaluatedAt = request.EvaluatedAt;
            try
            {
                request.EvaluatedAt = DateTimeOffset.MinValue;
                return Hash(Serialize(request));
            }
            finally
            {
                request.EvaluatedAt = evaluatedAt;
            }
        }

        private static string ComparableRequestHash(string requestJson)
        {
            try { return ComparableRequestHash(Deserialize<GovernanceEvaluationRequest>(requestJson)); }
            catch { return null; }
        }

        private static string ComparableResultHash(GovernanceEvaluation result)
        {
            if (result == null) return null;
            var evaluatedAt = result.EvaluatedAt;
            try
            {
                result.EvaluatedAt = DateTimeOffset.MinValue;
                return Hash(Serialize(result));
            }
            finally
            {
                result.EvaluatedAt = evaluatedAt;
            }
        }

        private static string ComparableResultHash(string resultJson)
        {
            try { return ComparableResultHash(Deserialize<GovernanceEvaluation>(resultJson)); }
            catch { return null; }
        }

        private static string ComparableSourceTokens(IDictionary<string, string> tokens)
        {
            if (tokens == null) return null;
            var stable = new Dictionary<string, string>(tokens, StringComparer.OrdinalIgnoreCase);
            stable.Remove("deal");
            var canonical = string.Join("|", stable
                .OrderBy(pair => pair.Key, StringComparer.OrdinalIgnoreCase)
                .Select(pair => (pair.Key ?? string.Empty).Trim().ToLowerInvariant() + "=" +
                    (pair.Value ?? string.Empty).Trim()));
            return Hash(canonical);
        }

        private static string ComparableSourceTokens(string tokensJson)
        {
            try
            {
                return ComparableSourceTokens(
                    Deserialize<Dictionary<string, string>>(tokensJson));
            }
            catch { return null; }
        }

        public void AppendActionEvidence(
            GovernedCreditAction governedAction,
            Guid dealId,
            string sourceEntity,
            Guid sourceRecordId,
            string evaluationId)
        {
            var profiles = Query(ProfileTable,
                Eq("cr664_bankkey", bankId),
                Eq("cr664_profileenabled", true));
            if (profiles.Count != 1)
                throw Fail("ACTIVE_PROFILE_UNRESOLVED", "The active bank profile changed before action evidence.");
            var evaluations = Query(EvaluationTable, Eq("cr664_evaluationid", evaluationId));
            if (evaluations.Count != 1 ||
                !Same(evaluations[0].GetAttributeValue<string>("cr664_decisioncode"), "PERMIT") ||
                evaluations[0].GetAttributeValue<EntityReference>("cr664_actor")?.Id != actorId ||
                evaluations[0].GetAttributeValue<EntityReference>("cr664_loandeal")?.Id != dealId)
                throw Fail("PERMIT_EVIDENCE_UNRESOLVED", "A matching persisted permit was not found.");
            var evidenceId = correlationId.ToString("N") + "-" + governedAction;
            var existing = Query(ActionEvidenceTable, Eq("cr664_evidenceid", evidenceId));
            if (existing.Count == 1) return;
            if (existing.Count > 1) throw Fail("ACTION_EVIDENCE_DUPLICATE", "Duplicate action evidence exists.");
            var canonical = string.Join("|", new[]
            {
                bankId, dealId.ToString("D"), actorId.ToString("D"), governedAction.ToString(),
                sourceEntity ?? string.Empty, sourceRecordId.ToString("D"), correlationId.ToString("D")
            });
            service.Create(new Entity(ActionEvidenceTable)
            {
                ["cr664_name"] = evidenceId,
                ["cr664_governanceprofile"] = profiles[0].ToEntityReference(),
                ["cr664_loandeal"] = new EntityReference(LoanDealTable, dealId),
                ["cr664_actor"] = new EntityReference("systemuser", actorId),
                ["cr664_evidenceid"] = evidenceId,
                ["cr664_actioncode"] = ActionCode(governedAction),
                ["cr664_occurredat"] = DateTime.UtcNow,
                ["cr664_sourceentity"] = sourceEntity,
                ["cr664_sourcerecordid"] = sourceRecordId.ToString("D"),
                ["cr664_correlationid"] = correlationId.ToString("D"),
                ["cr664_evidencesha256"] = Hash(canonical),
            });
        }

        private CreditCaseFacts ResolveFacts(Entity row)
        {
            var amount = MoneyValue(row, "cr664_amount");
            if (amount <= 0m) throw Fail("CASE_FACTS_INCOMPLETE", "A positive loan amount is required.");
            var client = row.GetAttributeValue<EntityReference>("cr664_client");
            if (client == null) throw Fail("CASE_FACTS_INCOMPLETE", "A verified client relationship is required.");
            var related = Query(LoanDealTable, Eq("cr664_client", client.Id));
            var exposure = related.Sum(item => MoneyValue(item, "cr664_amount"));
            if (!related.Any(item => item.Id == row.Id)) exposure += amount;
            var collateral = Text(row, "cr664_collateralsummary");
            var product = DisplayAny(row, "cr664_producttypereference", "cr664_producttype");
            var riskRating = DisplayAny(row, "cr664_risklevelreference", "cr664_riskrating");
            var industry = DisplayAny(row, "cr664_industry");
            var geography = RequiredText(row, "cr664_geography");
            RequirePresent(row, "cr664_haspolicyexception");
            RequirePresent(row, "cr664_policyexceptiontypesjson");
            RequirePresent(row, "cr664_insiderstatus");
            RequirePresent(row, "cr664_concentrationjson");
            var guaranteedProgram = RequiredText(row, "cr664_governmentguaranteedprogram");
            var classification = RequiredText(row, "cr664_criticizedclassifiedstatus");
            if (string.IsNullOrWhiteSpace(product) || string.IsNullOrWhiteSpace(riskRating) ||
                string.IsNullOrWhiteSpace(industry))
                throw Fail("CASE_FACTS_INCOMPLETE", "Product, risk rating, and industry are required.");
            return new CreditCaseFacts
            {
                Amount = amount,
                TotalRelationshipExposure = exposure,
                UnsecuredExposure = string.IsNullOrWhiteSpace(collateral) ? amount : 0m,
                Product = product,
                Collateral = string.IsNullOrWhiteSpace(collateral) ? new List<string>() : new List<string> { collateral },
                RiskRating = riskRating,
                HasPolicyException = Bool(row, "cr664_haspolicyexception"),
                PolicyExceptionTypes = Strings(row, "cr664_policyexceptiontypesjson"),
                InsiderStatus = Bool(row, "cr664_insiderstatus"),
                Concentration = Strings(row, "cr664_concentrationjson"),
                Industry = industry,
                Geography = geography,
                GovernmentGuaranteedProgram = Same(guaranteedProgram, "NONE") ? null : guaranteedProgram,
                CriticizedClassifiedStatus = Same(classification, "NONE") ? null : classification,
            };
        }

        private DelegatedAuthorityGrant ParseGrant(Entity row)
        {
            try
            {
                return new DelegatedAuthorityGrant
                {
                    GrantId = row.GetAttributeValue<string>("cr664_grantid"),
                    Actions = ParseActions(row.GetAttributeValue<string>("cr664_actionsjson")),
                    MaximumAmount = NullableMoney(row, "cr664_maximumamount"),
                    MaximumRelationshipExposure = NullableMoney(row, "cr664_maximumrelationshipexposure"),
                    MaximumUnsecuredAmount = NullableMoney(row, "cr664_maximumunsecuredamount"),
                    Products = StringsOrNull(row, "cr664_productsjson"),
                    RiskRatings = StringsOrNull(row, "cr664_riskratingsjson"),
                    Geographies = StringsOrNull(row, "cr664_geographiesjson"),
                    Industries = StringsOrNull(row, "cr664_industriesjson"),
                    ExceptionTypes = StringsOrNull(row, "cr664_exceptiontypesjson"),
                    InsiderPermitted = Bool(row, "cr664_insiderpermitted"),
                    CriticizedClassifiedStatuses = StringsOrNull(row, "cr664_criticizedclassifiedstatusesjson"),
                    EffectiveFrom = Date(row, "cr664_effectivefrom"),
                    EffectiveThrough = NullableDate(row, "cr664_effectivethrough"),
                };
            }
            catch { return null; }
        }

        private GovernedActionEvidence ParseActionEvidence(Entity row)
        {
            GovernedCreditAction parsed;
            if (!Enum.TryParse(NormalizeAction(row.GetAttributeValue<string>("cr664_actioncode")), true, out parsed))
                return null;
            var actor = row.GetAttributeValue<EntityReference>("cr664_actor");
            if (actor == null) return null;
            return new GovernedActionEvidence
            {
                Action = parsed,
                ActorId = actor.Id.ToString("D"),
                OccurredAt = Date(row, "cr664_occurredat"),
                EvidenceId = row.GetAttributeValue<string>("cr664_evidenceid"),
            };
        }

        private ApprovalEvidence ParseApproval(Entity row)
        {
            var voter = row.GetAttributeValue<EntityReference>("cr664_voter");
            if (voter == null) return null;
            return new ApprovalEvidence
            {
                ApprovalId = row.GetAttributeValue<string>("cr664_approvalid"),
                GroupId = row.GetAttributeValue<string>("cr664_groupid"),
                ActorId = voter.Id.ToString("D"),
                ActorRoles = Strings(row, "cr664_actorrolesjson"),
                CommitteeId = row.GetAttributeValue<EntityReference>("cr664_committee")?.Id.ToString("D"),
                Decision = row.GetAttributeValue<string>("cr664_decisioncode"),
                OccurredAt = Date(row, "cr664_occurredat"),
            };
        }

        private List<Entity> Query(string entity, params ConditionExpression[] conditions)
        {
            var query = new QueryExpression(entity) { ColumnSet = new ColumnSet(true) };
            foreach (var condition in conditions) query.Criteria.AddCondition(condition);
            return service.RetrieveMultiple(query).Entities.ToList();
        }

        private static ConditionExpression Eq(string name, object value) =>
            new ConditionExpression(name, ConditionOperator.Equal, value);
        private static bool Effective(Entity row, DateTimeOffset at, string fromName, string throughName)
        {
            var from = Date(row, fromName);
            var through = NullableDate(row, throughName);
            return at >= from && (!through.HasValue || at <= through.Value);
        }
        private static string Token(Entity row) =>
            !string.IsNullOrWhiteSpace(row.RowVersion) ? row.RowVersion :
            row.GetAttributeValue<long>("versionnumber").ToString(CultureInfo.InvariantCulture);
        private static string ProfileIdentityToken(Entity row) => Hash(string.Join("|", new[]
        {
            row.Id.ToString("D"),
            (row.GetAttributeValue<string>("cr664_bankkey") ?? string.Empty).Trim().ToLowerInvariant(),
            row.GetAttributeValue<bool>("cr664_profileenabled") ? "enabled" : "disabled",
        }));
        private static string ActorIdentityToken(Entity row) => Hash(string.Join("|", new[]
        {
            row.Id.ToString("D"),
            row.GetAttributeValue<bool>("isdisabled") ? "disabled" : "enabled",
            row.GetAttributeValue<Guid>("azureactivedirectoryobjectid").ToString("D"),
        }));
        private static string Text(Entity row, string name) => row.GetAttributeValue<string>(name);
        private static bool Bool(Entity row, string name) => row.GetAttributeValue<bool>(name);
        private static string DisplayAny(Entity row, params string[] names)
        {
            foreach (var name in names)
            {
                if (row.FormattedValues.Contains(name) &&
                    !string.IsNullOrWhiteSpace(row.FormattedValues[name]))
                    return row.FormattedValues[name];
                object raw;
                if (!row.Attributes.TryGetValue(name, out raw) || raw == null) continue;
                var reference = raw as EntityReference;
                if (reference != null && !string.IsNullOrWhiteSpace(reference.Name))
                    return reference.Name;
                var text = raw as string;
                if (!string.IsNullOrWhiteSpace(text)) return text;
                var option = raw as OptionSetValue;
                if (option != null) return option.Value.ToString(CultureInfo.InvariantCulture);
            }
            return null;
        }
        private static string RequiredText(Entity row, string name)
        {
            var value = Text(row, name);
            if (string.IsNullOrWhiteSpace(value))
                throw Fail("CASE_FACTS_INCOMPLETE", name + " is required.");
            return value;
        }
        private static void RequirePresent(Entity row, string name)
        {
            if (!row.Contains(name) || row[name] == null)
                throw Fail("CASE_FACTS_INCOMPLETE", name + " is required.");
        }
        private static decimal MoneyValue(Entity row, string name)
        {
            var money = row.GetAttributeValue<Money>(name);
            if (money != null) return money.Value;
            return row.GetAttributeValue<decimal>(name);
        }
        private static decimal? NullableMoney(Entity row, string name) =>
            row.Contains(name) ? (decimal?)MoneyValue(row, name) : null;
        private static DateTimeOffset Date(Entity row, string name) =>
            new DateTimeOffset(row.GetAttributeValue<DateTime>(name).ToUniversalTime());
        private static DateTimeOffset? NullableDate(Entity row, string name) =>
            row.Contains(name) ? (DateTimeOffset?)Date(row, name) : null;
        private List<string> Strings(Entity row, string name) =>
            StringsOrNull(row, name) ?? new List<string>();
        private List<string> StringsOrNull(Entity row, string name)
        {
            var value = row.GetAttributeValue<string>(name);
            if (string.IsNullOrWhiteSpace(value)) return null;
            var parsed = Deserialize<List<string>>(value);
            return parsed == null || parsed.Count == 0 ? null : parsed;
        }
        private List<GovernedCreditAction> ParseActions(string value)
        {
            var names = Deserialize<List<string>>(value ?? "[]");
            var result = new List<GovernedCreditAction>();
            foreach (var name in names)
            {
                GovernedCreditAction parsed;
                if (!Enum.TryParse(NormalizeAction(name), true, out parsed))
                    throw Fail("AUTHORITY_INVALID", "An authority grant contains an unknown action.");
                result.Add(parsed);
            }
            return result;
        }
        private static string NormalizePolicyJson(string value)
        {
            foreach (GovernedCreditAction action in Enum.GetValues(typeof(GovernedCreditAction)))
                value = value.Replace(
                    "\"" + ActionCode(action) + "\"",
                    ((int)action).ToString(CultureInfo.InvariantCulture));
            foreach (var pair in new Dictionary<string, string>
            {
                ["policyId"]="PolicyId", ["version"]="Version", ["status"]="Status",
                ["effectiveFrom"]="EffectiveFrom", ["effectiveThrough"]="EffectiveThrough",
                ["rules"]="Rules", ["ruleId"]="RuleId", ["description"]="Description",
                ["actions"]="Actions", ["when"]="When", ["requirements"]="Requirements",
                ["nonOverrideable"]="NonOverrideable", ["minimumAmount"]="MinimumAmount",
                ["maximumAmount"]="MaximumAmount", ["minimumRelationshipExposure"]="MinimumRelationshipExposure",
                ["maximumRelationshipExposure"]="MaximumRelationshipExposure", ["products"]="Products",
                ["anyCollateral"]="AnyCollateral", ["riskRatings"]="RiskRatings",
                ["hasPolicyException"]="HasPolicyException", ["insiderStatus"]="InsiderStatus",
                ["anyConcentration"]="AnyConcentration", ["industries"]="Industries",
                ["geographies"]="Geographies", ["governmentGuaranteedPrograms"]="GovernmentGuaranteedPrograms",
                ["governmentGuaranteedProgramsIncludesNone"]="GovernmentGuaranteedProgramsIncludesNone",
                ["criticizedClassifiedStatuses"]="CriticizedClassifiedStatuses",
                ["criticizedClassifiedStatusesIncludesNone"]="CriticizedClassifiedStatusesIncludesNone",
                ["actorRoles"]="ActorRoles", ["delegatedAuthorityRequired"]="DelegatedAuthorityRequired",
                ["independentFrom"]="IndependentFrom", ["approvalGroups"]="ApprovalGroups",
                ["mandatoryEscalation"]="MandatoryEscalation", ["prohibited"]="Prohibited",
                ["groupId"]="GroupId", ["approvalsRequired"]="ApprovalsRequired",
                ["eligibleRoles"]="EligibleRoles", ["committeeId"]="CommitteeId",
                ["distinctActors"]="DistinctActors", ["unanimous"]="Unanimous",
                ["quorumRequired"]="QuorumRequired", ["abstentionsCountTowardQuorum"]="AbstentionsCountTowardQuorum",
                ["recusedActorIds"]="RecusedActorIds"
            })
                value = value.Replace("\"" + pair.Key + "\":", "\"" + pair.Value + "\":");
            value = Regex.Replace(
                value,
                "\"(EffectiveFrom|EffectiveThrough)\"\\s*:\\s*\"([^\"]+)\"",
                match =>
                {
                    var parsed = DateTimeOffset.Parse(
                        match.Groups[2].Value,
                        CultureInfo.InvariantCulture,
                        DateTimeStyles.RoundtripKind);
                    var milliseconds = (long)(parsed.UtcDateTime -
                        new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
                    return "\"" + match.Groups[1].Value + "\":{\"DateTime\":\"\\/Date(" +
                        milliseconds.ToString(CultureInfo.InvariantCulture) +
                        ")\\/\",\"OffsetMinutes\":0}";
                });
            return value;
        }
        private static string NormalizeAction(string value)
        {
            foreach (GovernedCreditAction action in Enum.GetValues(typeof(GovernedCreditAction)))
                if (Same(value, ActionCode(action))) return action.ToString();
            return value;
        }
        private static string ActionCode(GovernedCreditAction action)
        {
            switch (action)
            {
                case GovernedCreditAction.ApproveException: return "APPROVE_EXCEPTION";
                case GovernedCreditAction.AuthorizeFunding: return "AUTHORIZE_FUNDING";
                case GovernedCreditAction.ConfirmDisbursement: return "CONFIRM_DISBURSEMENT";
                default: return action.ToString().ToUpperInvariant();
            }
        }
        private static string Hash(string value)
        {
            using (var sha = SHA256.Create())
                return BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(value ?? string.Empty)))
                    .Replace("-", string.Empty).ToLowerInvariant();
        }
        private static bool Same(string left, string right) =>
            string.Equals(left?.Trim(), right?.Trim(), StringComparison.OrdinalIgnoreCase);
        private static InvalidPluginExecutionException Fail(string code, string message) =>
            new InvalidPluginExecutionException(code + ": " + message);
        private static System.Threading.Tasks.Task<T> Result<T>(T value) =>
            System.Threading.Tasks.Task.FromResult(value);
        private static T Deserialize<T>(string value)
        {
            var serializer = new DataContractJsonSerializer(typeof(T),
                new DataContractJsonSerializerSettings { UseSimpleDictionaryFormat = true });
            using (var stream = new MemoryStream(Encoding.UTF8.GetBytes(value ?? string.Empty)))
                return (T)serializer.ReadObject(stream);
        }
        private static string Serialize<T>(T value)
        {
            var serializer = new DataContractJsonSerializer(typeof(T),
                new DataContractJsonSerializerSettings { UseSimpleDictionaryFormat = true });
            using (var stream = new MemoryStream())
            {
                serializer.WriteObject(stream, value);
                return Encoding.UTF8.GetString(stream.ToArray());
            }
        }
    }
}
