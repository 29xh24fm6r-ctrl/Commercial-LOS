using CommercialLendingLOS.Plugins;

namespace CommercialLendingLOS.Plugins.Tests;

public sealed class BankCreditGovernanceEngineTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-07-30T12:00:00Z");

    private static CreditCaseFacts Facts() => new()
    {
        Amount = 500_000m,
        TotalRelationshipExposure = 750_000m,
        UnsecuredExposure = 0m,
        Product = "CRE",
        Collateral = new[] { "real estate" },
        RiskRating = "5",
        Industry = "manufacturing",
        Geography = "Georgia",
    };

    private static GovernanceActor Actor(string actorId = "officer-1") => new()
    {
        ActorId = actorId,
        Roles = new[] { "authorized-officer", "lender", "underwriter" },
        AuthorityGrants = new[]
        {
            new DelegatedAuthorityGrant
            {
                GrantId = "grant-1",
                Actions = Enum.GetValues<GovernedCreditAction>(),
                MaximumAmount = 1_000_000m,
                MaximumRelationshipExposure = 2_000_000m,
                EffectiveFrom = DateTimeOffset.Parse("2026-01-01T00:00:00Z"),
            },
        },
    };

    private static BankCreditGovernancePolicy Policy(params CreditGovernanceRule[] rules) => new()
    {
        PolicyId = "policy-1",
        Version = 7,
        Status = "ACTIVE",
        EffectiveFrom = DateTimeOffset.Parse("2026-01-01T00:00:00Z"),
        Rules = rules,
    };

    private static CreditGovernanceRule BaseRule() => new()
    {
        RuleId = "base",
        Actions = new[] { GovernedCreditAction.Approve },
        Requirements = new RuleRequirements
        {
            ActorRoles = new[] { "authorized-officer" },
            DelegatedAuthorityRequired = true,
        },
        NonOverrideable = true,
    };

    private static GovernanceEvaluationRequest Request(
        BankCreditGovernancePolicy? policy = null,
        GovernanceActor? actor = null) => new()
    {
        EvaluationId = "evaluation-1",
        EvaluatedAt = Now,
        Action = GovernedCreditAction.Approve,
        Policy = policy ?? Policy(BaseRule()),
        Facts = Facts(),
        Actor = actor ?? Actor(),
    };

    [Fact]
    public void SingleOfficerIsPermittedWhenPolicyAllowsCombination()
    {
        var request = Request();
        request.ActionHistory = new[]
        {
            new GovernedActionEvidence { Action = GovernedCreditAction.Originate, ActorId = "officer-1", EvidenceId = "a1" },
            new GovernedActionEvidence { Action = GovernedCreditAction.Underwrite, ActorId = "officer-1", EvidenceId = "a2" },
        };

        var result = BankCreditGovernanceEngine.Evaluate(request);

        Assert.Equal(GovernanceDecision.Permit, result.Decision);
        Assert.Equal(new[] { "base" }, result.MatchedRuleIds);
        Assert.Empty(result.Findings);
    }

    [Fact]
    public void IndependentApprovalBlocksTheOriginatingUnderwriter()
    {
        var rule = BaseRule();
        rule.Requirements.IndependentFrom = new[]
        {
            GovernedCreditAction.Originate,
            GovernedCreditAction.Underwrite,
        };
        var request = Request(Policy(rule), Actor("combined-lender-underwriter"));
        request.ActionHistory = new[]
        {
            new GovernedActionEvidence
            {
                Action = GovernedCreditAction.Originate,
                ActorId = "combined-lender-underwriter",
                EvidenceId = "origin",
            },
            new GovernedActionEvidence
            {
                Action = GovernedCreditAction.Underwrite,
                ActorId = "combined-lender-underwriter",
                EvidenceId = "underwrite",
            },
        };

        var result = BankCreditGovernanceEngine.Evaluate(request);

        Assert.Equal(GovernanceDecision.Block, result.Decision);
        Assert.Equal(2, result.Findings.Count(item => item.Code == "INDEPENDENCE_REQUIRED"));
        Assert.All(result.Findings, item => Assert.True(item.NonOverrideable));
    }

    [Fact]
    public void MatchingRulesComposeRestrictively()
    {
        var insider = new CreditGovernanceRule
        {
            RuleId = "insider",
            Actions = new[] { GovernedCreditAction.Approve },
            When = new PolicyCondition { InsiderStatus = true },
            Requirements = new RuleRequirements
            {
                ApprovalGroups = new[]
                {
                    new ApprovalGroupRequirement
                    {
                        GroupId = "board",
                        CommitteeId = "board-credit",
                        ApprovalsRequired = 2,
                        DistinctActors = true,
                    },
                },
            },
            NonOverrideable = true,
        };
        var request = Request(Policy(BaseRule(), insider));
        request.Facts.InsiderStatus = true;

        var result = BankCreditGovernanceEngine.Evaluate(request);

        Assert.Equal(GovernanceDecision.Block, result.Decision);
        Assert.Equal(new[] { "base", "insider" }, result.MatchedRuleIds);
        Assert.Contains(result.Findings, item => item.Code == "COMMITTEE_ACTION_REQUIRED");
    }

    [Fact]
    public void DuplicateVotesNeverSatisfyDistinctPersonCount()
    {
        var rule = new CreditGovernanceRule
        {
            RuleId = "committee",
            Actions = new[] { GovernedCreditAction.Approve },
            Requirements = new RuleRequirements
            {
                ApprovalGroups = new[]
                {
                    new ApprovalGroupRequirement
                    {
                        GroupId = "credit",
                        ApprovalsRequired = 2,
                        DistinctActors = true,
                    },
                },
            },
            NonOverrideable = true,
        };
        var request = Request(Policy(rule));
        request.Approvals = new[]
        {
            new ApprovalEvidence { ApprovalId = "v1", GroupId = "credit", ActorId = "same", Decision = "APPROVE" },
            new ApprovalEvidence { ApprovalId = "v2", GroupId = "credit", ActorId = "same", Decision = "APPROVE" },
        };

        Assert.Equal(GovernanceDecision.Block, BankCreditGovernanceEngine.Evaluate(request).Decision);
    }

    [Fact]
    public void AllPolicyDimensionsMatchCaseInsensitively()
    {
        var facts = Facts();
        facts.HasPolicyException = true;
        facts.InsiderStatus = true;
        facts.Concentration = new[] { "Hospitality" };
        facts.GovernmentGuaranteedProgram = "SBA 7(a)";
        facts.CriticizedClassifiedStatus = "criticized";
        var condition = new PolicyCondition
        {
            MinimumAmount = 1m,
            MaximumAmount = 500_000m,
            MinimumRelationshipExposure = 1m,
            MaximumRelationshipExposure = 750_000m,
            Products = new[] { "cre" },
            AnyCollateral = new[] { "REAL ESTATE" },
            RiskRatings = new[] { "5" },
            HasPolicyException = true,
            InsiderStatus = true,
            AnyConcentration = new[] { "hospitality" },
            Industries = new[] { "MANUFACTURING" },
            Geographies = new[] { "georgia" },
            GovernmentGuaranteedPrograms = new[] { "sba 7(A)" },
            CriticizedClassifiedStatuses = new[] { "CRITICIZED" },
        };

        Assert.True(BankCreditGovernanceEngine.ConditionMatches(condition, facts));
        facts.Geography = "Florida";
        Assert.False(BankCreditGovernanceEngine.ConditionMatches(condition, facts));
    }

    [Theory]
    [InlineData(null, "POLICY_MISSING")]
    [InlineData("DRAFT", "POLICY_NOT_ACTIVE")]
    public void MissingOrInactivePolicyFailsClosed(string? status, string reason)
    {
        var request = Request();
        if (status == null) request.Policy = null;
        else request.Policy.Status = status;

        var result = BankCreditGovernanceEngine.Evaluate(request);

        Assert.Equal(GovernanceDecision.Block, result.Decision);
        Assert.Contains(result.Findings, item => item.Code == reason);
    }

    [Fact]
    public void DelegatedAuthorityEnforcesRiskGeographyIndustryAndExceptionScope()
    {
        var actor = Actor();
        var grant = actor.AuthorityGrants.Single();
        grant.RiskRatings = new[] { "5" };
        grant.Geographies = new[] { "Georgia" };
        grant.Industries = new[] { "Manufacturing" };
        grant.ExceptionTypes = new[] { "Covenant" };
        var request = Request(actor: actor);
        request.Facts.HasPolicyException = true;
        request.Facts.PolicyExceptionTypes = new[] { "Documentation" };

        var denied = BankCreditGovernanceEngine.Evaluate(request);
        request.Facts.PolicyExceptionTypes = new[] { "covenant" };
        var permitted = BankCreditGovernanceEngine.Evaluate(request);

        Assert.Contains(denied.Findings, item => item.Code == "DELEGATED_AUTHORITY_MISSING");
        Assert.Equal(GovernanceDecision.Permit, permitted.Decision);
    }

    [Fact]
    public void ZeroUnsecuredAuthorityBlocksUnsecuredExposure()
    {
        var actor = Actor();
        actor.AuthorityGrants.Single().MaximumUnsecuredAmount = 0m;
        var request = Request(actor: actor);
        request.Facts.UnsecuredExposure = 1m;

        var result = BankCreditGovernanceEngine.Evaluate(request);

        Assert.Equal(GovernanceDecision.Block, result.Decision);
        Assert.Contains(result.Findings, item => item.Code == "DELEGATED_AUTHORITY_EXCEEDED");
    }

    [Fact]
    public void EmptyExceptionAuthorityAllowsOrdinaryCreditButBlocksExceptions()
    {
        var actor = Actor();
        actor.AuthorityGrants.Single().ExceptionTypes = Array.Empty<string>();
        var ordinary = Request(actor: actor);
        var exception = Request(actor: actor);
        exception.Facts.HasPolicyException = true;
        exception.Facts.PolicyExceptionTypes = new[] { "COLLATERAL" };

        Assert.Equal(GovernanceDecision.Permit, BankCreditGovernanceEngine.Evaluate(ordinary).Decision);
        Assert.Equal(GovernanceDecision.Block, BankCreditGovernanceEngine.Evaluate(exception).Decision);
    }

    [Fact]
    public void AuthorityWithoutInsiderOrClassifiedScopeBlocksBoth()
    {
        var actor = Actor();
        actor.AuthorityGrants.Single().InsiderPermitted = false;
        actor.AuthorityGrants.Single().CriticizedClassifiedStatuses = Array.Empty<string>();
        var insider = Request(actor: actor);
        insider.Facts.InsiderStatus = true;
        var classified = Request(actor: actor);
        classified.Facts.CriticizedClassifiedStatus = "SUBSTANDARD";

        Assert.Equal(GovernanceDecision.Block, BankCreditGovernanceEngine.Evaluate(insider).Decision);
        Assert.Equal(GovernanceDecision.Block, BankCreditGovernanceEngine.Evaluate(classified).Decision);
    }

    [Fact]
    public void CommitteeHonorsQuorumAbstentionRecusalAndAuthorityLimit()
    {
        var group = new ApprovalGroupRequirement
        {
            GroupId = "credit",
            CommitteeId = "credit",
            ApprovalsRequired = 2,
            QuorumRequired = 3,
            AbstentionsCountTowardQuorum = true,
            DistinctActors = true,
            RecusedActorIds = new[] { "recused" },
            MaximumAmount = 1_000_000m,
        };
        var rule = BaseRule();
        rule.Requirements.ApprovalGroups = new[] { group };
        var request = Request(Policy(rule));
        request.Approvals = new[]
        {
            new ApprovalEvidence { ApprovalId = "v1", GroupId = "credit", CommitteeId = "credit", ActorId = "one", Decision = "APPROVE" },
            new ApprovalEvidence { ApprovalId = "v2", GroupId = "credit", CommitteeId = "credit", ActorId = "two", Decision = "APPROVE" },
            new ApprovalEvidence { ApprovalId = "v3", GroupId = "credit", CommitteeId = "credit", ActorId = "three", Decision = "ABSTAIN" },
        };

        Assert.Equal(GovernanceDecision.Permit, BankCreditGovernanceEngine.Evaluate(request).Decision);

        request.Approvals[1].ActorId = "recused";
        var recused = BankCreditGovernanceEngine.Evaluate(request);
        Assert.Contains(recused.Findings, item => item.Code == "COMMITTEE_QUORUM_UNSATISFIED");

        request.Approvals[1].ActorId = "two";
        request.Facts.Amount = 1_000_001m;
        var exceeded = BankCreditGovernanceEngine.Evaluate(request);
        Assert.Contains(exceeded.Findings, item => item.Code == "COMMITTEE_AUTHORITY_EXCEEDED");
    }
}
