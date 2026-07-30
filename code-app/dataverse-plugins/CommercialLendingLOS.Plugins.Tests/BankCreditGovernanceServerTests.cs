using CommercialLendingLOS.Plugins;

namespace CommercialLendingLOS.Plugins.Tests;

public sealed class BankCreditGovernanceServerTests
{
    private sealed class PolicyRepository : IBankCreditGovernancePolicyRepository
    {
        public ActivePolicyResolution Resolution { get; set; } = new() { Kind = "missing" };
        public Task<ActivePolicyResolution> ResolveActivePolicy(string bankId, DateTimeOffset effectiveAt) =>
            Task.FromResult(Resolution);
    }

    private sealed class EvidenceRepository : IBankCreditGovernanceEvidenceRepository
    {
        public GovernanceCaseResolution Resolution { get; set; } = new() { Kind = "failed" };
        public Task<GovernanceCaseResolution> ResolveCase(
            string bankId,
            string caseId,
            GovernedCreditAction action,
            string actorSystemUserId,
            DateTimeOffset effectiveAt) => Task.FromResult(Resolution);
    }

    private sealed class EvaluationRepository : IBankCreditGovernanceEvaluationRepository
    {
        public EvaluationAppendResult Result { get; set; } = new() { Kind = "failed" };
        public PersistedGovernanceEvaluation? Appended { get; private set; }
        public Task<EvaluationAppendResult> AppendEvaluation(PersistedGovernanceEvaluation evaluation)
        {
            Appended = evaluation;
            return Task.FromResult(Result);
        }
    }

    private static ServerGovernanceEvaluationCommand Command() => new()
    {
        ContractVersion = ServerGovernanceEvaluationCommand.SupportedContractVersion,
        EvaluationId = "evaluation-1",
        BankId = "bank-1",
        CaseId = "deal-1",
        Action = GovernedCreditAction.Approve,
        ActorSystemUserId = "user-1",
        RequestedAt = DateTimeOffset.Parse("2026-07-30T12:00:00Z"),
        OperationCorrelationId = "correlation-1",
    };

    private static BankCreditGovernancePolicy Policy() => new()
    {
        PolicyId = "policy-1",
        Version = 1,
        Status = "ACTIVE",
        EffectiveFrom = DateTimeOffset.Parse("2026-01-01T00:00:00Z"),
        Rules = new[]
        {
            new CreditGovernanceRule
            {
                RuleId = "base",
                Actions = new[] { GovernedCreditAction.Approve },
                Requirements = new RuleRequirements { ActorRoles = new[] { "officer" } },
                NonOverrideable = true,
            },
        },
    };

    private static GovernanceCaseResolution Evidence() => new()
    {
        Kind = "resolved",
        Facts = new CreditCaseFacts
        {
            Amount = 100m,
            TotalRelationshipExposure = 100m,
            Product = "term",
            RiskRating = "pass",
            Industry = "other",
            Geography = "US",
        },
        Actor = new GovernanceActor { ActorId = "user-1", Roles = new[] { "officer" } },
        SourceVersionTokens = new Dictionary<string, string> { ["deal"] = "etag-1" },
    };

    [Fact]
    public async Task UnsupportedContractAndMissingPolicyFailBeforeEvaluation()
    {
        var policies = new PolicyRepository();
        var server = new BankCreditGovernanceServer(policies, new EvidenceRepository(), new EvaluationRepository());
        var unsupported = Command();
        unsupported.ContractVersion = "unknown";

        var contractResult = await server.Evaluate(unsupported);
        var policyResult = await server.Evaluate(Command());

        Assert.Equal("CONTRACT_VERSION_UNSUPPORTED", contractResult.ReasonCode);
        Assert.Equal("ACTIVE_POLICY_UNRESOLVED", policyResult.ReasonCode);
        Assert.False(BankCreditGovernanceServer.PermitsAction(contractResult));
        Assert.False(BankCreditGovernanceServer.PermitsAction(policyResult));
    }

    [Fact]
    public async Task APermitStillFailsClosedWhenEvaluationCannotBePersisted()
    {
        var policies = new PolicyRepository
        {
            Resolution = new ActivePolicyResolution { Kind = "resolved", Policy = Policy(), SnapshotId = "snapshot-1" },
        };
        var evidence = new EvidenceRepository { Resolution = Evidence() };
        var evaluations = new EvaluationRepository();
        var server = new BankCreditGovernanceServer(policies, evidence, evaluations);

        var response = await server.Evaluate(Command());

        Assert.Equal("EVALUATION_PERSISTENCE_FAILED", response.ReasonCode);
        Assert.NotNull(evaluations.Appended);
        Assert.Equal(GovernanceDecision.Permit, evaluations.Appended!.Result.Decision);
        Assert.False(BankCreditGovernanceServer.PermitsAction(response));
    }

