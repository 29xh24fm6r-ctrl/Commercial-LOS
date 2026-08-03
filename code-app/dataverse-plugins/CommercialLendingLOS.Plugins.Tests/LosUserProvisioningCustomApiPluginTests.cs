using CommercialLendingLOS.Plugins.Tests.Fakes;
using Microsoft.Xrm.Sdk;

namespace CommercialLendingLOS.Plugins.Tests;

public sealed class LosUserProvisioningCustomApiPluginTests
{
    private const string TargetUpn = "tester@oldglorybank.com";

    private static FakeServiceProvider Ready(string message = LosUserProvisioningCustomApiPlugin.VerifyMessage)
    {
        var provider = new FakeServiceProvider();
        var actorId = Guid.NewGuid();
        var actorCoreId = Guid.NewGuid();
        var actorProfileId = Guid.NewGuid();
        var actorRoleId = Guid.NewGuid();
        provider.Context.OrganizationId = LosUserProvisioningCustomApiPlugin.ProductionOrganizationId;
        provider.Context.MessageName = message;
        provider.Context.Stage = 30;
        provider.Context.ExecutionMode = 0;
        provider.Context.InitiatingUserId = actorId;
        provider.Context.InputParameters = new ParameterCollection();
        provider.OrganizationService.Seed(new Entity("systemuser", actorId) { ["domainname"] = "admin@oldglorybank.com", ["fullname"] = "Admin User", ["isdisabled"] = false });
        provider.OrganizationService.Seed(new Entity("cr664_user", actorCoreId) { ["cr664_email"] = "admin@oldglorybank.com", ["cr664_activeaccessflag"] = true, ["statecode"] = new OptionSetValue(0) });
        provider.OrganizationService.Seed(new Entity("cr664_userrole", actorRoleId) { ["cr664_rolename"] = "System Super Admin", ["statecode"] = new OptionSetValue(0) });
        provider.OrganizationService.Seed(new Entity("cr664_userdirectory", Guid.NewGuid()) { ["cr664_email"] = "admin@oldglorybank.com", ["cr664_isactive"] = true, ["cr664_role"] = new EntityReference("cr664_userrole", actorRoleId), ["statecode"] = new OptionSetValue(0) });
        provider.OrganizationService.Seed(new Entity("cr664_losuserprofile", actorProfileId) { ["cr664_user"] = new EntityReference("cr664_user", actorCoreId), ["cr664_status"] = new OptionSetValue(788190000), ["statecode"] = new OptionSetValue(0) });
        provider.OrganizationService.Seed(new Entity("cr664_workspaceentitlements", Guid.NewGuid()) { ["cr664_losuserprofile"] = new EntityReference("cr664_losuserprofile", actorProfileId), ["cr664_accesslevel"] = new OptionSetValue(788190002), ["statecode"] = new OptionSetValue(0) });
        SeedMicrosoftUser(provider, TargetUpn);
        provider.Context.InputParameters["EnvironmentId"] = LosUserProvisioningCustomApiPlugin.ProductionEnvironmentId;
        provider.Context.InputParameters["Upn"] = TargetUpn;
        return provider;
    }

    private static Guid SeedMicrosoftUser(FakeServiceProvider provider, string upn)
    {
        var userId = Guid.NewGuid();
        var roleId = Guid.NewGuid();
        provider.OrganizationService.Seed(new Entity("systemuser", userId) { ["domainname"] = upn, ["internalemailaddress"] = upn, ["fullname"] = "Production Tester", ["isdisabled"] = false });
        provider.OrganizationService.Seed(new Entity("role", roleId) { ["name"] = "Basic User" });
        provider.OrganizationService.Seed(new Entity("systemuserroles", Guid.NewGuid()) { ["systemuserid"] = new EntityReference("systemuser", userId), ["roleid"] = new EntityReference("role", roleId) });
        return userId;
    }

    private static void SeedBankerCatalog(FakeServiceProvider provider)
    {
        provider.OrganizationService.Seed(new Entity("cr664_userrole", Guid.NewGuid()) { ["cr664_rolename"] = "Banker", ["statecode"] = new OptionSetValue(0) });
        provider.OrganizationService.Seed(new Entity("cr664_platformrole", Guid.NewGuid()) { ["cr664_rolename"] = "Banker", ["statecode"] = new OptionSetValue(0) });
        provider.OrganizationService.Seed(new Entity("cr664_workspacetype", Guid.NewGuid()) { ["cr664_workspacename"] = "Banker Workspace", ["statecode"] = new OptionSetValue(0) });
        provider.OrganizationService.Seed(new Entity("cr664_platformworkspace", Guid.NewGuid()) { ["cr664_workspacename"] = "Banker Workspace", ["statecode"] = new OptionSetValue(0) });
    }

