using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;

namespace CommercialLendingLOS.Plugins
{
    /// <summary>Transactional, environment-locked host for governed LOS identity verification and provisioning.</summary>
    public sealed class LosUserProvisioningCustomApiPlugin : IPlugin
    {
        public const string VerifyMessage = "cr664_VerifyLosUserIdentity";
        public const string ProvisionMessage = "cr664_ProvisionLosUser";
        public static readonly Guid ProductionOrganizationId = new Guid("4d60bdc9-f179-f111-b27b-000d3a5ca83b");
        public const string ProductionEnvironmentId = "afec9c13-e5c5-eea6-b1f7-3f51abb7571d";
        private const int ActiveIdentity = 788190000, ActiveProfile = 788190000, FullAccess = 788190000, AdminAccess = 788190002;

        private static readonly Dictionary<string, string[]> AllowedWorkspaces = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
        {
            { "Banker", new [] { "Banker Workspace", "Team Workspace" } },
            { "Manager", new [] { "Manager Command Center", "Team Workspace", "Banker Workspace" } },
            { "Credit Approver", new [] { "Manager Command Center", "Team Workspace" } },
            { "Funding Approver", new [] { "Manager Command Center", "Team Workspace" } },
            { "Boarding Servicing Operator", new [] { "Portfolio Management", "Team Workspace" } },
            { "Admin", new [] { "Admin Control Center" } }
        };

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            if (context == null || (context.MessageName != VerifyMessage && context.MessageName != ProvisionMessage)) Deny("MESSAGE_INVALID", "Only the registered LOS user provisioning APIs are accepted.");
            if (context.Stage != 30 || context.Mode != 0) Deny("REGISTRATION_INVALID", "User provisioning must run synchronously as a Custom API main operation.");
            if (context.OrganizationId != ProductionOrganizationId) Deny("ENVIRONMENT_MISMATCH", "User provisioning is locked to the Commercial LOS Production organization.");
            if (context.InitiatingUserId == Guid.Empty) Deny("ACTOR_UNRESOLVED", "The authenticated Dataverse actor is unavailable.");
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var service = factory.CreateOrganizationService(context.InitiatingUserId);
            var actor = ResolveAdministrator(service, context.InitiatingUserId);
            if (context.MessageName == VerifyMessage) Verify(context, service);
            else Provision(context, service, actor);
        }

        private static void Verify(IPluginExecutionContext context, IOrganizationService service)
        {
            RequireEnvironment(Input(context, "EnvironmentId"));
            var upn = NormalizeUpn(Input(context, "Upn"));
            var identity = ResolveSystemUser(service, upn);
            var baseRoles = ResolveDataverseRoles(service, identity.Id);
            if (!baseRoles.Any(name => string.Equals(name, "Basic User", StringComparison.OrdinalIgnoreCase) || name.IndexOf("Commercial", StringComparison.OrdinalIgnoreCase) >= 0))
                Deny("MICROSOFT_ACCESS_INCOMPLETE", "Microsoft environment access is incomplete. Assign the approved Dataverse base role in Power Platform Admin Center, then retry verification.");
            var existingEntities = InspectExistingEntities(service, upn);
            var duplicate = existingEntities.FirstOrDefault(pair => pair.Value.Count > 1);
            if (!string.IsNullOrEmpty(duplicate.Key)) Deny("DUPLICATE_IDENTITY", "Duplicate " + duplicate.Key + " records exist for the normalized UPN.");
            var existing = existingEntities.Where(pair => pair.Value.Count == 1).ToDictionary(pair => pair.Key, pair => pair.Value[0].Id.ToString("D"));
            var existingStatus = existing.Count == 0 ? null : (existing.Count != existingEntities.Count ? "partial" : existingEntities.Values.SelectMany(rows => rows).All(Active) ? "complete" : "inactive");
            var availableRoles = CatalogNames(service, "cr664_userrole", "cr664_rolename").Intersect(CatalogNames(service, "cr664_platformrole", "cr664_rolename"), StringComparer.OrdinalIgnoreCase).Where(name => AllowedWorkspaces.ContainsKey(name)).ToArray();
            var availableWorkspaces = CatalogNames(service, "cr664_workspacetype", "cr664_workspacename").Intersect(CatalogNames(service, "cr664_platformworkspace", "cr664_workspacename"), StringComparer.OrdinalIgnoreCase).Where(name => AllowedWorkspaces.Values.SelectMany(value => value).Contains(name, StringComparer.OrdinalIgnoreCase)).ToArray();
            context.OutputParameters["ResultJson"] = Json(new Dictionary<string, object>
            {
                { "status", existing.Count == 0 ? "verified" : "existing_los_user" }, { "systemUserId", identity.Id.ToString("D") },
                { "fullName", identity.GetAttributeValue<string>("fullname") ?? upn }, { "upn", upn },
                { "businessUnit", identity.FormattedValues.Contains("_businessunitid_value") ? identity.FormattedValues["_businessunitid_value"] : identity.GetAttributeValue<EntityReference>("businessunitid")?.Name ?? "Dataverse business unit verified" },
                { "enabled", true }, { "baseDataverseRoles", baseRoles }, { "availableRoles", availableRoles }, { "availableWorkspaces", availableWorkspaces }, { "existingStatus", existingStatus }, { "existingRecordIds", existing }
            });
        }

