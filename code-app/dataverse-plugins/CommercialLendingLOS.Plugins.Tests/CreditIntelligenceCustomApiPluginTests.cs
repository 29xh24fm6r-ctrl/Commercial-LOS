using CommercialLendingLOS.Plugins.Tests.Fakes;
using Microsoft.Xrm.Sdk;

namespace CommercialLendingLOS.Plugins.Tests;

public sealed class CreditIntelligenceCustomApiPluginTests
{
    private static FakeServiceProvider Ready(string tool = "research_party")
    {
        var provider = new FakeServiceProvider();
        var actorId = Guid.NewGuid();
        provider.Context.InitiatingUserId = actorId;
        provider.Context.MessageName = CreditIntelligenceCustomApiPlugin.MessageName;
        provider.Context.Stage = 30;
        provider.Context.ExecutionMode = 0;
        provider.Context.PrimaryEntityName = string.Empty;
        provider.Context.InputParameters = new ParameterCollection
        {
            { "CorrelationId", Guid.NewGuid().ToString("D") },
            { "Tool", tool }, { "BankId", "old-glory-bank" },
            { "RequestedSourceIdsJson", "[\"dataverse-los\"]" }
        };
        provider.OrganizationService.Seed(new Entity("systemuser", actorId)
        {
            ["domainname"] = "banker@oldglorybank.com", ["isdisabled"] = false
        });
        provider.OrganizationService.Seed(new Entity("cr664_creditintelligencepermission", Guid.NewGuid())
        {
            ["cr664_actor"] = new EntityReference("systemuser", actorId),
            ["cr664_tool"] = tool, ["cr664_bankid"] = "old-glory-bank",
            ["statecode"] = new OptionSetValue(0), ["cr664_effectivefrom"] = DateTime.UtcNow.AddDays(-1)
        });
        return provider;
    }

    [Fact]
    public void Produces_permission_scoped_evidence_and_durable_audit()
    {
        var provider = Ready();
        var dealId = Guid.NewGuid();
        provider.Context.InputParameters["DealId"] = dealId.ToString("D");
        provider.OrganizationService.Seed(new Entity("cr664_loandeal", dealId)
        {
            ["cr664_name"] = "Acme", ["cr664_amount"] = new Money(750000m), ["cr664_riskrating"] = "Pass"
        });

        try
        {
            new CreditIntelligenceCustomApiPlugin().Execute(provider);
        }
        catch (Exception error)
        {
            throw new InvalidOperationException(error.Message + " | TRACE: " + string.Join(" | ", provider.Tracing.Lines), error);
        }

        var json = Assert.IsType<string>(provider.Context.OutputParameters["ResultJson"]);
        Assert.Contains("complete", json);
        Assert.Contains("dataverse-los", json);
        Assert.DoesNotContain("banker@oldglorybank.com", json);
        Assert.Contains(provider.OrganizationService.Created, row => row.LogicalName == "cr664_creditintelligencerun");
        Assert.Contains(provider.OrganizationService.Created, row => row.LogicalName == "cr664_creditevidence");
        Assert.Equal(3, provider.OrganizationService.Created.Count(row => row.LogicalName == "cr664_creditfact"));
        Assert.All(provider.OrganizationService.Created.Where(row => row.LogicalName == "cr664_creditfact"), row => Assert.True(row.Contains("cr664_evidence")));
        Assert.Contains(provider.OrganizationService.Updated, row => row.LogicalName == "cr664_creditintelligencerun" && (string)row["cr664_status"] == "COMPLETE");
    }

    [Fact]
    public void Rejects_missing_permission_before_creating_an_audit_run()
    {
        var provider = Ready();
        provider.Context.InputParameters["Tool"] = "portfolio_monitoring";
        var error = Assert.Throws<InvalidPluginExecutionException>(() => new CreditIntelligenceCustomApiPlugin().Execute(provider));
        Assert.Contains("TOOL_PERMISSION_MISSING", error.Message);
        Assert.DoesNotContain(provider.OrganizationService.Created, row => row.LogicalName == "cr664_creditintelligencerun");
    }

    [Fact]
    public void Rejects_duplicate_effective_permissions()
    {
        var provider = Ready();
        provider.OrganizationService.Seed(new Entity("cr664_creditintelligencepermission", Guid.NewGuid())
        {
            ["cr664_actor"] = new EntityReference("systemuser", provider.Context.InitiatingUserId),
            ["cr664_tool"] = "research_party", ["cr664_bankid"] = "old-glory-bank", ["statecode"] = new OptionSetValue(0)
        });
        var error = Assert.Throws<InvalidPluginExecutionException>(() => new CreditIntelligenceCustomApiPlugin().Execute(provider));
        Assert.Contains("TOOL_PERMISSION_AMBIGUOUS", error.Message);
    }

    [Fact]
    public void Governance_explanation_requires_a_stored_hashed_evaluation()
    {
        var provider = Ready("explain_governance_route");
        var error = Assert.Throws<InvalidPluginExecutionException>(() => new CreditIntelligenceCustomApiPlugin().Execute(provider));
        Assert.Contains("GOVERNANCE_EVALUATION_REQUIRED", error.Message);
        Assert.Contains(provider.OrganizationService.Updated, row => row.LogicalName == "cr664_creditintelligencerun" && (string)row["cr664_status"] == "BLOCKED");
    }

    [Fact]
    public void Rejects_unregistered_sources_and_tools()
    {
        var provider = Ready();
        provider.Context.InputParameters["RequestedSourceIdsJson"] = "[\"arbitrary-web\"]";
        Assert.Contains("SOURCE_SCOPE_INVALID", Assert.Throws<InvalidPluginExecutionException>(() => new CreditIntelligenceCustomApiPlugin().Execute(provider)).Message);
        provider = Ready();
        provider.Context.InputParameters["Tool"] = "approve_credit";
        Assert.Contains("TOOL_INVALID", Assert.Throws<InvalidPluginExecutionException>(() => new CreditIntelligenceCustomApiPlugin().Execute(provider)).Message);
    }

    [Fact]
    public void Rejects_disabled_authenticated_actor()
    {
        var provider = Ready();
        provider.OrganizationService.Seed(new Entity("systemuser", provider.Context.InitiatingUserId) { ["isdisabled"] = true });
        Assert.Contains("ACTOR_DISABLED", Assert.Throws<InvalidPluginExecutionException>(() => new CreditIntelligenceCustomApiPlugin().Execute(provider)).Message);
    }
}
