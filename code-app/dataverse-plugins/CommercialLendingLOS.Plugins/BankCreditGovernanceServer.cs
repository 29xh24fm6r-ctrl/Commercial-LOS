using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace CommercialLendingLOS.Plugins
{
    public sealed class ServerGovernanceEvaluationCommand
    {
        public const string SupportedContractVersion = "bank-credit-governance/v1";
        public string ContractVersion { get; set; }
        public string EvaluationId { get; set; }
        public string BankId { get; set; }
        public string CaseId { get; set; }
        public GovernedCreditAction Action { get; set; }
        public string ActorSystemUserId { get; set; }
        public DateTimeOffset RequestedAt { get; set; }
        public string OperationCorrelationId { get; set; }
    }

    public sealed class ActivePolicyResolution
    {
        public string Kind { get; set; }
        public BankCreditGovernancePolicy Policy { get; set; }
        public string SnapshotId { get; set; }
    }

    public sealed class GovernanceCaseResolution
    {
        public string Kind { get; set; }
        public CreditCaseFacts Facts { get; set; }
        public GovernanceActor Actor { get; set; }
        public IList<GovernedActionEvidence> ActionHistory { get; set; } = new List<GovernedActionEvidence>();
        public IList<ApprovalEvidence> Approvals { get; set; } = new List<ApprovalEvidence>();
        public IDictionary<string, string> SourceVersionTokens { get; set; } = new Dictionary<string, string>();
    }

    public sealed class PersistedGovernanceEvaluation
    {
        public string ContractVersion { get; set; }
        public string BankId { get; set; }
        public string CaseId { get; set; }
        public string PolicySnapshotId { get; set; }
        public IDictionary<string, string> SourceVersionTokens { get; set; }
        public GovernanceEvaluationRequest Request { get; set; }
        public GovernanceEvaluation Result { get; set; }
    }

    public sealed class EvaluationAppendResult
    {
        public string Kind { get; set; }
        public string EvaluationRecordId { get; set; }
    }

    public interface IBankCreditGovernancePolicyRepository
    {
        Task<ActivePolicyResolution> ResolveActivePolicy(string bankId, DateTimeOffset effectiveAt);
    }

    public interface IBankCreditGovernanceEvidenceRepository
    {
        Task<GovernanceCaseResolution> ResolveCase(
            string bankId,
            string caseId,
            GovernedCreditAction action,
            string actorSystemUserId,
            DateTimeOffset effectiveAt);
    }

    public interface IBankCreditGovernanceEvaluationRepository
    {
        Task<EvaluationAppendResult> AppendEvaluation(PersistedGovernanceEvaluation evaluation);
    }

    public sealed class ServerGovernanceEvaluationResponse
    {
        public string ContractVersion { get; set; } = ServerGovernanceEvaluationCommand.SupportedContractVersion;
        public string Kind { get; set; }
        public string ReasonCode { get; set; }
        public string SafeMessage { get; set; }
        public string EvaluationRecordId { get; set; }
        public GovernanceEvaluation Result { get; set; }
    }

    public sealed class BankCreditGovernanceServer
    {
        private readonly IBankCreditGovernancePolicyRepository policyRepository;
        private readonly IBankCreditGovernanceEvidenceRepository evidenceRepository;
        private readonly IBankCreditGovernanceEvaluationRepository evaluationRepository;

        public BankCreditGovernanceServer(
            IBankCreditGovernancePolicyRepository policyRepository,
            IBankCreditGovernanceEvidenceRepository evidenceRepository,
            IBankCreditGovernanceEvaluationRepository evaluationRepository)
        {
            this.policyRepository = policyRepository ?? throw new ArgumentNullException(nameof(policyRepository));
            this.evidenceRepository = evidenceRepository ?? throw new ArgumentNullException(nameof(evidenceRepository));
            this.evaluationRepository = evaluationRepository ?? throw new ArgumentNullException(nameof(evaluationRepository));
        }

        public async Task<ServerGovernanceEvaluationResponse> Evaluate(ServerGovernanceEvaluationCommand command)
        {
            if (command == null || command.ContractVersion != ServerGovernanceEvaluationCommand.SupportedContractVersion)
                return Denied("CONTRACT_VERSION_UNSUPPORTED", "The governance contract version is unsupported.");
            var policy = await policyRepository.ResolveActivePolicy(command.BankId, command.RequestedAt);
            if (policy == null || policy.Kind != "resolved" || policy.Policy == null || string.IsNullOrWhiteSpace(policy.SnapshotId))
                return Denied("ACTIVE_POLICY_UNRESOLVED", "An active governance policy could not be resolved.");
            var evidence = await evidenceRepository.ResolveCase(
                command.BankId,
                command.CaseId,
                command.Action,
                command.ActorSystemUserId,
                command.RequestedAt);
            if (evidence == null || evidence.Kind != "resolved" || evidence.Facts == null)
                return Denied(
                    evidence != null && evidence.Kind == "actor-unresolved" ? "ACTOR_UNRESOLVED" : "CASE_FACTS_UNRESOLVED",
                    "The governed case snapshot could not be resolved.");
            if (evidence.Actor == null)
                return Denied("ACTOR_UNRESOLVED", "The acting officer could not be resolved.");

            var request = new GovernanceEvaluationRequest
            {
                EvaluationId = command.EvaluationId,
                EvaluatedAt = command.RequestedAt,
                Action = command.Action,
                Policy = policy.Policy,
                Facts = evidence.Facts,
                Actor = evidence.Actor,
                ActionHistory = evidence.ActionHistory,
                Approvals = evidence.Approvals,
            };
            var result = BankCreditGovernanceEngine.Evaluate(request);
            var appended = await evaluationRepository.AppendEvaluation(new PersistedGovernanceEvaluation
            {
                ContractVersion = command.ContractVersion,
                BankId = command.BankId,
                CaseId = command.CaseId,
                PolicySnapshotId = policy.SnapshotId,
                SourceVersionTokens = evidence.SourceVersionTokens,
                Request = request,
                Result = result,
            });
            if (appended == null ||
                (appended.Kind != "appended" && appended.Kind != "duplicate") ||
                string.IsNullOrWhiteSpace(appended.EvaluationRecordId))
                return Denied("EVALUATION_PERSISTENCE_FAILED", "Governance evaluation evidence could not be recorded.");
            return new ServerGovernanceEvaluationResponse
            {
                Kind = "evaluated",
                EvaluationRecordId = appended.EvaluationRecordId,
                Result = result,
            };
        }

        public static bool PermitsAction(ServerGovernanceEvaluationResponse response) =>
            response != null &&
            response.Kind == "evaluated" &&
            !string.IsNullOrWhiteSpace(response.EvaluationRecordId) &&
            response.Result?.Decision == GovernanceDecision.Permit;

        private static ServerGovernanceEvaluationResponse Denied(string reasonCode, string message) =>
            new ServerGovernanceEvaluationResponse
            {
                Kind = "denied-before-evaluation",
                ReasonCode = reasonCode,
                SafeMessage = message,
            };
    }
}
