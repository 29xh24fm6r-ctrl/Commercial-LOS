using System.Security.Cryptography;
using System.Text;
using CommercialLendingLOS.Plugins;
using CommercialLendingLOS.Plugins.Tests.Fakes;
using Microsoft.Xrm.Sdk;

namespace CommercialLendingLOS.Plugins.Tests;

public sealed class ConfigurableCreditGovernancePluginTests
{
    private static readonly DateTime Now = DateTime.UtcNow;

    private sealed class Fixture
    {
        public FakeServiceProvider Provider { get; } = new();
        public Guid ActorId { get; } = Guid.NewGuid();
        public Guid DealId { get; } = Guid.NewGuid();
        public Guid ClientId { get; } = Guid.NewGuid();
        public Entity Profile { get; }
        public Entity Policy { get; }
        public Entity Deal { get; }
        public Entity Grant { get; }

        public Fixture(string? snapshot = null)
        {
            Provider.Context.InitiatingUserId = ActorId;
            Provider.Context.MessageName = "Create";
            Provider.Context.PrimaryEntityName = "cr664_creditapprovaldecision";
            Provider.Context.Stage = 10;
            Provider.Context.ExecutionMode = 0;
            Provider.Context.InputParameters["Target"] = new Entity("cr664_creditapprovaldecision")
            {
                Id = Guid.NewGuid(),
                ["cr664_dealid"] = DealId.ToString("D"),
            };

            var user = Row("systemuser", ActorId, "actor-v1");
            user["isdisabled"] = false;
            user["azureactivedirectoryobjectid"] = Guid.NewGuid();
            Provider.OrganizationService.Seed(user);

            Profile = Row("cr664_creditgovernanceprofile", Guid.NewGuid(), "profile-v1");
            Profile["cr664_bankkey"] = "OGB";
            Profile["cr664_profileenabled"] = true;
            Provider.OrganizationService.Seed(Profile);

            snapshot ??= ActivePolicy();
            Policy = Row("cr664_creditpolicyversion", Guid.NewGuid(), "policy-v1");
            Policy["cr664_governanceprofile"] = Profile.ToEntityReference();
            Policy["cr664_policyid"] = "policy-1";
            Policy["cr664_versionnumber"] = 1;
            Policy["cr664_policystatus"] = "ACTIVE";
            Policy["cr664_effectivefrom"] = Now.AddDays(-1);
            Policy["cr664_snapshotjson"] = snapshot;
            Policy["cr664_snapshotsha256"] = Hash(snapshot);
            Provider.OrganizationService.Seed(Policy);

            Deal = Row("cr664_loandeal", DealId, "deal-v1");
            Deal["cr664_amount"] = new Money(100m);
            Deal["cr664_client"] = new EntityReference("cr664_clientrelationship", ClientId);
            Deal["cr664_producttype"] = "term";
            Deal["cr664_riskrating"] = "pass";
            Deal["cr664_industry"] = "other";
            Deal["cr664_geography"] = "US";
            Deal["cr664_haspolicyexception"] = false;
            Deal["cr664_policyexceptiontypesjson"] = "[]";
            Deal["cr664_insiderstatus"] = false;
            Deal["cr664_concentrationjson"] = "[]";
            Deal["cr664_governmentguaranteedprogram"] = "NONE";
            Deal["cr664_criticizedclassifiedstatus"] = "NONE";
            Provider.OrganizationService.Seed(Deal);

            var role = Row("cr664_governanceroleassignment", Guid.NewGuid(), "role-v1");
            role["cr664_governanceprofile"] = Profile.ToEntityReference();
            role["cr664_officer"] = new EntityReference("systemuser", ActorId);
            role["cr664_assignmentstate"] = "ACTIVE";
            role["cr664_rolecode"] = "OFFICER";
            role["cr664_effectivefrom"] = Now.AddDays(-1);
            Provider.OrganizationService.Seed(role);

            Grant = Row("cr664_authoritygrant", Guid.NewGuid(), "grant-v1");
            Grant["cr664_governanceprofile"] = Profile.ToEntityReference();
            Grant["cr664_officer"] = new EntityReference("systemuser", ActorId);
            Grant["cr664_grantstate"] = "ACTIVE";
            Grant["cr664_grantid"] = "grant-1";
            Grant["cr664_actionsjson"] = "[\"APPROVE\"]";
            Grant["cr664_maximumamount"] = new Money(1000m);
            Grant["cr664_maximumrelationshipexposure"] = new Money(1000m);
            Grant["cr664_productsjson"] = "[\"term\"]";
            Grant["cr664_riskratingsjson"] = "[\"pass\"]";
            Grant["cr664_geographiesjson"] = "[\"US\"]";
            Grant["cr664_industriesjson"] = "[\"other\"]";
            Grant["cr664_exceptiontypesjson"] = "[]";
            Grant["cr664_effectivefrom"] = Now.AddDays(-1);
            Provider.OrganizationService.Seed(Grant);
        }

