using System;
using System.Collections.Generic;
using System.Linq;

namespace CommercialLendingLOS.Plugins
{
    public enum GovernedCreditAction
    {
        Originate,
        Underwrite,
        Recommend,
        Approve,
        ApproveException,
        Commit,
        Close,
        AuthorizeFunding,
        ConfirmDisbursement,
        Board,
        Service,
        Modify,
        Renew,
    }
    public enum GovernanceDecision { Permit, Block, Escalate }

    public sealed class CreditCaseFacts
    {
        public decimal Amount { get; set; }
        public decimal TotalRelationshipExposure { get; set; }
        public decimal UnsecuredExposure { get; set; }
        public string Product { get; set; }
        public IList<string> Collateral { get; set; } = new List<string>();
        public string RiskRating { get; set; }
        public bool HasPolicyException { get; set; }
        public IList<string> PolicyExceptionTypes { get; set; } = new List<string>();
        public bool InsiderStatus { get; set; }
        public IList<string> Concentration { get; set; } = new List<string>();
        public string Industry { get; set; }
        public string Geography { get; set; }
        public string GovernmentGuaranteedProgram { get; set; }
        public string CriticizedClassifiedStatus { get; set; }
    }

    public sealed class PolicyCondition
    {
        public decimal? MinimumAmount { get; set; }
        public decimal? MaximumAmount { get; set; }
        public decimal? MinimumRelationshipExposure { get; set; }
        public decimal? MaximumRelationshipExposure { get; set; }
        public IList<string> Products { get; set; }
        public IList<string> AnyCollateral { get; set; }
        public IList<string> RiskRatings { get; set; }
        public bool? HasPolicyException { get; set; }
        public bool? InsiderStatus { get; set; }
        public IList<string> AnyConcentration { get; set; }
        public IList<string> Industries { get; set; }
        public IList<string> Geographies { get; set; }
        public IList<string> GovernmentGuaranteedPrograms { get; set; }
        public bool GovernmentGuaranteedProgramsIncludesNone { get; set; }
        public IList<string> CriticizedClassifiedStatuses { get; set; }
        public bool CriticizedClassifiedStatusesIncludesNone { get; set; }
    }

    public sealed class DelegatedAuthorityGrant
    {
        public string GrantId { get; set; }
        public IList<GovernedCreditAction> Actions { get; set; } = new List<GovernedCreditAction>();
        public decimal? MaximumAmount { get; set; }
        public decimal? MaximumRelationshipExposure { get; set; }
        public decimal? MaximumUnsecuredAmount { get; set; }
        public IList<string> Products { get; set; }
        public IList<string> RiskRatings { get; set; }
        public IList<string> Geographies { get; set; }
        public IList<string> Industries { get; set; }
        public IList<string> ExceptionTypes { get; set; }
        public bool InsiderPermitted { get; set; }
        public IList<string> CriticizedClassifiedStatuses { get; set; }
        public DateTimeOffset EffectiveFrom { get; set; }
        public DateTimeOffset? EffectiveThrough { get; set; }
    }

    public sealed class GovernanceActor
    {
        public string ActorId { get; set; }
        public IList<string> Roles { get; set; } = new List<string>();
        public IList<string> CommitteeMemberships { get; set; } = new List<string>();
        public IList<DelegatedAuthorityGrant> AuthorityGrants { get; set; } = new List<DelegatedAuthorityGrant>();
    }

    public sealed class GovernedActionEvidence
    {
        public GovernedCreditAction Action { get; set; }
        public string ActorId { get; set; }
        public DateTimeOffset OccurredAt { get; set; }
        public string EvidenceId { get; set; }
    }

    public sealed class ApprovalEvidence
    {
        public string ApprovalId { get; set; }
        public string GroupId { get; set; }
        public string ActorId { get; set; }
        public IList<string> ActorRoles { get; set; } = new List<string>();
        public string CommitteeId { get; set; }
        public string Decision { get; set; }
        public DateTimeOffset OccurredAt { get; set; }
    }

