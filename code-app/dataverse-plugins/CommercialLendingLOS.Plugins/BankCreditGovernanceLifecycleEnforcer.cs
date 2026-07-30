using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace CommercialLendingLOS.Plugins
{
    public enum CreditLifecyclePoint
    {
        Origination,
        Underwriting,
        Recommendation,
        Approval,
        ExceptionApproval,
        Commitment,
        Closing,
        FundingAuthorization,
        DisbursementConfirmation,
        Boarding,
        Servicing,
        Modification,
        Renewal,
    }

    /// <summary>
    /// Server-side mutation gate shared by lifecycle plug-ins. It never derives
    /// authority from title, team, or application access. A write may proceed
    /// only after the v2 server returns PERMIT and an append-only evaluation ID.
    ///
    /// This class is not registered by this PR. Production registration and
    /// activation remain separate operator actions.
    /// </summary>
    public sealed class BankCreditGovernanceLifecycleEnforcer
    {
        private readonly BankCreditGovernanceServer server;

        public BankCreditGovernanceLifecycleEnforcer(BankCreditGovernanceServer server)
        {
            this.server = server ?? throw new ArgumentNullException(nameof(server));
        }

        public static GovernedCreditAction ActionFor(CreditLifecyclePoint point)
        {
            switch (point)
            {
                case CreditLifecyclePoint.Origination: return GovernedCreditAction.Originate;
                case CreditLifecyclePoint.Underwriting: return GovernedCreditAction.Underwrite;
                case CreditLifecyclePoint.Recommendation: return GovernedCreditAction.Recommend;
                case CreditLifecyclePoint.Approval: return GovernedCreditAction.Approve;
                case CreditLifecyclePoint.ExceptionApproval: return GovernedCreditAction.ApproveException;
                case CreditLifecyclePoint.Commitment: return GovernedCreditAction.Commit;
                case CreditLifecyclePoint.Closing: return GovernedCreditAction.Close;
                case CreditLifecyclePoint.FundingAuthorization: return GovernedCreditAction.AuthorizeFunding;
                case CreditLifecyclePoint.DisbursementConfirmation: return GovernedCreditAction.ConfirmDisbursement;
                case CreditLifecyclePoint.Boarding: return GovernedCreditAction.Board;
                case CreditLifecyclePoint.Servicing: return GovernedCreditAction.Service;
                case CreditLifecyclePoint.Modification: return GovernedCreditAction.Modify;
                case CreditLifecyclePoint.Renewal: return GovernedCreditAction.Renew;
                default: throw new ArgumentOutOfRangeException(nameof(point));
            }
        }

        public async Task<ServerGovernanceEvaluationResponse> RequirePermit(
            CreditLifecyclePoint point,
            ServerGovernanceEvaluationCommand command)
        {
            if (command == null) throw new ArgumentNullException(nameof(command));
            command.Action = ActionFor(point);
            command.ContractVersion = ServerGovernanceEvaluationCommand.SupportedContractVersion;
            var response = await server.Evaluate(command);
            if (!BankCreditGovernanceServer.PermitsAction(response))
            {
                var code = response?.Kind == "denied-before-evaluation"
                    ? response.ReasonCode
                    : response?.Result?.Findings?[0]?.Code ?? "CONFIGURABLE_POLICY_BLOCKED";
                var message = response?.Kind == "denied-before-evaluation"
                    ? response.SafeMessage
                    : response?.Result?.Findings?[0]?.Message ?? "The configured bank policy blocked this action.";
                throw new GovernanceEnforcementException(code, message);
            }
            return response;
        }
    }

    public sealed class GovernanceEnforcementException : Exception
    {
        public string ReasonCode { get; }

        public GovernanceEnforcementException(string reasonCode, string message)
            : base(message)
        {
            ReasonCode = string.IsNullOrWhiteSpace(reasonCode)
                ? "CONFIGURABLE_POLICY_BLOCKED"
                : reasonCode;
        }
    }
}