        public void Execute() =>
            new ConfigurableCreditGovernancePlugin("bankId=OGB;action=Approve", null)
                .Execute(Provider);

        public Entity Evaluation() =>
            Assert.Single(Provider.OrganizationService.Created.Where(
                value => value.LogicalName == "cr664_governanceevaluation"));
    }

    [Fact]
    public void HostResolvesAuthenticatedActorActivePolicyAuthorityAndPersistsEvaluation()
    {
        var fixture = new Fixture();

        fixture.Execute();

        var evaluation = fixture.Evaluation();
        Assert.Equal(fixture.ActorId, evaluation.GetAttributeValue<EntityReference>("cr664_actor").Id);
        Assert.Equal(fixture.DealId, evaluation.GetAttributeValue<EntityReference>("cr664_loandeal").Id);
        Assert.Equal("PERMIT", evaluation.GetAttributeValue<string>("cr664_decisioncode"));
        Assert.Equal("bank-credit-governance/v2", evaluation.GetAttributeValue<string>("cr664_contractversion"));
        Assert.False(string.IsNullOrWhiteSpace(evaluation.GetAttributeValue<string>("cr664_requestsha256")));
        Assert.False(string.IsNullOrWhiteSpace(evaluation.GetAttributeValue<string>("cr664_resultsha256")));

        fixture.Provider.Context.Stage = 20;
        fixture.Execute();
        Assert.Single(fixture.Provider.OrganizationService.Created.Where(
            value => value.LogicalName == "cr664_governanceevaluation"));

        fixture.Provider.Context.Stage = 40;
        fixture.Execute();
        var evidence = Assert.Single(fixture.Provider.OrganizationService.Created.Where(
            value => value.LogicalName == "cr664_governedactionevidence"));
        Assert.Equal("APPROVE", evidence.GetAttributeValue<string>("cr664_actioncode"));
        Assert.Equal(fixture.ActorId, evidence.GetAttributeValue<EntityReference>("cr664_actor").Id);
    }

    [Fact]
    public void DirectWriteWithoutAuthorityIsBlockedButEvaluationIsAttempted()
    {
        var fixture = new Fixture();
        fixture.Grant["cr664_grantstate"] = "REVOKED";

        var error = Assert.Throws<InvalidPluginExecutionException>(fixture.Execute);

        Assert.Contains("DELEGATED_AUTHORITY_MISSING", error.Message);
        Assert.Equal("BLOCK", fixture.Evaluation().GetAttributeValue<string>("cr664_decisioncode"));
    }

    [Fact]
    public void AuthorityLimitIsEnforced()
    {
        var fixture = new Fixture();
        fixture.Grant["cr664_maximumamount"] = new Money(50m);

        var error = Assert.Throws<InvalidPluginExecutionException>(fixture.Execute);

        Assert.Contains("DELEGATED_AUTHORITY_EXCEEDED", error.Message);
    }

    [Fact]
    public void PreOperationAcceptsSameOperationWhenOnlyDealRowVersionAdvanced()
    {
        var fixture = new Fixture();
        fixture.Execute();
        fixture.Deal.RowVersion = "deal-v2";
        fixture.Profile.RowVersion = "profile-v2";
        fixture.Provider.Context.Stage = 20;

        fixture.Execute();

        Assert.Single(fixture.Provider.OrganizationService.Created.Where(
            value => value.LogicalName == "cr664_governanceevaluation"));
    }

    [Fact]
    public void PreOperationRejectsAuthenticatedActorIdentityChainChange()
    {
        var fixture = new Fixture();
        fixture.Execute();
        var actor = fixture.Provider.OrganizationService.Retrieve(
            "systemuser", fixture.ActorId, new Microsoft.Xrm.Sdk.Query.ColumnSet(true));
        actor.RowVersion = "actor-v2";
        actor["azureactivedirectoryobjectid"] = Guid.NewGuid();
        fixture.Provider.Context.Stage = 20;

        var error = Assert.Throws<InvalidPluginExecutionException>(fixture.Execute);

        Assert.Contains("CONCURRENT_UPDATE_DETECTED", error.Message);
        Assert.Contains("source", error.Message);
    }

    [Fact]
    public void PreOperationRejectsMaterialCaseChangeAfterDurablePreValidationEvaluation()
    {
        var fixture = new Fixture();
        fixture.Execute();
        fixture.Deal.RowVersion = "deal-v2";
        fixture.Deal["cr664_amount"] = new Money(101m);
        fixture.Provider.Context.Stage = 20;

        var error = Assert.Throws<InvalidPluginExecutionException>(fixture.Execute);

        Assert.Contains("CONCURRENT_UPDATE_DETECTED", error.Message);
        Assert.Single(fixture.Provider.OrganizationService.Created.Where(
            value => value.LogicalName == "cr664_governanceevaluation"));
    }