    public sealed class ApprovalGroupRequirement
    {
        public string GroupId { get; set; }
        public int ApprovalsRequired { get; set; }
        public IList<string> EligibleRoles { get; set; }
        public string CommitteeId { get; set; }
        public bool DistinctActors { get; set; }
        public bool Unanimous { get; set; }
        public int? QuorumRequired { get; set; }
        public bool AbstentionsCountTowardQuorum { get; set; }
        public IList<string> RecusedActorIds { get; set; }
        public decimal? MaximumAmount { get; set; }
        public decimal? MaximumRelationshipExposure { get; set; }
    }

    public sealed class RuleRequirements
    {
        public IList<string> ActorRoles { get; set; }
        public bool DelegatedAuthorityRequired { get; set; }
        public IList<GovernedCreditAction> IndependentFrom { get; set; }
        public IList<ApprovalGroupRequirement> ApprovalGroups { get; set; }
        public string MandatoryEscalation { get; set; }
        public string Prohibited { get; set; }
    }

    public sealed class CreditGovernanceRule
    {
        public string RuleId { get; set; }
        public string Description { get; set; }
        public IList<GovernedCreditAction> Actions { get; set; } = new List<GovernedCreditAction>();
        public PolicyCondition When { get; set; }
        public RuleRequirements Requirements { get; set; } = new RuleRequirements();
        public bool NonOverrideable { get; set; }
    }

    public sealed class BankCreditGovernancePolicy
    {
        public string PolicyId { get; set; }
        public int Version { get; set; }
        public string Status { get; set; }
        public DateTimeOffset EffectiveFrom { get; set; }
        public DateTimeOffset? EffectiveThrough { get; set; }
        public IList<CreditGovernanceRule> Rules { get; set; } = new List<CreditGovernanceRule>();
    }

    public sealed class GovernanceEvaluationRequest
    {
        public string EvaluationId { get; set; }
        public DateTimeOffset EvaluatedAt { get; set; }
        public GovernedCreditAction Action { get; set; }
        public BankCreditGovernancePolicy Policy { get; set; }
        public CreditCaseFacts Facts { get; set; }
        public GovernanceActor Actor { get; set; }
        public IList<GovernedActionEvidence> ActionHistory { get; set; } = new List<GovernedActionEvidence>();
        public IList<ApprovalEvidence> Approvals { get; set; } = new List<ApprovalEvidence>();
    }

    public sealed class GovernanceFinding
    {
        public string Code { get; set; }
        public string RuleId { get; set; }
        public string Message { get; set; }
        public bool NonOverrideable { get; set; }
        public IList<string> EvidenceIds { get; set; } = new List<string>();
    }

    public sealed class GovernanceEvaluation
    {
        public string EvaluationId { get; set; }
        public GovernanceDecision Decision { get; set; }
        public string PolicyId { get; set; }
        public int? PolicyVersion { get; set; }
        public DateTimeOffset EvaluatedAt { get; set; }
        public GovernedCreditAction Action { get; set; }
        public IList<string> MatchedRuleIds { get; set; } = new List<string>();
        public IList<GovernanceFinding> Findings { get; set; } = new List<GovernanceFinding>();
        public CreditCaseFacts FactSnapshot { get; set; }
    }

    public static class BankCreditGovernanceEngine
    {
        private static bool Equal(string left, string right) =>
            string.Equals(left?.Trim(), right?.Trim(), StringComparison.OrdinalIgnoreCase);

        private static bool Contains(IEnumerable<string> values, string candidate) =>
            values != null && values.Any(value => Equal(value, candidate));

