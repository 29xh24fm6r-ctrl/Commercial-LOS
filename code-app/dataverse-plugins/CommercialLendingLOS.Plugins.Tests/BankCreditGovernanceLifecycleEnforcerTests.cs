using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using CommercialLendingLOS.Plugins;
using Xunit;

namespace CommercialLendingLOS.Plugins.Tests
{
    public sealed class BankCreditGovernanceLifecycleEnforcerTests
    {
        [Fact]
        public void MapsEveryLifecyclePointExactlyOnce()
        {
            var points = Enum.GetValues(typeof(CreditLifecyclePoint)).Cast<CreditLifecyclePoint>().ToList();
            var actions = points.Select(BankCreditGovernanceLifecycleEnforcer.ActionFor).ToList();
            Assert.Equal(13, points.Count);
            Assert.Equal(13, actions.Distinct().Count());
            Assert.Equal(Enum.GetValues(typeof(GovernedCreditAction)).Length, actions.Count);
        }

        [Fact]
        public async Task RequiresPersistedPermit()
        {
            var evaluationRepository = new EvaluationRepository { Kind = "failed" };
            var server = new BankCreditGovernanceServer(
                new PolicyRepository(),
                new EvidenceRepository(),
                evaluationRepository);
            var enforcer = new BankCreditGovernanceLifecycleEnforcer(server);

            var error = await Assert.ThrowsAsync<GovernanceEnforcementException>(() =>
                enforcer.RequirePermit(CreditLifecyclePoint.Approval, Command()));

            Assert.Equal("EVALUATION_PERSISTENCE_FAILED", error.ReasonCode);
        }

        [Fact]
        public async Task ReturnsOnlyAfterServerPermitAndEvidenceAppend()
        {
            var server = new BankCreditGovernanceServer(
                new PolicyRepository(),
                new EvidenceRepository(),
                new EvaluationRepository { Kind = "appended" });
            var response = await new BankCreditGovernanceLifecycleEnforcer(server)
                .RequirePermit(CreditLifecyclePoint.Renewal, Command());

            Assert.True(BankCreditGovernanceServer.PermitsAction(response));
            Assert.Equal(GovernedCreditAction.Renew, response.Result.Action);
            Assert.False(string.IsNullOrWhiteSpace(response.EvaluationRecordId));
        }

        private static ServerGovernanceEvaluationCommand Command() =>
            new ServerGovernanceEvaluationCommand
            {
                ContractVersion = ServerGovernanceEvaluationCommand.SupportedContractVersion,
                EvaluationId = "eval-1",
                BankId = "bank-1",
                CaseId = "deal-1",
                ActorSystemUserId = "user-1",
                RequestedAt = new DateTimeOffset(2026, 7, 30, 12, 0, 0, TimeSpan.Zero),
                OperationCorrelationId = "operation-1",
            };

        private sealed class PolicyRepository : IBankCreditGovernancePolicyRepository
        {
            public Task<ActivePolicyResolution> ResolveActivePolicy(string bankId, DateTimeOffset effectiveAt) =>
                Task.FromResult(new ActivePolicyResolution
                {
                    Kind = "resolved",
                    SnapshotId = "snapshot-1",
                    Policy = new BankCreditGovernancePolicy
                    {
                        PolicyId = "policy-1",
                        Version = 2,
                        Status = "ACTIVE",
                        EffectiveFrom = effectiveAt.AddDays(-1),
                        Rules = new List<CreditGovernanceRule>
                        {
                            new CreditGovernanceRule
                            {
                                RuleId = "all-actions",
                                Description = "Test policy.",
                                Actions = Enum.GetValues(typeof(GovernedCreditAction))
                                    .Cast<GovernedCreditAction>()
                                    .ToList(),
                                Requirements = new RuleRequirements(),
                                NonOverrideable = true,
                            },
                        },
                    },
                });
        }

        private sealed class EvidenceRepository : IBankCreditGovernanceEvidenceRepository
        {
            public Task<GovernanceCaseResolution> ResolveCase(
                string bankId,
                string caseId,
                GovernedCreditAction action,
                string actorSystemUserId,
                DateTimeOffset effectiveAt) =>
                Task.FromResult(new GovernanceCaseResolution
                {
                    Kind = "resolved",
                    Facts = new CreditCaseFacts
                    {
                        Amount = 1m,
                        TotalRelationshipExposure = 1m,
                        Product = "test",
                        RiskRating = "test",
                        Industry = "test",
                        Geography = "test",
                    },
                    Actor = new GovernanceActor
                    {
                        ActorId = actorSystemUserId,
                        Roles = new List<string> { "test" },
                    },
                    SourceVersionTokens = new Dictionary<string, string> { { "deal", "1" } },
                });
        }

        private sealed class EvaluationRepository : IBankCreditGovernanceEvaluationRepository
        {
            public string Kind { get; set; }

            public Task<EvaluationAppendResult> AppendEvaluation(PersistedGovernanceEvaluation evaluation) =>
                Task.FromResult(new EvaluationAppendResult
                {
                    Kind = Kind,
                    EvaluationRecordId = Kind == "appended" ? "evidence-1" : null,
                });
        }
    }
}