    [Fact]
    public void RoleCombinationIndependenceIsEnforced()
    {
        var snapshot = ActivePolicy("\"independentFrom\":[\"ORIGINATE\"],");
        var fixture = new Fixture(snapshot);
        var evidence = Row("cr664_governedactionevidence", Guid.NewGuid(), "evidence-v1");
        evidence["cr664_governanceprofile"] = fixture.Profile.ToEntityReference();
        evidence["cr664_loandeal"] = fixture.Deal.ToEntityReference();
        evidence["cr664_actor"] = new EntityReference("systemuser", fixture.ActorId);
        evidence["cr664_actioncode"] = "ORIGINATE";
        evidence["cr664_occurredat"] = Now.AddHours(-1);
        evidence["cr664_evidenceid"] = "origin-1";
        fixture.Provider.OrganizationService.Seed(evidence);

        var error = Assert.Throws<InvalidPluginExecutionException>(fixture.Execute);

        Assert.Contains("INDEPENDENCE_REQUIRED", error.Message);
    }

    [Fact]
    public void DisabledOrUnchainedActorIsRejected()
    {
        var fixture = new Fixture();
        var actor = fixture.Provider.OrganizationService.Retrieve(
            "systemuser", fixture.ActorId, new Microsoft.Xrm.Sdk.Query.ColumnSet(true));
        actor["azureactivedirectoryobjectid"] = Guid.Empty;

        var error = Assert.Throws<InvalidPluginExecutionException>(fixture.Execute);

        Assert.Contains("ACTOR_UNRESOLVED", error.Message);
        Assert.Empty(fixture.Provider.OrganizationService.Created);
    }

    [Fact]
    public void MissingOrMalformedPolicyFailsClosed()
    {
        var missing = new Fixture();
        missing.Profile["cr664_profileenabled"] = false;
        Assert.Contains("ACTIVE_POLICY_UNRESOLVED",
            Assert.Throws<InvalidPluginExecutionException>(missing.Execute).Message);

        var malformed = new Fixture("{\"policyId\":\"policy-1\",\"version\":1,\"status\":\"ACTIVE\"}");
        Assert.Contains("POLICY_INVALID",
            Assert.Throws<InvalidPluginExecutionException>(malformed.Execute).Message);
    }

    [Fact]
    public void ExactProductionOptionAPolicyArtifactDeserializes()
    {
        var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../"));
        var snapshot = File.ReadAllText(Path.Combine(root,
            "deployment/bank-credit-governance/initial-ogb-policy-v1.proposed-active.json"));
        var fixture = new Fixture(snapshot);
        fixture.Policy["cr664_policyid"] = "ogb-option-a-initial";

        var error = Assert.Throws<InvalidPluginExecutionException>(fixture.Execute);

        Assert.Contains("ROLE_NOT_PERMITTED", error.Message);
        Assert.DoesNotContain("ACTIVE_POLICY_UNRESOLVED", error.Message);
    }

    [Fact]
    public void RegistrationIsDisabledFirstAndDoesNotTargetLegacyPluginType()
    {
        var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../"));
        var manifest = File.ReadAllText(Path.Combine(root,
            "dataverse-plugins/CommercialLendingLOS.Plugins/ConfigurableCreditGovernanceRegistration.json"));
        var script = File.ReadAllText(Path.Combine(root,
            "scripts/dataverse/register-configurable-credit-governance-plugin.ps1"));

        Assert.Contains("\"initialState\": \"Disabled\"", manifest);
        Assert.Contains("ConfigurableCreditGovernancePlugin", manifest);
        Assert.DoesNotContain("\"pluginType\": \"CommercialLendingLOS.Plugins.DurableRecordGovernancePlugin\"", manifest);
        Assert.Contains("-RegisterDisabled or -EnableAfterApproval", script);
        Assert.Contains("statecode=$(if ($EnableAfterApproval) { 0 } else { 1 })", script);
    }

    [Fact]
    public void InvalidRegistrationOrConfigurationFailsClosed()
    {
        Assert.Throws<InvalidPluginExecutionException>(
            () => new ConfigurableCreditGovernancePlugin("action=Approve", null));
        var fixture = new Fixture();
        fixture.Provider.Context.Stage = 30;
        Assert.Contains("REGISTRATION_INVALID",
            Assert.Throws<InvalidPluginExecutionException>(fixture.Execute).Message);
    }

    private static Entity Row(string logicalName, Guid id, string rowVersion)
    {
        var row = new Entity(logicalName, id) { RowVersion = rowVersion };
        return row;
    }

    private static string ActivePolicy(string extraRequirements = "") => $$"""
    {
      "policyId":"policy-1",
      "version":1,
      "status":"ACTIVE",
      "effectiveFrom":"{{Now.AddDays(-1):O}}",
      "rules":[{
        "ruleId":"approval",
        "description":"approval",
        "actions":["APPROVE"],
        "requirements":{
          {{extraRequirements}}
          "actorRoles":["OFFICER"],
          "delegatedAuthorityRequired":true
        },
        "nonOverrideable":true
      }]
    }
    """;

    private static string Hash(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();
}