        public static bool ConditionMatches(PolicyCondition condition, CreditCaseFacts facts)
        {
            if (condition == null) return true;
            if (condition.MinimumAmount.HasValue && facts.Amount < condition.MinimumAmount.Value) return false;
            if (condition.MaximumAmount.HasValue && facts.Amount > condition.MaximumAmount.Value) return false;
            if (condition.MinimumRelationshipExposure.HasValue &&
                facts.TotalRelationshipExposure < condition.MinimumRelationshipExposure.Value) return false;
            if (condition.MaximumRelationshipExposure.HasValue &&
                facts.TotalRelationshipExposure > condition.MaximumRelationshipExposure.Value) return false;
            if (condition.Products != null && !Contains(condition.Products, facts.Product)) return false;
            if (condition.AnyCollateral != null &&
                !(facts.Collateral ?? new List<string>()).Any(value => Contains(condition.AnyCollateral, value))) return false;
            if (condition.RiskRatings != null && !Contains(condition.RiskRatings, facts.RiskRating)) return false;
            if (condition.HasPolicyException.HasValue &&
                condition.HasPolicyException.Value != facts.HasPolicyException) return false;
            if (condition.InsiderStatus.HasValue && condition.InsiderStatus.Value != facts.InsiderStatus) return false;
            if (condition.AnyConcentration != null &&
                !(facts.Concentration ?? new List<string>()).Any(value => Contains(condition.AnyConcentration, value))) return false;
            if (condition.Industries != null && !Contains(condition.Industries, facts.Industry)) return false;
            if (condition.Geographies != null && !Contains(condition.Geographies, facts.Geography)) return false;
            if (condition.GovernmentGuaranteedPrograms != null &&
                !(Contains(condition.GovernmentGuaranteedPrograms, facts.GovernmentGuaranteedProgram) ||
                  (condition.GovernmentGuaranteedProgramsIncludesNone && facts.GovernmentGuaranteedProgram == null))) return false;
            if (condition.CriticizedClassifiedStatuses != null &&
                !(Contains(condition.CriticizedClassifiedStatuses, facts.CriticizedClassifiedStatus) ||
                  (condition.CriticizedClassifiedStatusesIncludesNone && facts.CriticizedClassifiedStatus == null))) return false;
            return true;
        }

        public static GovernanceEvaluation Evaluate(GovernanceEvaluationRequest request)
        {
            var result = new GovernanceEvaluation
            {
                EvaluationId = request?.EvaluationId,
                EvaluatedAt = request?.EvaluatedAt ?? DateTimeOffset.MinValue,
                Action = request?.Action ?? GovernedCreditAction.Approve,
                FactSnapshot = request?.Facts,
            };
            if (request?.Policy == null)
                return Block(result, "POLICY_MISSING", "No bank credit governance policy snapshot was supplied.");
            result.PolicyId = request.Policy.PolicyId;
            result.PolicyVersion = request.Policy.Version;
            var invalid = ValidatePolicy(request.Policy);
            if (invalid != null) return Block(result, "POLICY_INVALID", invalid);
            if (!Equal(request.Policy.Status, "ACTIVE"))
                return Block(result, "POLICY_NOT_ACTIVE", "The supplied policy version is not active.");
            if (request.EvaluatedAt < request.Policy.EffectiveFrom ||
                (request.Policy.EffectiveThrough.HasValue && request.EvaluatedAt > request.Policy.EffectiveThrough.Value))
                return Block(result, "POLICY_NOT_EFFECTIVE", "The supplied policy is not effective at the evaluation time.");
            if (request.Facts == null) return Block(result, "FACTS_MISSING", "The case facts are unavailable.");

            var rules = request.Policy.Rules
                .Where(rule => rule.Actions.Contains(request.Action) && ConditionMatches(rule.When, request.Facts))
                .ToList();
            result.MatchedRuleIds = rules.Select(rule => rule.RuleId).ToList();
            if (rules.Count == 0) return Block(result, "NO_MATCHING_RULE", "No active policy rule governs this action.");

            foreach (var rule in rules) EvaluateRule(request, rule, result.Findings);
            result.Decision = result.Findings.Any(item => item.Code != "MANDATORY_ESCALATION")
                ? GovernanceDecision.Block
                : result.Findings.Any()
                    ? GovernanceDecision.Escalate
                    : GovernanceDecision.Permit;
            return result;
        }