    [Fact]
    public async Task OnlyPersistedPermitAllowsTheCallingServerOperation()
    {
        var policies = new PolicyRepository
        {
            Resolution = new ActivePolicyResolution { Kind = "resolved", Policy = Policy(), SnapshotId = "snapshot-1" },
        };
        var evaluations = new EvaluationRepository
        {
            Result = new EvaluationAppendResult { Kind = "appended", EvaluationRecordId = "record-1" },
        };
        var server = new BankCreditGovernanceServer(
            policies,
            new EvidenceRepository { Resolution = Evidence() },
            evaluations);

        var response = await server.Evaluate(Command());

        Assert.Equal("evaluated", response.Kind);
        Assert.Equal("record-1", response.EvaluationRecordId);
        Assert.Equal(GovernanceDecision.Permit, response.Result.Decision);
        Assert.True(BankCreditGovernanceServer.PermitsAction(response));
        Assert.Equal("snapshot-1", evaluations.Appended!.PolicySnapshotId);
        Assert.Equal("etag-1", evaluations.Appended.SourceVersionTokens["deal"]);
        Assert.Equal("correlation-1", evaluations.Appended.OperationCorrelationId);
    }

    [Fact]
    public async Task AStoredBlockNeverPermitsTheCallingServerOperation()
    {
        var policy = Policy();
        policy.Rules[0].Requirements.ActorRoles = new[] { "different-role" };
        var server = new BankCreditGovernanceServer(
            new PolicyRepository
            {
                Resolution = new ActivePolicyResolution { Kind = "resolved", Policy = policy, SnapshotId = "snapshot-1" },
            },
            new EvidenceRepository { Resolution = Evidence() },
            new EvaluationRepository
            {
                Result = new EvaluationAppendResult { Kind = "appended", EvaluationRecordId = "record-1" },
            });

        var response = await server.Evaluate(Command());

        Assert.Equal(GovernanceDecision.Block, response.Result.Decision);
        Assert.False(BankCreditGovernanceServer.PermitsAction(response));
    }

    [Theory]
    [InlineData("stale-policy", "POLICY_VERSION_STALE")]
    [InlineData("concurrent-update", "CONCURRENT_UPDATE_DETECTED")]
    public async Task AtomicPersistenceRejectsStalePolicyAndConcurrentCaseUpdates(
        string appendKind,
        string expectedReason)
    {
        var evaluations = new EvaluationRepository
        {
            Result = new EvaluationAppendResult { Kind = appendKind },
        };
        var server = new BankCreditGovernanceServer(
            new PolicyRepository
            {
                Resolution = new ActivePolicyResolution
                {
                    Kind = "resolved",
                    Policy = Policy(),
                    SnapshotId = "snapshot-1",
                },
            },
            new EvidenceRepository { Resolution = Evidence() },
            evaluations);

        var response = await server.Evaluate(Command());

        Assert.Equal(expectedReason, response.ReasonCode);
        Assert.False(BankCreditGovernanceServer.PermitsAction(response));
        Assert.NotNull(evaluations.Appended);
        Assert.Equal("snapshot-1", evaluations.Appended!.PolicySnapshotId);
        Assert.Equal("etag-1", evaluations.Appended.SourceVersionTokens["deal"]);
    }

    [Fact]
    public async Task EvaluationPersistenceCarriesAuditCorrelationPolicyAndSourceVersions()
    {
        var evaluations = new EvaluationRepository
        {
            Result = new EvaluationAppendResult { Kind = "appended", EvaluationRecordId = "evaluation-record-1" },
        };
        var server = new BankCreditGovernanceServer(
            new PolicyRepository
            {
                Resolution = new ActivePolicyResolution
                {
                    Kind = "resolved",
                    Policy = Policy(),
                    SnapshotId = "snapshot-1",
                },
            },
            new EvidenceRepository { Resolution = Evidence() },
            evaluations);

        var response = await server.Evaluate(Command());

        Assert.True(BankCreditGovernanceServer.PermitsAction(response));
        Assert.Equal("evaluation-1", evaluations.Appended!.Request.EvaluationId);
        Assert.Equal("correlation-1", evaluations.Appended.OperationCorrelationId);
        Assert.Equal("snapshot-1", evaluations.Appended.PolicySnapshotId);
        Assert.Equal("etag-1", evaluations.Appended.SourceVersionTokens["deal"]);
        Assert.Equal(evaluations.Appended.Request.EvaluationId, evaluations.Appended.Result.EvaluationId);
    }
}