    private static string BankerRequest(Guid systemUserId, string environmentId = LosUserProvisioningCustomApiPlugin.ProductionEnvironmentId) =>
        "{\"microsoftSystemUserId\":\"" + systemUserId.ToString("D") + "\",\"upn\":\"" + TargetUpn + "\",\"fullName\":\"Production Tester\",\"roleCode\":\"Banker\",\"primaryWorkspaceCode\":\"Banker Workspace\",\"additionalWorkspaceCodes\":[],\"bankerRequired\":true,\"adminAccessRequired\":false,\"active\":true,\"adminConfirmation\":false,\"environmentId\":\"" + environmentId + "\"}";

    [Fact]
    public void Verify_returns_enabled_microsoft_identity_and_base_role()
    {
        var provider = Ready();
        new LosUserProvisioningCustomApiPlugin().Execute(provider);
        var json = Assert.IsType<string>(provider.Context.OutputParameters["ResultJson"]);
        Assert.Contains("verified", json);
        Assert.Contains("Basic User", json);
        Assert.Contains(TargetUpn, json);
        Assert.Empty(provider.OrganizationService.Created);
    }

    [Fact]
    public void Verify_distinguishes_missing_disabled_duplicate_and_environment_mismatch()
    {
        var missing = Ready(); missing.Context.InputParameters["Upn"] = "missing@oldglorybank.com";
        Assert.Contains("MICROSOFT_USER_NOT_FOUND", Assert.Throws<InvalidPluginExecutionException>(() => new LosUserProvisioningCustomApiPlugin().Execute(missing)).Message);
        var disabled = Ready(); SeedMicrosoftUser(disabled, "disabled@oldglorybank.com"); disabled.Context.InputParameters["Upn"] = "disabled@oldglorybank.com";
        disabled.OrganizationService.Seed(new Entity("systemuser", Guid.NewGuid()) { ["domainname"] = "disabled@oldglorybank.com", ["isdisabled"] = true });
        Assert.Contains("MICROSOFT_USER_DUPLICATE", Assert.Throws<InvalidPluginExecutionException>(() => new LosUserProvisioningCustomApiPlugin().Execute(disabled)).Message);
        var mismatch = Ready(); mismatch.Context.OrganizationId = Guid.NewGuid();
        Assert.Contains("ENVIRONMENT_MISMATCH", Assert.Throws<InvalidPluginExecutionException>(() => new LosUserProvisioningCustomApiPlugin().Execute(mismatch)).Message);
    }

    [Fact]
    public void Verify_reports_existing_los_identity_instead_of_new_user()
    {
        var provider = Ready();
        provider.OrganizationService.Seed(new Entity("cr664_platformuser", Guid.NewGuid()) { ["cr664_normalizedemail"] = TargetUpn });
        new LosUserProvisioningCustomApiPlugin().Execute(provider);
        Assert.Contains("existing_los_user", Assert.IsType<string>(provider.Context.OutputParameters["ResultJson"]));
    }

    [Fact]
    public void Provision_creates_complete_banker_chain_transactionally_and_reads_it_back()
    {
        var provider = Ready(LosUserProvisioningCustomApiPlugin.ProvisionMessage);
        SeedBankerCatalog(provider);
        var target = provider.OrganizationService.RetrieveMultiple(new Microsoft.Xrm.Sdk.Query.QueryExpression("systemuser")).Entities.Single(row => row.GetAttributeValue<string>("domainname") == TargetUpn);
        provider.Context.InputParameters["RequestJson"] = BankerRequest(target.Id);
        new LosUserProvisioningCustomApiPlugin().Execute(provider);
        var json = Assert.IsType<string>(provider.Context.OutputParameters["ResultJson"]);
        Assert.Contains("completed", json); Assert.Contains("verified", json);
        foreach (var table in new[] { "cr664_userdirectory", "cr664_user", "cr664_platformuser", "cr664_losuserprofile", "cr664_banker", "cr664_workspaceentitlements" }) Assert.Contains(provider.OrganizationService.Created, row => row.LogicalName == table);
        Assert.Equal(2, provider.OrganizationService.Created.Count(row => row.LogicalName == "cr664_auditevent"));
    }