        private static string ValidatePolicy(BankCreditGovernancePolicy policy)
        {
            if (string.IsNullOrWhiteSpace(policy.PolicyId)) return "Policy ID is blank.";
            if (policy.Version < 1) return "Policy version must be positive.";
            if (policy.EffectiveThrough.HasValue && policy.EffectiveThrough.Value < policy.EffectiveFrom)
                return "Policy effective interval is inverted.";
            if (policy.Rules == null || policy.Rules.Count == 0) return "Policy contains no rules.";
            if (policy.Rules.Any(rule => string.IsNullOrWhiteSpace(rule.RuleId) || rule.Actions == null || rule.Actions.Count == 0))
                return "A policy rule is missing its ID or actions.";
            if (policy.Rules.GroupBy(rule => rule.RuleId, StringComparer.OrdinalIgnoreCase).Any(group => group.Count() > 1))
                return "Policy contains duplicate rule IDs.";
            if (policy.Rules.SelectMany(rule => rule.Requirements?.ApprovalGroups ?? new List<ApprovalGroupRequirement>())
                .Any(group => string.IsNullOrWhiteSpace(group.GroupId) || group.ApprovalsRequired < 1))
                return "Policy contains an invalid approval group.";
            return null;
        }

        private static void EvaluateRule(
            GovernanceEvaluationRequest request,
            CreditGovernanceRule rule,
            IList<GovernanceFinding> findings)
        {
            var requirements = rule.Requirements ?? new RuleRequirements();
            if (!string.IsNullOrWhiteSpace(requirements.Prohibited))
                findings.Add(Finding("ACTION_PROHIBITED", requirements.Prohibited, rule));
            if (!string.IsNullOrWhiteSpace(requirements.MandatoryEscalation))
                findings.Add(Finding("MANDATORY_ESCALATION", requirements.MandatoryEscalation, rule));
            if (request.Actor == null)
            {
                findings.Add(Finding("ACTOR_MISSING", "The acting officer could not be resolved.", rule));
                return;
            }
            if (requirements.ActorRoles != null &&
                !request.Actor.Roles.Any(role => Contains(requirements.ActorRoles, role)))
                findings.Add(Finding("ROLE_NOT_PERMITTED", "The acting officer does not hold a permitted role.", rule));
            if (requirements.DelegatedAuthorityRequired)
            {
                bool exceeded;
                if (!HasAuthority(request, out exceeded))
                    findings.Add(Finding(
                        exceeded ? "DELEGATED_AUTHORITY_EXCEEDED" : "DELEGATED_AUTHORITY_MISSING",
                        exceeded ? "The case exceeds delegated authority." : "No effective grant covers this action.",
                        rule));
            }
            foreach (var priorAction in requirements.IndependentFrom ?? new List<GovernedCreditAction>())
            {
                var evidence = request.ActionHistory.Where(item => item.Action == priorAction).ToList();
                if (evidence.Count == 0)
                    findings.Add(Finding("INDEPENDENCE_EVIDENCE_MISSING", "Required prior-action evidence is missing.", rule));
                else
                {
                    var same = evidence.Where(item => Equal(item.ActorId, request.Actor.ActorId)).ToList();
                    if (same.Count > 0)
                    {
                        var item = Finding("INDEPENDENCE_REQUIRED", "The action requires an independent person.", rule);
                        item.EvidenceIds = same.Select(value => value.EvidenceId).ToList();
                        findings.Add(item);
                    }
                }
            }
            foreach (var group in requirements.ApprovalGroups ?? new List<ApprovalGroupRequirement>())
            {
                var relevant = request.Approvals.Where(approval =>
                    Equal(approval.GroupId, group.GroupId) &&
                    (group.CommitteeId == null || Equal(approval.CommitteeId, group.CommitteeId)) &&
                    (group.RecusedActorIds == null || !Contains(group.RecusedActorIds, approval.ActorId)) &&
                    (group.EligibleRoles == null || approval.ActorRoles.Any(role => Contains(group.EligibleRoles, role))))
                    .ToList();
                var approved = relevant.Where(approval => Equal(approval.Decision, "APPROVE")).ToList();
                var count = group.DistinctActors
                    ? approved.Select(value => value.ActorId?.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).Count()
                    : approved.Count;
                var quorumVotes = relevant.Where(approval =>
                    !Equal(approval.Decision, "ABSTAIN") || group.AbstentionsCountTowardQuorum).ToList();
                var quorumCount = group.DistinctActors
                    ? quorumVotes.Select(value => value.ActorId?.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).Count()
                    : quorumVotes.Count;
                var quorumSatisfied = !group.QuorumRequired.HasValue ||
                    quorumCount >= group.QuorumRequired.Value;
                var decisive = relevant.Where(value => !Equal(value.Decision, "ABSTAIN")).ToList();
                var unanimous = !group.Unanimous ||
                    (decisive.Count > 0 && decisive.All(value => Equal(value.Decision, "APPROVE")));
                var authorityExceeded =
                    (group.MaximumAmount.HasValue && request.Facts.Amount > group.MaximumAmount.Value) ||
                    (group.MaximumRelationshipExposure.HasValue &&
                     request.Facts.TotalRelationshipExposure > group.MaximumRelationshipExposure.Value);
                if (count < group.ApprovalsRequired || !unanimous || !quorumSatisfied || authorityExceeded)
                {
                    var code = authorityExceeded
                        ? "COMMITTEE_AUTHORITY_EXCEEDED"
                        : !quorumSatisfied
                            ? "COMMITTEE_QUORUM_UNSATISFIED"
                            : group.CommitteeId == null
                                ? "APPROVAL_GROUP_UNSATISFIED"
                                : "COMMITTEE_ACTION_REQUIRED";
                    var item = Finding(
                        code,
                        "The required approval group is not satisfied.",
                        rule);
                    item.EvidenceIds = approved.Select(value => value.ApprovalId).ToList();
                    findings.Add(item);
                }
            }
        }

