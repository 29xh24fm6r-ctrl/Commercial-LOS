using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace CommercialLendingLOS.Plugins
{
    /// <summary>
    /// Synchronous PreOperation uniqueness floor for governance records.
    ///
    /// Pending Dataverse alternate-key indexes are defense in depth only. This host
    /// performs a natural-key query in the transaction and assigns a deterministic
    /// native GUID to every create. Concurrent requests for the same natural key
    /// therefore converge on the same Dataverse primary key and at most one commits.
    /// Child records also update their bank profile as a transaction mutex before
    /// checking effective-record conflicts.
    /// </summary>
    public sealed class GovernanceNaturalKeyGuardPlugin : IPlugin
    {
        private const string ProfileTable = "cr664_creditgovernanceprofile";
        private const string PolicyTable = "cr664_creditpolicyversion";
        private const string RuleTable = "cr664_governancepolicyrule";
        private const string RoleTable = "cr664_governanceroleassignment";
        private const string GrantTable = "cr664_authoritygrant";
        private const string CommitteeTable = "cr664_governancecommittee";
        private const string MembershipTable = "cr664_governancecommitteemember";
        private const string EvidenceTable = "cr664_governedactionevidence";
        private const string VoteTable = "cr664_governanceapprovalvote";
        private const string EvaluationTable = "cr664_governanceevaluation";
        private const string ExceptionDecisionTable = "cr664_conditionverification";

        private static readonly IDictionary<string, string[]> NaturalKeys =
            new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
            {
                [ProfileTable] = new[] { "cr664_bankkey" },
                [PolicyTable] = new[] { "cr664_policyid", "cr664_versionnumber" },
                [RuleTable] = new[] { "cr664_policyversion", "cr664_ruleid" },
                [RoleTable] = new[] { "cr664_assignmentid" },
                [GrantTable] = new[] { "cr664_grantid" },
                [CommitteeTable] = new[] { "cr664_committeeid" },
                [MembershipTable] = new[] { "cr664_membershipid" },
                [EvidenceTable] = new[] { "cr664_evidenceid" },
                [VoteTable] = new[] { "cr664_approvalid" },
                [EvaluationTable] = new[] { "cr664_evaluationid" },
                [ExceptionDecisionTable] = new[] { "cr664_dealid", "cr664_correlationid" },
            };

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            if (context == null || context.Stage != 20 || context.Mode != 0 ||
                !NaturalKeys.ContainsKey(context.PrimaryEntityName))
                return;
            if (!string.Equals(context.MessageName, "Create", StringComparison.OrdinalIgnoreCase) &&
                !string.Equals(context.MessageName, "Update", StringComparison.OrdinalIgnoreCase))
                return;

            var target = context.InputParameters.Contains("Target")
                ? context.InputParameters["Target"] as Entity
                : null;
            if (target == null) Deny("DUPLICATE_GUARD_TARGET_MISSING", "The governed write target is unavailable.");
            var preImage = context.PreEntityImages.Contains("PreImage")
                ? context.PreEntityImages["PreImage"]
                : null;
            if (string.Equals(context.MessageName, "Update", StringComparison.OrdinalIgnoreCase) && preImage == null)
                Deny("DUPLICATE_GUARD_PREIMAGE_MISSING", "Natural-key updates require a complete pre-image.");

            var merged = Merge(target, preImage);
            var keyFields = NaturalKeys[context.PrimaryEntityName];
            var keyValues = keyFields.Select(field => RequireKey(merged, field)).ToArray();
            if (preImage != null)
            {
                foreach (var field in keyFields)
                {
                    if (!SameValue(RequireKey(preImage, field), RequireKey(merged, field)))
                        Deny("NATURAL_KEY_IMMUTABLE", "Governance natural-key fields cannot be changed.");
                }
            }

            var service = ((IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory)))
                .CreateOrganizationService(context.InitiatingUserId);
            var profileId = ResolveProfileId(service, merged);
            if (profileId.HasValue && !string.Equals(context.PrimaryEntityName, ProfileTable, StringComparison.OrdinalIgnoreCase))
                LockProfile(service, profileId.Value);

            RejectNaturalKeyDuplicate(service, context.PrimaryEntityName, target.Id, keyFields, keyValues);
            RejectEffectiveDuplicate(service, context.PrimaryEntityName, target.Id, merged, profileId);

            if (string.Equals(context.MessageName, "Create", StringComparison.OrdinalIgnoreCase))
            {
                target.Id = DeterministicGuid(context.PrimaryEntityName, keyFields, keyValues);
            }
        }

        internal static Guid DeterministicGuid(string table, IEnumerable<string> fields, IEnumerable<object> values)
        {
            var canonical = table.ToLowerInvariant() + "|" + string.Join("|",
                fields.Zip(values, (field, value) => field.ToLowerInvariant() + "=" + Canonical(value)));
            using (var sha = SHA256.Create())
            {
                var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(canonical));
                var guidBytes = bytes.Take(16).ToArray();
                guidBytes[7] = (byte)((guidBytes[7] & 0x0f) | 0x50);
                guidBytes[8] = (byte)((guidBytes[8] & 0x3f) | 0x80);
                return new Guid(guidBytes);
            }
        }

        private static void RejectNaturalKeyDuplicate(
            IOrganizationService service,
            string table,
            Guid targetId,
            IReadOnlyList<string> fields,
            IReadOnlyList<object> values)
        {
            var query = new QueryExpression(table)
            {
                ColumnSet = new ColumnSet(false),
                TopCount = 2,
            };
            for (var i = 0; i < fields.Count; i++)
                query.Criteria.AddCondition(fields[i], ConditionOperator.Equal, QueryValue(values[i]));
            var duplicates = service.RetrieveMultiple(query).Entities
                .Where(row => targetId == Guid.Empty || row.Id != targetId)
                .ToList();
            if (duplicates.Count != 0)
                Deny("GOVERNANCE_DUPLICATE", "A governance record with the same natural key already exists.");
        }

        private static void RejectEffectiveDuplicate(
            IOrganizationService service,
            string table,
            Guid targetId,
            Entity row,
            Guid? profileId)
        {
            if (string.Equals(table, PolicyTable, StringComparison.OrdinalIgnoreCase) &&
                SameText(row, "cr664_policystatus", "ACTIVE"))
            {
                if (!profileId.HasValue)
                    Deny("PROFILE_MISSING", "An active policy must be bound to a governance profile.");
                var active = Query(service, table,
                    Eq("cr664_governanceprofile", profileId.Value),
                    Eq("cr664_policystatus", "ACTIVE"))
                    .Where(candidate => candidate.Id != targetId)
                    .Where(candidate => Overlaps(
                        Date(row, "cr664_effectivefrom"),
                        DateOrNull(row, "cr664_effectivethrough"),
                        Date(candidate, "cr664_effectivefrom"),
                        DateOrNull(candidate, "cr664_effectivethrough")))
                    .ToList();
                if (active.Count != 0)
                    Deny("ACTIVE_POLICY_DUPLICATE", "Overlapping active policy versions are prohibited.");
            }

            if (string.Equals(table, GrantTable, StringComparison.OrdinalIgnoreCase) &&
                SameText(row, "cr664_grantstate", "ACTIVE"))
            {
                RejectEffectiveFingerprintDuplicate(
                    service, table, targetId, row, profileId,
                    "cr664_officer", "cr664_actionsjson", "cr664_productsjson",
                    "cr664_riskratingsjson", "cr664_exceptiontypesjson",
                    "cr664_insiderpermitted", "cr664_criticizedclassifiedstatusesjson");
            }

            if (string.Equals(table, RoleTable, StringComparison.OrdinalIgnoreCase) &&
                SameText(row, "cr664_assignmentstate", "ACTIVE"))
            {
                RejectEffectiveFingerprintDuplicate(
                    service, table, targetId, row, profileId,
                    "cr664_officer", "cr664_rolecode");
            }

            if (string.Equals(table, VoteTable, StringComparison.OrdinalIgnoreCase))
            {
                var voter = RequireKey(row, "cr664_voter");
                var deal = RequireKey(row, "cr664_loandeal");
                var group = RequireKey(row, "cr664_groupid");
                var duplicates = Query(service, table,
                    Eq("cr664_governanceprofile", RequireProfile(profileId)),
                    Eq("cr664_loandeal", ((EntityReference)deal).Id),
                    Eq("cr664_voter", ((EntityReference)voter).Id),
                    Eq("cr664_groupid", group))
                    .Where(candidate => candidate.Id != targetId)
                    .ToList();
                if (duplicates.Count != 0)
                    Deny("APPROVAL_ASSIGNMENT_DUPLICATE", "The same actor cannot submit duplicate approval evidence for one group.");
            }

            if (string.Equals(table, EvaluationTable, StringComparison.OrdinalIgnoreCase))
            {
                var requestHash = Text(row, "cr664_requestsha256");
                var resultHash = Text(row, "cr664_resultsha256");
                if (string.IsNullOrWhiteSpace(requestHash) || string.IsNullOrWhiteSpace(resultHash))
                    Deny("EVALUATION_HASH_MISSING", "Immutable evaluation hashes are required.");
            }
        }

        private static void RejectEffectiveFingerprintDuplicate(
            IOrganizationService service,
            string table,
            Guid targetId,
            Entity row,
            Guid? profileId,
            params string[] fingerprintFields)
        {
            var conditions = new List<ConditionExpression>
            {
                Eq("cr664_governanceprofile", RequireProfile(profileId)),
            };
            if (fingerprintFields.Contains("cr664_officer"))
            {
                conditions.Add(Eq(
                    "cr664_officer",
                    QueryValue(RequireKey(row, "cr664_officer"))));
            }
            var from = Date(row, "cr664_effectivefrom");
            var through = DateOrNull(row, "cr664_effectivethrough");
            var duplicates = Query(service, table, conditions.ToArray())
                .Where(candidate => candidate.Id != targetId)
                .Where(candidate => fingerprintFields.All(field =>
                    SameValue(RequireKey(row, field), RequireKey(candidate, field))))
                .Where(candidate => Overlaps(
                    from, through,
                    Date(candidate, "cr664_effectivefrom"),
                    DateOrNull(candidate, "cr664_effectivethrough")))
                .ToList();
            if (duplicates.Count != 0)
                Deny("EFFECTIVE_GOVERNANCE_DUPLICATE", "A duplicate effective authority or role record already exists.");
        }

        private static Guid? ResolveProfileId(IOrganizationService service, Entity row)
        {
            var direct = row.GetAttributeValue<EntityReference>("cr664_governanceprofile");
            if (direct != null) return direct.Id;
            if (string.Equals(row.LogicalName, ProfileTable, StringComparison.OrdinalIgnoreCase))
                return row.Id == Guid.Empty ? (Guid?)null : row.Id;
            var policy = row.GetAttributeValue<EntityReference>("cr664_policyversion");
            if (policy != null)
            {
                var parent = service.Retrieve(PolicyTable, policy.Id, new ColumnSet("cr664_governanceprofile"));
                return parent.GetAttributeValue<EntityReference>("cr664_governanceprofile")?.Id;
            }
            var committee = row.GetAttributeValue<EntityReference>("cr664_committee");
            if (committee != null)
            {
                var parent = service.Retrieve(CommitteeTable, committee.Id, new ColumnSet("cr664_governanceprofile"));
                return parent.GetAttributeValue<EntityReference>("cr664_governanceprofile")?.Id;
            }
            return null;
        }

        private static void LockProfile(IOrganizationService service, Guid profileId)
        {
            var profile = service.Retrieve(ProfileTable, profileId, new ColumnSet("cr664_name"));
            var lockWrite = new Entity(ProfileTable, profileId)
            {
                ["cr664_name"] = RequireKey(profile, "cr664_name"),
            };
            service.Update(lockWrite);
        }

        private static Guid RequireProfile(Guid? profileId)
        {
            if (!profileId.HasValue || profileId.Value == Guid.Empty)
                Deny("PROFILE_MISSING", "The governance profile could not be resolved.");
            return profileId.Value;
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

        private static object RequireKey(Entity row, string field)
        {
            if (!row.Contains(field) || row[field] == null)
                Deny("NATURAL_KEY_MISSING", "Required natural-key field is missing: " + field + ".");
            var value = row[field];
            if (value is string && string.IsNullOrWhiteSpace((string)value))
                Deny("NATURAL_KEY_MISSING", "Required natural-key field is blank: " + field + ".");
            return value;
        }

        private static bool SameValue(object left, object right)
        {
            return string.Equals(Canonical(left), Canonical(right), StringComparison.Ordinal);
        }

        private static string Canonical(object value)
        {
            var reference = value as EntityReference;
            if (reference != null) return reference.LogicalName.ToLowerInvariant() + ":" + reference.Id.ToString("D");
            var option = value as OptionSetValue;
            if (option != null) return option.Value.ToString(CultureInfo.InvariantCulture);
            var money = value as Money;
            if (money != null) return money.Value.ToString("G29", CultureInfo.InvariantCulture);
            var date = value as DateTime?;
            if (date.HasValue) return date.Value.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture);
            return Convert.ToString(value, CultureInfo.InvariantCulture)?.Trim().ToLowerInvariant() ?? string.Empty;
        }

        private static object QueryValue(object value)
        {
            var reference = value as EntityReference;
            return reference == null ? value : (object)reference.Id;
        }

        private static IList<Entity> Query(
            IOrganizationService service,
            string table,
            params ConditionExpression[] conditions)
        {
            var query = new QueryExpression(table)
            {
                ColumnSet = new ColumnSet(true),
                TopCount = 3,
            };
            foreach (var condition in conditions) query.Criteria.AddCondition(condition);
            return service.RetrieveMultiple(query).Entities;
        }

        private static ConditionExpression Eq(string field, object value)
        {
            return new ConditionExpression(field, ConditionOperator.Equal, value);
        }

        private static bool SameText(Entity row, string field, string expected)
        {
            return string.Equals(Text(row, field), expected, StringComparison.OrdinalIgnoreCase);
        }

        private static string Text(Entity row, string field)
        {
            return row.GetAttributeValue<string>(field)?.Trim();
        }

        private static DateTime Date(Entity row, string field)
        {
            var value = row.GetAttributeValue<DateTime?>(field);
            if (!value.HasValue) Deny("EFFECTIVE_DATE_MISSING", "Effective-from is required.");
            return value.Value.ToUniversalTime();
        }

        private static DateTime? DateOrNull(Entity row, string field)
        {
            return row.GetAttributeValue<DateTime?>(field)?.ToUniversalTime();
        }

        private static bool Overlaps(DateTime leftFrom, DateTime? leftThrough, DateTime rightFrom, DateTime? rightThrough)
        {
            return (!leftThrough.HasValue || rightFrom <= leftThrough.Value) &&
                   (!rightThrough.HasValue || leftFrom <= rightThrough.Value);
        }

        private static void Deny(string code, string message)
        {
            throw new InvalidPluginExecutionException(code + ": " + message);
        }
    }
}