    [Fact]
    public void Provision_fails_closed_on_duplicate_identity_and_missing_catalog()
    {
        var duplicate = Ready(LosUserProvisioningCustomApiPlugin.ProvisionMessage);
        var target = duplicate.OrganizationService.RetrieveMultiple(new Microsoft.Xrm.Sdk.Query.QueryExpression("systemuser")).Entities.Single(row => row.GetAttributeValue<string>("domainname") == TargetUpn);
        duplicate.OrganizationService.Seed(new Entity("cr664_userdirectory", Guid.NewGuid()) { ["cr664_email"] = TargetUpn });
        duplicate.Context.InputParameters["RequestJson"] = BankerRequest(target.Id);
        new LosUserProvisioningCustomApiPlugin().Execute(duplicate);
        Assert.Contains("EXISTING_LOS_USER", Assert.IsType<string>(duplicate.Context.OutputParameters["ResultJson"]));
        Assert.DoesNotContain(duplicate.OrganizationService.Created, row => row.LogicalName == "cr664_platformuser");

        var missingCatalog = Ready(LosUserProvisioningCustomApiPlugin.ProvisionMessage);
        target = missingCatalog.OrganizationService.RetrieveMultiple(new Microsoft.Xrm.Sdk.Query.QueryExpression("systemuser")).Entities.Single(row => row.GetAttributeValue<string>("domainname") == TargetUpn);
        missingCatalog.Context.InputParameters["RequestJson"] = BankerRequest(target.Id);
        new LosUserProvisioningCustomApiPlugin().Execute(missingCatalog);
        Assert.Contains("CATALOG_MISSING", Assert.IsType<string>(missingCatalog.Context.OutputParameters["ResultJson"]));
        Assert.DoesNotContain(missingCatalog.OrganizationService.Created, row => row.LogicalName == "cr664_user");
    }

    [Fact]
    public void Non_admin_and_standard_super_admin_request_are_rejected()
    {
        var nonAdmin = Ready();
        var entitlement = nonAdmin.OrganizationService.RetrieveMultiple(new Microsoft.Xrm.Sdk.Query.QueryExpression("cr664_workspaceentitlements")).Entities.Single();
        entitlement["cr664_accesslevel"] = new OptionSetValue(788190000);
        Assert.Contains("ADMIN_AUTHORITY_MISSING", Assert.Throws<InvalidPluginExecutionException>(() => new LosUserProvisioningCustomApiPlugin().Execute(nonAdmin)).Message);

        var provider = Ready(LosUserProvisioningCustomApiPlugin.ProvisionMessage);
        var target = provider.OrganizationService.RetrieveMultiple(new Microsoft.Xrm.Sdk.Query.QueryExpression("systemuser")).Entities.Single(row => row.GetAttributeValue<string>("domainname") == TargetUpn);
        provider.Context.InputParameters["RequestJson"] = BankerRequest(target.Id).Replace("\"Banker\"", "\"System Super Admin\"");
        Assert.Contains("ROLE_INVALID", Assert.Throws<InvalidPluginExecutionException>(() => new LosUserProvisioningCustomApiPlugin().Execute(provider)).Message);
    }

    [Theory]
    [InlineData("cr664_banker")]
    [InlineData("cr664_workspaceentitlements")]
    public void Transaction_failure_creates_no_partial_identity_chain_and_records_failed_attempt(string failingTable)
    {
        var provider = Ready(LosUserProvisioningCustomApiPlugin.ProvisionMessage);
        SeedBankerCatalog(provider);
        var target = provider.OrganizationService.RetrieveMultiple(new Microsoft.Xrm.Sdk.Query.QueryExpression("systemuser")).Entities.Single(row => row.GetAttributeValue<string>("domainname") == TargetUpn);
        provider.Context.InputParameters["RequestJson"] = BankerRequest(target.Id);
        provider.OrganizationService.FailCreateLogicalName = failingTable;
        new LosUserProvisioningCustomApiPlugin().Execute(provider);
        Assert.Contains("failed", Assert.IsType<string>(provider.Context.OutputParameters["ResultJson"]));
        Assert.DoesNotContain(provider.OrganizationService.Created, row => new[] { "cr664_userdirectory", "cr664_user", "cr664_platformuser", "cr664_losuserprofile", "cr664_banker", "cr664_workspaceentitlements" }.Contains(row.LogicalName));
        Assert.Equal(2, provider.OrganizationService.Created.Count(row => row.LogicalName == "cr664_auditevent"));
    }
}