        private static bool HasAuthority(GovernanceEvaluationRequest request, out bool exceeded)
        {
            exceeded = false;
            foreach (var grant in request.Actor.AuthorityGrants ?? new List<DelegatedAuthorityGrant>())
            {
                if (!grant.Actions.Contains(request.Action)) continue;
                if (request.EvaluatedAt < grant.EffectiveFrom ||
                    (grant.EffectiveThrough.HasValue && request.EvaluatedAt > grant.EffectiveThrough.Value)) continue;
                if (grant.Products != null && !Contains(grant.Products, request.Facts.Product)) continue;
                if (grant.RiskRatings != null && !Contains(grant.RiskRatings, request.Facts.RiskRating)) continue;
                if (grant.Geographies != null && !Contains(grant.Geographies, request.Facts.Geography)) continue;
                if (grant.Industries != null && !Contains(grant.Industries, request.Facts.Industry)) continue;
                if (request.Facts.InsiderStatus && !grant.InsiderPermitted) continue;
                if (!string.IsNullOrWhiteSpace(request.Facts.CriticizedClassifiedStatus) &&
                    (grant.CriticizedClassifiedStatuses == null ||
                     !Contains(grant.CriticizedClassifiedStatuses, request.Facts.CriticizedClassifiedStatus)))
                    continue;
                if (grant.MaximumAmount.HasValue && request.Facts.Amount > grant.MaximumAmount.Value)
                {
                    exceeded = true;
                    continue;
                }
                if (grant.MaximumRelationshipExposure.HasValue &&
                    request.Facts.TotalRelationshipExposure > grant.MaximumRelationshipExposure.Value)
                {
                    exceeded = true;
                    continue;
                }
                if (grant.MaximumUnsecuredAmount.HasValue &&
                    request.Facts.UnsecuredExposure > grant.MaximumUnsecuredAmount.Value)
                {
                    exceeded = true;
                    continue;
                }
                if (request.Facts.HasPolicyException &&
                    (grant.ExceptionTypes == null ||
                     request.Facts.PolicyExceptionTypes == null ||
                     !request.Facts.PolicyExceptionTypes.Any(value => Contains(grant.ExceptionTypes, value))))
                    continue;
                return true;
            }
            return false;
        }

        private static GovernanceFinding Finding(string code, string message, CreditGovernanceRule rule) =>
            new GovernanceFinding
            {
                Code = code,
                Message = message,
                RuleId = rule?.RuleId,
                NonOverrideable = rule?.NonOverrideable ?? true,
            };

        private static GovernanceEvaluation Block(GovernanceEvaluation result, string code, string message)
        {
            result.Decision = GovernanceDecision.Block;
            result.Findings.Add(Finding(code, message, null));
            return result;
        }
    }
}
