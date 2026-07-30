using System.Collections.Concurrent;
using System.Text.Json;
using CommercialLendingLOS.Plugins;
using CommercialLendingLOS.Plugins.Tests.Fakes;
using Microsoft.Xrm.Sdk;

namespace CommercialLendingLOS.Plugins.Tests;

public sealed class GovernanceNaturalKeyGuardPluginTests
{
    private static readonly DateTime Effective = new(2026, 7, 30, 0, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Create_AssignsStableNativeGuidFromNaturalKey()
    {
        var first = NewProvider();
        var second = NewProvider();
        var left = Profile("OGB");
        var right = Profile("ogb");

        RunCreate(first, left);
        RunCreate(second, right);

        Assert.NotEqual(Guid.Empty, left.Id);
        Assert.Equal(left.Id, right.Id);
    }

    [Fact]
    public void Create_RejectsPersistedNaturalKeyDuplicate()
    {
        var provider = NewProvider();
        provider.OrganizationService.Seed(Profile("OGB", Guid.NewGuid()));
        var duplicate = Profile("OGB");

        var error = Assert.Throws<InvalidPluginExecutionException>(() => RunCreate(provider, duplicate));

        Assert.Contains("GOVERNANCE_DUPLICATE", error.Message);
    }

    [Fact]
    public void Update_RejectsNaturalKeyMutation()
    {
        var provider = NewProvider();
        var pre = Profile("OGB", Guid.NewGuid());
        provider.OrganizationService.Seed(pre);
        var target = new Entity(pre.LogicalName, pre.Id) { ["cr664_bankkey"] = "OTHER" };

        var error = Assert.Throws<InvalidPluginExecutionException>(() => RunUpdate(provider, pre, target));

        Assert.Contains("NATURAL_KEY_IMMUTABLE", error.Message);
    }

    [Fact]
    public void ConcurrentCreates_CannotCommitDuplicateEffectiveRecord()
    {
        var provider = NewProvider();
        var left = Profile("OGB");
        var right = Profile("OGB");
        RunCreate(provider, left);
        RunCreate(provider, right);
        Assert.Equal(left.Id, right.Id);

        var outcomes = new ConcurrentBag<string>();
        Parallel.Invoke(
            () => TryCreate(provider, left, outcomes),
            () => TryCreate(provider, right, outcomes));

        Assert.Single(outcomes, value => value == "created");
        Assert.Single(outcomes, value => value == "duplicate-native-guid");
    }

    [Fact]
    public void ActivePolicy_RejectsOverlappingVersionAndLocksProfile()
    {
        var provider = NewProvider();
        var profile = SeedProfile(provider);
        provider.OrganizationService.Seed(Policy(profile, 1, Effective.AddDays(-1)));
        var overlapping = Policy(profile, 2, Effective);

        var error = Assert.Throws<InvalidPluginExecutionException>(() => RunCreate(provider, overlapping));

        Assert.Contains("ACTIVE_POLICY_DUPLICATE", error.Message);
        Assert.Contains(provider.OrganizationService.Updated, row =>
            row.LogicalName == profile.LogicalName && row.Id == profile.Id);
    }

    [Fact]
    public void AuthorityGrant_RejectsDuplicateEffectiveScope()
    {
        var provider = NewProvider();
        var profile = SeedProfile(provider);
        var officer = Guid.NewGuid();
        provider.OrganizationService.Seed(Grant(profile, officer, "grant-1"));
        var duplicateScope = Grant(profile, officer, "grant-2");

        var error = Assert.Throws<InvalidPluginExecutionException>(() => RunCreate(provider, duplicateScope));

        Assert.Contains("EFFECTIVE_GOVERNANCE_DUPLICATE", error.Message);
    }

    [Fact]
    public void ApprovalVote_RejectsSecondAssignmentForSameActorAndGroup()
    {
        var provider = NewProvider();
        var profile = SeedProfile(provider);
        var deal = Guid.NewGuid();
        var voter = Guid.NewGuid();
        provider.OrganizationService.Seed(Vote(profile, deal, voter, "approval-1"));
        var duplicate = Vote(profile, deal, voter, "approval-2");

        var error = Assert.Throws<InvalidPluginExecutionException>(() => RunCreate(provider, duplicate));

        Assert.Contains("APPROVAL_ASSIGNMENT_DUPLICATE", error.Message);
    }

    [Fact]
    public void Evaluation_RequiresImmutableHashes()
    {
        var provider = NewProvider();
        var profile = SeedProfile(provider);
        var evaluation = new Entity("cr664_governanceevaluation")
        {
            ["cr664_governanceprofile"] = profile.ToEntityReference(),
            ["cr664_evaluationid"] = "eval-1",
        };

        var error = Assert.Throws<InvalidPluginExecutionException>(() => RunCreate(provider, evaluation));

        Assert.Contains("EVALUATION_HASH_MISSING", error.Message);
    }

    [Fact]
    public void ExceptionDecision_RejectsDuplicateDealCorrelation()
    {
        var provider = NewProvider();
        var existing = ExceptionDecision("deal-1", "correlation-1", Guid.NewGuid());
        provider.OrganizationService.Seed(existing);
        var duplicate = ExceptionDecision("deal-1", "correlation-1");

        var error = Assert.Throws<InvalidPluginExecutionException>(() => RunCreate(provider, duplicate));

        Assert.Contains("GOVERNANCE_DUPLICATE", error.Message);
    }

    [Fact]
    public void RegistrationCoversEveryGovernanceCreateAndUpdatePlusExceptionDecision()
    {
        var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../"));
        var manifestPath = Path.Combine(
            root,
            "dataverse-plugins/CommercialLendingLOS.Plugins/ConfigurableCreditGovernanceRegistration.json");
        using var document = JsonDocument.Parse(File.ReadAllText(manifestPath));
        var guard = document.RootElement.GetProperty("duplicateGuard");
        var boundaries = guard.GetProperty("boundaries").EnumerateArray().ToArray();

        Assert.Equal("CommercialLendingLOS.Plugins.GovernanceNaturalKeyGuardPlugin",
            guard.GetProperty("pluginType").GetString());
        Assert.Equal(21, boundaries.Length);
        Assert.Equal(10, boundaries.Count(item =>
            item.GetProperty("message").GetString() == "Update"));
        Assert.Contains(boundaries, item =>
            item.GetProperty("entity").GetString() == "cr664_conditionverification" &&
            item.GetProperty("message").GetString() == "Create");
    }

    private static FakeServiceProvider NewProvider()
    {
        var provider = new FakeServiceProvider();
        provider.Context.ExecutionMode = 0;
        provider.Context.Stage = 20;
        return provider;
    }

    private static Entity SeedProfile(FakeServiceProvider provider)
    {
        var profile = Profile("OGB", Guid.NewGuid());
        provider.OrganizationService.Seed(profile);
        return profile;
    }

    private static Entity Profile(string bankKey, Guid? id = null)
    {
        return new Entity("cr664_creditgovernanceprofile", id ?? Guid.Empty)
        {
            ["cr664_name"] = "OGB governance",
            ["cr664_bankkey"] = bankKey,
        };
    }

    private static Entity Policy(Entity profile, int version, DateTime effective)
    {
        return new Entity("cr664_creditpolicyversion", Guid.NewGuid())
        {
            ["cr664_name"] = "policy-" + version,
            ["cr664_governanceprofile"] = profile.ToEntityReference(),
            ["cr664_policyid"] = "ogb-policy",
            ["cr664_versionnumber"] = version,
            ["cr664_policystatus"] = "ACTIVE",
            ["cr664_effectivefrom"] = effective,
        };
    }

    private static Entity Grant(Entity profile, Guid officer, string grantId)
    {
        return new Entity("cr664_authoritygrant", Guid.NewGuid())
        {
            ["cr664_name"] = grantId,
            ["cr664_governanceprofile"] = profile.ToEntityReference(),
            ["cr664_officer"] = new EntityReference("systemuser", officer),
            ["cr664_grantid"] = grantId,
            ["cr664_actionsjson"] = "[\"APPROVE\"]",
            ["cr664_productsjson"] = "[\"SECURED_C_AND_I\"]",
            ["cr664_riskratingsjson"] = "[\"PASS\"]",
            ["cr664_exceptiontypesjson"] = "[]",
            ["cr664_insiderpermitted"] = false,
            ["cr664_criticizedclassifiedstatusesjson"] = "[]",
            ["cr664_effectivefrom"] = Effective,
            ["cr664_grantstate"] = "ACTIVE",
        };
    }

    private static Entity Vote(Entity profile, Guid deal, Guid voter, string approvalId)
    {
        return new Entity("cr664_governanceapprovalvote", Guid.NewGuid())
        {
            ["cr664_name"] = approvalId,
            ["cr664_governanceprofile"] = profile.ToEntityReference(),
            ["cr664_loandeal"] = new EntityReference("cr664_loandeal", deal),
            ["cr664_voter"] = new EntityReference("systemuser", voter),
            ["cr664_approvalid"] = approvalId,
            ["cr664_groupid"] = "CREDIT_APPROVAL",
        };
    }

    private static Entity ExceptionDecision(string deal, string correlation, Guid? id = null)
    {
        return new Entity("cr664_conditionverification", id ?? Guid.Empty)
        {
            ["cr664_dealid"] = deal,
            ["cr664_correlationid"] = correlation,
        };
    }

    private static void RunCreate(FakeServiceProvider provider, Entity target)
    {
        provider.Context.MessageName = "Create";
        provider.Context.PrimaryEntityName = target.LogicalName;
        provider.Context.InputParameters = new ParameterCollection { { "Target", target } };
        provider.Context.PreEntityImages = new EntityImageCollection();
        new GovernanceNaturalKeyGuardPlugin().Execute(provider);
    }

    private static void RunUpdate(FakeServiceProvider provider, Entity pre, Entity target)
    {
        provider.Context.MessageName = "Update";
        provider.Context.PrimaryEntityName = target.LogicalName;
        provider.Context.InputParameters = new ParameterCollection { { "Target", target } };
        provider.Context.PreEntityImages = new EntityImageCollection { { "PreImage", pre } };
        new GovernanceNaturalKeyGuardPlugin().Execute(provider);
    }

    private static void TryCreate(
        FakeServiceProvider provider,
        Entity target,
        ConcurrentBag<string> outcomes)
    {
        try
        {
            provider.OrganizationService.Create(target);
            outcomes.Add("created");
        }
        catch (InvalidOperationException error) when (error.Message.Contains("duplicate native GUID"))
        {
            outcomes.Add("duplicate-native-guid");
        }
    }
}