        private static void Provision(IPluginExecutionContext context, IOrganizationService service, Actor actor)
        {
            var request = Deserialize<Request>(Input(context, "RequestJson"));
            ValidateRequest(request);
            var identity = ResolveSystemUser(service, request.Upn);
            if (identity.Id != Guid.Parse(request.MicrosoftSystemUserId)) Deny("IDENTITY_STALE", "The verified Microsoft identity no longer matches the provisioning request.");
            var roles = ResolveDataverseRoles(service, identity.Id);
            if (!roles.Any(name => string.Equals(name, "Basic User", StringComparison.OrdinalIgnoreCase) || name.IndexOf("Commercial", StringComparison.OrdinalIgnoreCase) >= 0)) Deny("MICROSOFT_ACCESS_INCOMPLETE", "The target user lacks the approved base Dataverse role.");

            var correlationId = DeterministicGuid("provision|" + request.Upn + "|" + request.RoleCode + "|" + request.PrimaryWorkspaceCode);
            var requestedAudit = Audit(actor, request, correlationId, "LosUserProvisioningRequested", 788190000, null, "Provisioning prerequisites validated; transactional plan pending.");
            service.Create(requestedAudit);
            try
            {
                var existing = InspectExistingEntities(service, request.Upn);
                if (existing.Values.Any(rows => rows.Count > 1)) Fail("DUPLICATE_IDENTITY", "More than one LOS identity row exists for the normalized UPN.");
                if (existing.Values.Any(rows => rows.Count == 1)) Fail("EXISTING_LOS_USER", "Existing LOS user found. Use governed access-change controls instead of creating a new user.");

                var userRole = Catalog(service, "cr664_userrole", "cr664_rolename", request.RoleCode);
                var platformRole = Catalog(service, "cr664_platformrole", "cr664_rolename", request.RoleCode);
                var workspaceType = Catalog(service, "cr664_workspacetype", "cr664_workspacename", request.PrimaryWorkspaceCode);
                var platformWorkspace = Catalog(service, "cr664_platformworkspace", "cr664_workspacename", request.PrimaryWorkspaceCode);
                var additionalTypes = request.AdditionalWorkspaceCodes.ToDictionary(name => name, name => Catalog(service, "cr664_workspacetype", "cr664_workspacename", name), StringComparer.OrdinalIgnoreCase);

                var ids = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase) {
                    { "userDirectory", DeterministicGuid("cr664_userdirectory|" + request.Upn) },
                    { "coreUser", DeterministicGuid("cr664_user|" + request.Upn) },
                    { "platformUser", DeterministicGuid("cr664_platformuser|" + request.Upn) },
                    { "profile", DeterministicGuid("cr664_losuserprofile|" + request.Upn) },
                    { "entitlement", DeterministicGuid("cr664_workspaceentitlements|" + request.Upn + "|" + request.PrimaryWorkspaceCode) }
                };
                if (request.BankerRequired) ids["banker"] = DeterministicGuid("cr664_banker|" + request.Upn);
                var requests = new OrganizationRequestCollection();
                requests.Add(Create(new Entity("cr664_userdirectory", ids["userDirectory"]) { ["cr664_email"] = request.Upn, ["cr664_fullname"] = request.FullName, ["cr664_isactive"] = request.Active, ["cr664_role"] = userRole.ToEntityReference() }));
                requests.Add(Create(new Entity("cr664_user", ids["coreUser"]) { ["cr664_username"] = request.FullName, ["cr664_email"] = request.Upn, ["cr664_activeaccessflag"] = request.Active, ["cr664_role"] = userRole.ToEntityReference(), ["cr664_primaryworkspace"] = workspaceType.ToEntityReference() }));
                requests.Add(Create(new Entity("cr664_platformuser", ids["platformUser"]) { ["cr664_fullname"] = request.FullName, ["cr664_email"] = request.Upn, ["cr664_normalizedemail"] = request.Upn, ["cr664_activestatus"] = request.Active, ["cr664_identitystatus"] = new OptionSetValue(request.Active ? ActiveIdentity : 788190002), ["cr664_createdat"] = DateTime.UtcNow, ["cr664_provisioningsource"] = ProvisionMessage, ["cr664_coreuser"] = new EntityReference("cr664_user", ids["coreUser"]), ["cr664_role"] = platformRole.ToEntityReference(), ["cr664_primaryworkspace"] = platformWorkspace.ToEntityReference() }));
                requests.Add(Create(new Entity("cr664_losuserprofile", ids["profile"]) { ["cr664_profilename"] = request.Upn, ["cr664_platformrole"] = request.RoleCode, ["cr664_primaryworkspace"] = request.PrimaryWorkspaceCode, ["cr664_status"] = new OptionSetValue(request.Active ? ActiveProfile : 788190001), ["cr664_user"] = new EntityReference("cr664_user", ids["coreUser"]) }));
                if (request.BankerRequired) requests.Add(Create(new Entity("cr664_banker", ids["banker"]) { ["cr664_fullname"] = request.FullName, ["cr664_email"] = request.Upn, ["cr664_activeflag"] = request.Active, ["cr664_roletype"] = new OptionSetValue(string.Equals(request.RoleCode, "Manager", StringComparison.OrdinalIgnoreCase) ? 788190001 : 788190000), ["cr664_userloginmapping"] = new EntityReference("cr664_user", ids["coreUser"]) }));
                requests.Add(Create(new Entity("cr664_workspaceentitlements", ids["entitlement"]) { ["cr664_entitlementname"] = request.FullName + " - " + request.PrimaryWorkspaceCode, ["cr664_accesslevel"] = new OptionSetValue(request.AdminAccessRequired ? AdminAccess : FullAccess), ["cr664_isdefault"] = true, ["cr664_losuserprofile"] = new EntityReference("cr664_losuserprofile", ids["profile"]), ["cr664_workspace"] = workspaceType.ToEntityReference() }));
                foreach (var pair in additionalTypes)
                {
                    var id = DeterministicGuid("cr664_useradditionalworkspaceaccess|" + request.Upn + "|" + pair.Key);
                    ids["additionalWorkspace:" + pair.Key] = id;
                    requests.Add(Create(new Entity("cr664_useradditionalworkspaceaccess", id) { ["cr664_accessname"] = request.FullName + " - " + pair.Key, ["cr664_user_email"] = request.Upn, ["cr664_user"] = new EntityReference("cr664_user", ids["coreUser"]), ["cr664_workspacetype"] = pair.Value.ToEntityReference() }));
                }
                service.Execute(new ExecuteTransactionRequest { Requests = requests, ReturnResponses = true });
                VerifyReadback(service, request, ids);
                var completed = Audit(actor, request, correlationId, "LosUserProvisioningCompleted", 788190000, null, "Complete identity/access chain read back successfully.");
                service.Create(completed);
                service.Update(new Entity("cr664_auditevent", requestedAudit.Id) { ["cr664_afterstate"] = "Completed audit: " + completed.Id.ToString("D") });
                context.OutputParameters["ResultJson"] = Json(new Dictionary<string, object> { { "status", "completed" }, { "correlationId", correlationId.ToString("D") }, { "verification", "verified" }, { "recordsCreated", ids.ToDictionary(p => p.Key, p => (object)p.Value.ToString("D")) }, { "recordsReused", new Dictionary<string, object>() }, { "recordsUpdated", new Dictionary<string, object>() }, { "request", request } });
            }
            catch (Exception error)
            {
                var failed = Audit(actor, request, correlationId, "LosUserProvisioningFailed", 788190001, error.Message, "No successful provisioning result was issued.");
                try { service.Create(failed); service.Update(new Entity("cr664_auditevent", requestedAudit.Id) { ["cr664_failurereason"] = error.Message, ["cr664_outcomestatus"] = new OptionSetValue(788190001) }); } catch { }
                context.OutputParameters["ResultJson"] = Json(new Dictionary<string, object> { { "status", "failed" }, { "correlationId", correlationId.ToString("D") }, { "code", Code(error) }, { "message", Safe(error) }, { "failedStep", "transaction_or_readback" } });
            }
        }

        private static Actor ResolveAdministrator(IOrganizationService service, Guid actorId)
        {
            var systemUser = service.Retrieve("systemuser", actorId, new ColumnSet("domainname", "internalemailaddress", "fullname", "isdisabled"));
            if (systemUser.GetAttributeValue<bool>("isdisabled")) Deny("ACTOR_DISABLED", "The authenticated administrator is disabled.");
            var upn = NormalizeUpn(systemUser.GetAttributeValue<string>("domainname") ?? systemUser.GetAttributeValue<string>("internalemailaddress"));
            var core = ExactlyOne(service, "cr664_user", "cr664_email", upn, "ADMIN_CORE_USER");
            if (!core.GetAttributeValue<bool>("cr664_activeaccessflag")) Deny("ADMIN_INACTIVE", "The authenticated LOS administrator is inactive.");
            var directory = ExactlyOne(service, "cr664_userdirectory", "cr664_email", upn, "ADMIN_DIRECTORY_INVALID");
            if (!directory.GetAttributeValue<bool>("cr664_isactive")) Deny("ADMIN_INACTIVE", "The authenticated User Directory identity is inactive.");
            var directoryRole = directory.GetAttributeValue<EntityReference>("cr664_role");
            if (directoryRole == null || !string.Equals(service.Retrieve("cr664_userrole", directoryRole.Id, new ColumnSet("cr664_rolename")).GetAttributeValue<string>("cr664_rolename"), "System Super Admin", StringComparison.OrdinalIgnoreCase)) Deny("ADMIN_ROLE_INVALID", "The standard provisioning workflow requires the governed System Super Admin directory role; it never grants that role.");
            var profiles = Find(service, "cr664_losuserprofile", "cr664_user", core.Id).Where(Active).ToList();
            if (profiles.Count != 1) Deny("ADMIN_PROFILE_INVALID", "Exactly one active LOS profile is required for the administrator.");
            var entitlements = Find(service, "cr664_workspaceentitlements", "cr664_losuserprofile", profiles[0].Id).Where(Active).ToList();
            if (!entitlements.Any(row => row.GetAttributeValue<OptionSetValue>("cr664_accesslevel")?.Value == AdminAccess)) Deny("ADMIN_AUTHORITY_MISSING", "An active Admin workspace entitlement is required to provision users.");
            return new Actor { CoreUser = core, Upn = upn, FullName = systemUser.GetAttributeValue<string>("fullname") ?? upn };
        }

        private static Entity ResolveSystemUser(IOrganizationService service, string upn)
        {
            var query = new QueryExpression("systemuser") { ColumnSet = new ColumnSet("fullname", "domainname", "internalemailaddress", "isdisabled", "businessunitid") };
            var anyEmail = new FilterExpression(LogicalOperator.Or); anyEmail.AddCondition("domainname", ConditionOperator.Equal, upn); anyEmail.AddCondition("internalemailaddress", ConditionOperator.Equal, upn); query.Criteria.AddFilter(anyEmail);
            var rows = service.RetrieveMultiple(query).Entities.ToList();
            if (rows.Count == 0) Deny("MICROSOFT_USER_NOT_FOUND", "The Microsoft user was not found in Commercial LOS Production.");
            if (rows.Count > 1) Deny("MICROSOFT_USER_DUPLICATE", "More than one Microsoft user matched the normalized email.");
            if (rows[0].GetAttributeValue<bool>("isdisabled")) Deny("MICROSOFT_USER_DISABLED", "The Microsoft user exists but is disabled.");
            return rows[0];
        }

        private static string[] ResolveDataverseRoles(IOrganizationService service, Guid systemUserId)
        {
            var links = Find(service, "systemuserroles", "systemuserid", systemUserId);
            var names = new List<string>();
            foreach (var link in links)
            {
                var value = link.Contains("roleid") ? link["roleid"] : null;
                var roleId = value is EntityReference reference ? reference.Id : value is Guid id ? id : Guid.Empty;
                if (roleId != Guid.Empty) names.Add(service.Retrieve("role", roleId, new ColumnSet("name")).GetAttributeValue<string>("name"));
            }
            return names.Where(name => !string.IsNullOrWhiteSpace(name)).ToArray();
        }

        private static Dictionary<string, string> InspectExisting(IOrganizationService service, string upn)
        {
            return InspectExistingEntities(service, upn).Where(pair => pair.Value.Count == 1).ToDictionary(pair => pair.Key, pair => pair.Value[0].Id.ToString("D"));
        }

        private static Dictionary<string, List<Entity>> InspectExistingEntities(IOrganizationService service, string upn)
        {
            return new Dictionary<string, List<Entity>> {
                { "userDirectory", Find(service, "cr664_userdirectory", "cr664_email", upn) },
                { "coreUser", Find(service, "cr664_user", "cr664_email", upn) },
                { "platformUser", Find(service, "cr664_platformuser", "cr664_normalizedemail", upn) }
            };
        }

        private static Entity Catalog(IOrganizationService service, string table, string nameField, string name)
        {
            var rows = Find(service, table, nameField, name).Where(Active).ToList();
            if (rows.Count == 0) Fail("CATALOG_MISSING", table + " has no active exact match for " + name + ".");
            if (rows.Count > 1) Fail("CATALOG_AMBIGUOUS", table + " has duplicate active matches for " + name + ".");
            return rows[0];
        }

        private static string[] CatalogNames(IOrganizationService service, string table, string nameField)
        {
            var query = new QueryExpression(table) { ColumnSet = new ColumnSet(nameField, "statecode") };
            return service.RetrieveMultiple(query).Entities.Where(Active).Select(row => row.GetAttributeValue<string>(nameField)).Where(name => !string.IsNullOrWhiteSpace(name)).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        }

        private static void VerifyReadback(IOrganizationService service, Request request, Dictionary<string, Guid> ids)
        {
            var core = service.Retrieve("cr664_user", ids["coreUser"], new ColumnSet("cr664_email", "cr664_primaryworkspace", "cr664_role", "cr664_activeaccessflag"));
            var platform = service.Retrieve("cr664_platformuser", ids["platformUser"], new ColumnSet("cr664_normalizedemail", "cr664_coreuser", "cr664_primaryworkspace", "cr664_identitystatus"));
            var profile = service.Retrieve("cr664_losuserprofile", ids["profile"], new ColumnSet("cr664_user", "cr664_status"));
            var entitlement = service.Retrieve("cr664_workspaceentitlements", ids["entitlement"], new ColumnSet("cr664_losuserprofile", "cr664_workspace", "cr664_accesslevel"));
            if (!string.Equals(core.GetAttributeValue<string>("cr664_email"), request.Upn, StringComparison.OrdinalIgnoreCase) || platform.GetAttributeValue<EntityReference>("cr664_coreuser")?.Id != core.Id || profile.GetAttributeValue<EntityReference>("cr664_user")?.Id != core.Id || entitlement.GetAttributeValue<EntityReference>("cr664_losuserprofile")?.Id != profile.Id) Fail("READBACK_FAILED", "The required identity and entitlement relationships did not read back exactly.");
            if (request.BankerRequired) { var banker = service.Retrieve("cr664_banker", ids["banker"], new ColumnSet("cr664_userloginmapping", "cr664_activeflag")); if (banker.GetAttributeValue<EntityReference>("cr664_userloginmapping")?.Id != core.Id) Fail("BANKER_READBACK_FAILED", "The required Banker relationship did not read back."); }
        }

        private static void ValidateRequest(Request request)
        {
            if (request == null) Deny("REQUEST_INVALID", "RequestJson is required.");
            request.Upn = NormalizeUpn(request.Upn); RequireEnvironment(request.EnvironmentId);
            if (string.IsNullOrWhiteSpace(request.FullName) || string.IsNullOrWhiteSpace(request.MicrosoftSystemUserId)) Deny("REQUEST_INVALID", "Verified Microsoft identity details are required.");
            if (!AllowedWorkspaces.ContainsKey(request.RoleCode)) Deny("ROLE_INVALID", "The selected LOS role is not approved.");
            if (request.RoleCode.IndexOf("Super Admin", StringComparison.OrdinalIgnoreCase) >= 0) Deny("SUPER_ADMIN_PROHIBITED", "System Super Admin cannot be granted through the standard workflow.");
            if (!AllowedWorkspaces[request.RoleCode].Contains(request.PrimaryWorkspaceCode, StringComparer.OrdinalIgnoreCase) || request.AdditionalWorkspaceCodes.Any(name => !AllowedWorkspaces[request.RoleCode].Contains(name, StringComparer.OrdinalIgnoreCase))) Deny("ROLE_WORKSPACE_INVALID", "The selected role/workspace combination is not approved.");
            if ((request.RoleCode == "Admin") != request.AdminAccessRequired) Deny("ADMIN_ACCESS_INVALID", "Admin role and Admin access must agree.");
            if (request.AdminAccessRequired && !request.AdminConfirmation) Deny("ADMIN_CONFIRMATION_REQUIRED", "Explicit Admin confirmation is required.");
        }

        private static Entity Audit(Actor actor, Request request, Guid correlationId, string name, int outcome, string failure, string after)
        {
            return new Entity("cr664_auditevent", DeterministicGuid(name + "|" + correlationId)) { ["cr664_auditeventname"] = name, ["cr664_changedby"] = actor.CoreUser.ToEntityReference(), ["cr664_changeddate"] = DateTime.UtcNow, ["cr664_entityid"] = request.MicrosoftSystemUserId, ["cr664_entitytype"] = new OptionSetValue(788190003), ["cr664_eventcategory"] = new OptionSetValue(788190001), ["cr664_eventtype"] = new OptionSetValue(788190008), ["cr664_outcomestatus"] = new OptionSetValue(outcome), ["cr664_correlationid"] = correlationId.ToString("D"), ["cr664_relatedentityid"] = request.Upn, ["cr664_relatedentitytype"] = "LosUserProvisioning", ["cr664_sourcescreensourceprocess"] = "Admin Workspace / User Access", ["cr664_beforestate"] = Json(request), ["cr664_afterstate"] = after, ["cr664_failurereason"] = failure ?? string.Empty, ["cr664_notes"] = "Administrator=" + actor.Upn + "; EnvironmentId=" + ProductionEnvironmentId };
        }

        private static CreateRequest Create(Entity target) { return new CreateRequest { Target = target }; }
        private static Entity ExactlyOne(IOrganizationService service, string table, string field, object value, string code) { var rows = Find(service, table, field, value); if (rows.Count != 1) Deny(code, "Exactly one matching " + table + " row is required."); return rows[0]; }
        private static List<Entity> Find(IOrganizationService service, string table, string field, object value) { var query = new QueryExpression(table) { ColumnSet = new ColumnSet(true) }; query.Criteria.AddCondition(field, ConditionOperator.Equal, value); return service.RetrieveMultiple(query).Entities.ToList(); }
        private static bool Active(Entity row) { return !row.Contains("statecode") || row.GetAttributeValue<OptionSetValue>("statecode")?.Value == 0 || (row["statecode"] is int && (int)row["statecode"] == 0); }
        private static void RequireEnvironment(string value) { if (!string.Equals(value, ProductionEnvironmentId, StringComparison.OrdinalIgnoreCase)) Deny("ENVIRONMENT_MISMATCH", "Provisioning is locked to Commercial LOS Production."); }
        private static string NormalizeUpn(string value) { var upn = (value ?? string.Empty).Trim().ToLowerInvariant(); if (!upn.EndsWith("@oldglorybank.com", StringComparison.Ordinal) || upn.Split('@').Length != 2) Deny("EMAIL_INVALID", "Enter an approved @oldglorybank.com email address."); return upn; }
        private static string Input(IPluginExecutionContext context, string name) { if (!context.InputParameters.Contains(name) || string.IsNullOrWhiteSpace(Convert.ToString(context.InputParameters[name]))) Deny("INPUT_INVALID", name + " is required."); return Convert.ToString(context.InputParameters[name]); }
        private static Guid DeterministicGuid(string value) { using (var sha = SHA256.Create()) { var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(value)).Take(16).ToArray(); bytes[7] = (byte)((bytes[7] & 15) | 80); bytes[8] = (byte)((bytes[8] & 63) | 128); return new Guid(bytes); } }
        private static T Deserialize<T>(string json) { using (var stream = new MemoryStream(Encoding.UTF8.GetBytes(json))) return (T)new DataContractJsonSerializer(typeof(T)).ReadObject(stream); }
        private static string Json(object value)
        {
            using (var stream = new MemoryStream())
            {
                var serializer = new DataContractJsonSerializer(value.GetType(), new DataContractJsonSerializerSettings
                {
                    UseSimpleDictionaryFormat = true,
                    KnownTypes = new[] { typeof(string[]), typeof(Dictionary<string, string>), typeof(Dictionary<string, object>), typeof(Request) }
                });
                serializer.WriteObject(stream, value);
                return Encoding.UTF8.GetString(stream.ToArray());
            }
        }
        private static string Code(Exception error) { var message = error.Message ?? string.Empty; var split = message.IndexOf(':'); return split > 0 ? message.Substring(0, split) : "PROVISIONING_FAILED"; }
        private static string Safe(Exception error) { return error is InvalidPluginExecutionException ? error.Message : "The governed provisioning transaction failed."; }
        private static void Fail(string code, string message) { throw new InvalidPluginExecutionException(code + ": " + message); }
        private static void Deny(string code, string message) { throw new InvalidPluginExecutionException(code + ": " + message); }

        private sealed class Actor { public Entity CoreUser; public string Upn; public string FullName; }
        [DataContract]
        public sealed class Request
        {
            [DataMember(Name = "microsoftSystemUserId")] public string MicrosoftSystemUserId { get; set; }
            [DataMember(Name = "upn")] public string Upn { get; set; }
            [DataMember(Name = "fullName")] public string FullName { get; set; }
            [DataMember(Name = "roleCode")] public string RoleCode { get; set; }
            [DataMember(Name = "primaryWorkspaceCode")] public string PrimaryWorkspaceCode { get; set; }
            [DataMember(Name = "additionalWorkspaceCodes")] public string[] AdditionalWorkspaceCodes { get; set; } = new string[0];
            [DataMember(Name = "bankerRequired")] public bool BankerRequired { get; set; }
            [DataMember(Name = "adminAccessRequired")] public bool AdminAccessRequired { get; set; }
            [DataMember(Name = "active")] public bool Active { get; set; }
            [DataMember(Name = "adminConfirmation")] public bool AdminConfirmation { get; set; }
            [DataMember(Name = "environmentId")] public string EnvironmentId { get; set; }
        }
    }
}
