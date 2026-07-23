using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Xunit;
using CommercialLendingLOS.Plugins.Tests.Fakes;
using CommercialLendingLOS.Plugins.Tests.Fixtures;

namespace CommercialLendingLOS.Plugins.Tests;

/// <summary>
/// Behavioral test suite for <see cref="LoanDealGovernedTransitionPlugin"/> — the server-side
/// enforcement floor for the canonical loan-deal transition policy. These tests exercise the real
/// compiled plugin class against a hand-rolled in-memory Dataverse fake (no live org, no
/// FakeXrmEasy dependency); they prove the plugin's ACTUAL runtime behavior, not merely that its
/// source text matches the TypeScript policy by inspection (that inspection-level parity is
/// covered separately by src/workflow/governancePluginParityFixture.test.ts).
///
/// Workstream 1 (final-seven-workstreams) — this test project did not exist before this pass; the
/// plugin was previously reviewed by inspection only and had never been compiled, let alone
/// exercised. All tests below pass against the plugin as originally authored — no plugin source
/// change was needed to make this suite green.
/// </summary>
public class LoanDealGovernedTransitionPluginTests
{
    private static void Run(FakeServiceProvider provider) => new LoanDealGovernedTransitionPlugin().Execute(provider);

    // ---------------------------------------------------------------------------------------
    // Valid sequential transitions
    // ---------------------------------------------------------------------------------------

    [Fact]
    public void Advance_IntakeToUnderwriting_IsAllowed()
    {
        var fx = new PluginTestFixture();
        var deal = fx.NewLoanDeal(fx.Intake, fx.StatusOpen);
        var target = PluginTestFixture.TargetFor(deal, newStage: fx.Underwriting.ToEntityReference());
        fx.ConfigureUpdate(preImage: deal, target: target);

        var ex = Record.Exception(() => Run(fx.Provider));
        Assert.Null(ex);
    }

    [Theory]
    [InlineData("INTAKE", "UNDERWRITING")]
    [InlineData("UNDERWRITING", "CREDIT_APPROVAL")]
    [InlineData("COMMITMENT", "DOCUMENTATION")]
    [InlineData("DOCUMENTATION", "CLOSING_FUNDING")]
    [InlineData("CLOSING_FUNDING", "BOARDED")]
    public void Advance_EachAdjacentCanonicalStagePair_IsAllowed(string fromCode, string toCode)
    {
        var fixture = new PluginTestFixture();
        var byCode = new System.Collections.Generic.Dictionary<string, Entity>
        {
            ["INTAKE"] = fixture.Intake,
            ["UNDERWRITING"] = fixture.Underwriting,
            ["CREDIT_APPROVAL"] = fixture.CreditApproval,
            ["COMMITMENT"] = fixture.Commitment,
            ["DOCUMENTATION"] = fixture.Documentation,
            ["CLOSING_FUNDING"] = fixture.ClosingFunding,
            ["BOARDED"] = fixture.Boarded,
        };
        var deal = fixture.NewLoanDeal(byCode[fromCode], fixture.StatusOpen);
        var target = PluginTestFixture.TargetFor(deal, newStage: byCode[toCode].ToEntityReference());
        fixture.ConfigureUpdate(preImage: deal, target: target);
        var ex = Record.Exception(() => new LoanDealGovernedTransitionPlugin().Execute(fixture.Provider));
        Assert.Null(ex);
    }

    // ---------------------------------------------------------------------------------------
    // Skipped stage
    // ---------------------------------------------------------------------------------------

    [Fact]
    public void Advance_SkipsAStage_IsDenied()
    {
        var fx = new PluginTestFixture();
        var deal = fx.NewLoanDeal(fx.Intake, fx.StatusOpen);
        var target = PluginTestFixture.TargetFor(deal, newStage: fx.CreditApproval.ToEntityReference());
        fx.ConfigureUpdate(preImage: deal, target: target);

        var ex = Assert.Throws<InvalidPluginExecutionException>(() => Run(fx.Provider));
        Assert.Contains("not the next stage", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    // ---------------------------------------------------------------------------------------
    // Reverse transition (Return)
    // ---------------------------------------------------------------------------------------

    [Fact]
    public void Return_ToAnyEarlierStage_IsAllowed_WhenReasonFieldEnforcementIsOff()
    {
        // RequireReasonFieldToEnforce is currently a hardcoded `false` in the plugin (the reason
        // column has not been provisioned/cut over yet — see governedTransitionReasonSchema.ts and
        // DEPLOYMENT_AND_ROLLBACK_PLAN.md). This test pins TODAY'S real behavior: a Return succeeds
        // even with no reason text. Once that flag flips to true (a separate, explicit governed
        // cutover), this test's expectation must be revisited alongside it.
        var fx = new PluginTestFixture();
        var deal = fx.NewLoanDeal(fx.Documentation, fx.StatusOpen);
        var target = PluginTestFixture.TargetFor(deal, newStage: fx.Underwriting.ToEntityReference());
        fx.ConfigureUpdate(preImage: deal, target: target);

        var ex = Record.Exception(() => Run(fx.Provider));
        Assert.Null(ex);
    }

    [Fact]
    public void Return_DoesNotRequireTheImmediatelyAdjacentStage()
    {
        // A return is "redo work", not a second forward gate — any strictly earlier stage is legal.
        var fx = new PluginTestFixture();
        var deal = fx.NewLoanDeal(fx.Boarded, fx.StatusOpen);
        var target = PluginTestFixture.TargetFor(deal, newStage: fx.Intake.ToEntityReference());
        fx.ConfigureUpdate(preImage: deal, target: target);

        var ex = Record.Exception(() => Run(fx.Provider));
        Assert.Null(ex);
    }

    // ---------------------------------------------------------------------------------------
    // Terminal-state mutation
    // ---------------------------------------------------------------------------------------

    [Theory]
    [InlineData("DECLINED")]
    [InlineData("WITHDRAWN")]
    [InlineData("BOARDED")]
    public void AnyChange_FromATerminalStatus_IsDenied(string terminalCode)
    {
        var fx = new PluginTestFixture();
        var terminalStatus = terminalCode switch
        {
            "DECLINED" => fx.StatusDeclined,
            "WITHDRAWN" => fx.StatusWithdrawn,
            _ => fx.StatusBoarded,
        };
        var deal = fx.NewLoanDeal(fx.Underwriting, terminalStatus);
        var target = PluginTestFixture.TargetFor(deal, newStage: fx.CreditApproval.ToEntityReference());
        fx.ConfigureUpdate(preImage: deal, target: target);

        var ex = Assert.Throws<InvalidPluginExecutionException>(() => Run(fx.Provider));
        Assert.Contains("terminal", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void DeclineOrWithdraw_FromAnAlreadyBoardedDeal_IsDenied()
    {
        var fx = new PluginTestFixture();
        // BOARDED stage but still status OPEN is an edge state, chosen deliberately to isolate the
        // "already boarded stage" rule from the (separately tested) terminal-status rule.
        var deal = fx.NewLoanDeal(fx.Boarded, fx.StatusOpen);
        var target = PluginTestFixture.TargetFor(deal, newStatus: fx.StatusDeclined.ToEntityReference());
        fx.ConfigureUpdate(preImage: deal, target: target);

        var ex = Assert.Throws<InvalidPluginExecutionException>(() => Run(fx.Provider));
        Assert.Contains("already boarded", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void DeclineOrWithdraw_CannotAlsoChangeStage_IsDenied()
    {
        var fx = new PluginTestFixture();
        var deal = fx.NewLoanDeal(fx.Underwriting, fx.StatusOpen);
        var target = PluginTestFixture.TargetFor(
            deal, newStage: fx.CreditApproval.ToEntityReference(), newStatus: fx.StatusDeclined.ToEntityReference());
        fx.ConfigureUpdate(preImage: deal, target: target);

        var ex = Assert.Throws<InvalidPluginExecutionException>(() => Run(fx.Provider));
        Assert.Contains("cannot also change", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void PlainStatusOnlyChange_ToADanglingUnresolvableStatus_IsDenied_NotSilentlyAllowed()
    {
        // Workstream 1 hardening: previously, a status-only write that did NOT resolve to DECLINED
        // or WITHDRAWN skipped straight to `return;` (allowed) without ever checking that the new
        // status value resolved to a canonical status AT ALL -- a dangling/malformed
        // cr664_statusreference (not merely ON_HOLD) would have been silently allowed through. Fixed
        // to fail closed like every other unresolvable reference in this file.
        var fx = new PluginTestFixture();
        var deal = fx.NewLoanDeal(fx.Intake, fx.StatusOpen);
        var target = PluginTestFixture.TargetFor(deal);
        target["cr664_statusreference"] = new EntityReference("cr664_dealstatusreferences", Guid.NewGuid()); // dangling, not DECLINED/WITHDRAWN
        fx.ConfigureUpdate(preImage: deal, target: target);

        var ex = Assert.Throws<InvalidPluginExecutionException>(() => Run(fx.Provider));
        Assert.Contains("target status could not be resolved", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void PlainStatusOnlyChange_ToOnHold_IsAllowed()
    {
        // OPEN <-> ON_HOLD carries no distinct governed meaning beyond "not terminal" (contract §2) —
        // confirms the hardening fix above did not turn this into an over-broad denial.
        var fx = new PluginTestFixture();
        var deal = fx.NewLoanDeal(fx.Intake, fx.StatusOpen);
        var target = PluginTestFixture.TargetFor(deal, newStatus: fx.StatusOnHold.ToEntityReference());
        fx.ConfigureUpdate(preImage: deal, target: target);

        var ex = Record.Exception(() => Run(fx.Provider));
        Assert.Null(ex);
    }

    [Fact]
    public void Withdraw_FromOpen_WithNoStageChange_IsAllowed()
    {
        var fx = new PluginTestFixture();
        var deal = fx.NewLoanDeal(fx.Underwriting, fx.StatusOpen);
        var target = PluginTestFixture.TargetFor(deal, newStatus: fx.StatusWithdrawn.ToEntityReference());
        fx.ConfigureUpdate(preImage: deal, target: target);

        var ex = Record.Exception(() => Run(fx.Provider));
        Assert.Null(ex);
    }

    // ---------------------------------------------------------------------------------------
    // Unauthorized approval (CREDIT_APPROVAL -> COMMITMENT)
    // ---------------------------------------------------------------------------------------

    [Fact]
    public void CreditApprovalToCommitment_AmountExceedsIndividualLimit_IsDenied()
    {
        var fx = new PluginTestFixture();
        var deal = fx.NewLoanDeal(fx.CreditApproval, fx.StatusOpen, amount: 750_000m);
        fx.SeedSystemUser(fx.Provider.Context.InitiatingUserId, "banker@oldglorybank.com");
        fx.SeedBanker("banker@oldglorybank.com", approvalLimit: 500_000m, creditCommitteeMember: true, overrideAuthority: false);
        var target = PluginTestFixture.TargetFor(deal, newStage: fx.Commitment.ToEntityReference());
        fx.ConfigureUpdate(preImage: deal, target: target);

        var ex = Assert.Throws<InvalidPluginExecutionException>(() => Run(fx.Provider));
        Assert.Contains("exceeds your individual approval authority", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void CreditApprovalToCommitment_NotACreditCommitteeMember_IsDenied()
    {
        var fx = new PluginTestFixture();
        var deal = fx.NewLoanDeal(fx.CreditApproval, fx.StatusOpen, amount: 100_000m);
        fx.SeedSystemUser(fx.Provider.Context.InitiatingUserId, "banker@oldglorybank.com");
        fx.SeedBanker("banker@oldglorybank.com", approvalLimit: 500_000m, creditCommitteeMember: false, overrideAuthority: false);
        var target = PluginTestFixture.TargetFor(deal, newStage: fx.Commitment.ToEntityReference());
        fx.ConfigureUpdate(preImage: deal, target: target);

        var ex = Assert.Throws<InvalidPluginExecutionException>(() => Run(fx.Provider));
        Assert.Contains("credit committee authority", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void CreditApprovalToCommitment_NoBankerProfile_IsDenied()
    {
        var fx = new PluginTestFixture();
        var deal = fx.NewLoanDeal(fx.CreditApproval, fx.StatusOpen, amount: 100_000m);
        fx.SeedSystemUser(fx.Provider.Context.InitiatingUserId, "unknown@oldglorybank.com");
        var target = PluginTestFixture.TargetFor(deal, newStage: fx.Commitment.ToEntityReference());
        fx.ConfigureUpdate(preImage: deal, target: target);

        var ex = Assert.Throws<InvalidPluginExecutionException>(() => Run(fx.Provider));
        Assert.Contains("not set up for approval actions", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void CreditApprovalToCommitment_AuthorityFieldsUnconfigured_IsDenied()
    {
        // FAIL CLOSED: any of the three authority fields absent must read as "not authorized", never "false".
        var fx = new PluginTestFixture();
        var deal = fx.NewLoanDeal(fx.CreditApproval, fx.StatusOpen, amount: 100_000m);
        fx.SeedSystemUser(fx.Provider.Context.InitiatingUserId, "banker@oldglorybank.com");
        fx.SeedBanker("banker@oldglorybank.com", approvalLimit: null, creditCommitteeMember: true, overrideAuthority: false);
        var target = PluginTestFixture.TargetFor(deal, newStage: fx.Commitment.ToEntityReference());
        fx.ConfigureUpdate(preImage: deal, target: target);

        var ex = Assert.Throws<InvalidPluginExecutionException>(() => Run(fx.Provider));
        Assert.Contains("not yet configured", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void CreditApprovalToCommitment_NoAmountRecorded_IsDenied()
    {
        var fx = new PluginTestFixture();
        var deal = fx.NewLoanDeal(fx.CreditApproval, fx.StatusOpen, amount: null);
        fx.SeedSystemUser(fx.Provider.Context.InitiatingUserId, "banker@oldglorybank.com");
        fx.SeedBanker("banker@oldglorybank.com", approvalLimit: 500_000m, creditCommitteeMember: true, overrideAuthority: false);
        var target = PluginTestFixture.TargetFor(deal, newStage: fx.Commitment.ToEntityReference());
        fx.ConfigureUpdate(preImage: deal, target: target);

        var ex = Assert.Throws<InvalidPluginExecutionException>(() => Run(fx.Provider));
        Assert.Contains("amount must be recorded", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void CreditApprovalToCommitment_WithinLimitAndCommitteeMember_IsAllowed()
    {
        var fx = new PluginTestFixture();
        var deal = fx.NewLoanDeal(fx.CreditApproval, fx.StatusOpen, amount: 250_000m);
        fx.SeedSystemUser(fx.Provider.Context.InitiatingUserId, "banker@oldglorybank.com");
        fx.SeedBanker("banker@oldglorybank.com", approvalLimit: 500_000m, creditCommitteeMember: true, overrideAuthority: false);
        var target = PluginTestFixture.TargetFor(deal, newStage: fx.Commitment.ToEntityReference());
        fx.ConfigureUpdate(preImage: deal, target: target);

        var ex = Record.Exception(() => Run(fx.Provider));
        Assert.Null(ex);
    }

    [Fact]
    public void CreditApprovalToCommitment_OverrideAuthority_BypassesLimitAndCommitteeChecks()
    {
        var fx = new PluginTestFixture();
        var deal = fx.NewLoanDeal(fx.CreditApproval, fx.StatusOpen, amount: 10_000_000m);
        fx.SeedSystemUser(fx.Provider.Context.InitiatingUserId, "chief-credit-officer@oldglorybank.com");
        fx.SeedBanker("chief-credit-officer@oldglorybank.com", approvalLimit: 0m, creditCommitteeMember: false, overrideAuthority: true);
        var target = PluginTestFixture.TargetFor(deal, newStage: fx.Commitment.ToEntityReference());
        fx.ConfigureUpdate(preImage: deal, target: target);

        var ex = Record.Exception(() => Run(fx.Provider));
        Assert.Null(ex);
    }

    // ---------------------------------------------------------------------------------------
    // Inactive stage row
    // ---------------------------------------------------------------------------------------

    [Fact]
    public void Advance_WhenTheNextStageBySequenceIsInactive_IsDenied()
    {
        // The next-stage lookup filters cr664_activeflag == true; deactivating UNDERWRITING means
        // "the next active stage after INTAKE" is CREDIT_APPROVAL (seq 300), not UNDERWRITING (seq
        // 200) — so a client-requested move to UNDERWRITING is rejected as "not the next stage",
        // even though UNDERWRITING itself still resolves as a canonical code.
        var fx = new PluginTestFixture();
        fx.Underwriting["cr664_activeflag"] = false;
        fx.Service.Seed(fx.Underwriting);
        var deal = fx.NewLoanDeal(fx.Intake, fx.StatusOpen);
        var target = PluginTestFixture.TargetFor(deal, newStage: fx.Underwriting.ToEntityReference());
        fx.ConfigureUpdate(preImage: deal, target: target);

        var ex = Assert.Throws<InvalidPluginExecutionException>(() => Run(fx.Provider));
        Assert.Contains("not the next stage", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Advance_WhenNoActiveStageExistsAfterTheCurrentOne_IsDenied()
    {
        var fx = new PluginTestFixture();
        fx.Underwriting["cr664_activeflag"] = false;
        fx.Service.Seed(fx.Underwriting);
        fx.CreditApproval["cr664_activeflag"] = false;
        fx.Service.Seed(fx.CreditApproval);
        fx.Commitment["cr664_activeflag"] = false;
        fx.Service.Seed(fx.Commitment);
        fx.Documentation["cr664_activeflag"] = false;
        fx.Service.Seed(fx.Documentation);
        fx.ClosingFunding["cr664_activeflag"] = false;
        fx.Service.Seed(fx.ClosingFunding);
        fx.Boarded["cr664_activeflag"] = false;
        fx.Service.Seed(fx.Boarded);
        var deal = fx.NewLoanDeal(fx.Intake, fx.StatusOpen);
        var target = PluginTestFixture.TargetFor(deal, newStage: fx.Underwriting.ToEntityReference());
        fx.ConfigureUpdate(preImage: deal, target: target);

        var ex = Assert.Throws<InvalidPluginExecutionException>(() => Run(fx.Provider));
        Assert.Contains("no legal next stage", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    // ---------------------------------------------------------------------------------------
    // Unrelated deal update (neither stage nor status touched)
    // ---------------------------------------------------------------------------------------

    [Fact]
    public void UpdateThatTouchesNeitherStageNorStatus_IsIgnored()
    {
        var fx = new PluginTestFixture();
        var deal = fx.NewLoanDeal(fx.Intake, fx.StatusOpen, amount: 100_000m);
        var target = PluginTestFixture.TargetFor(deal, newAmount: 250_000m); // amount-only edit
        fx.ConfigureUpdate(preImage: deal, target: target);

        var ex = Record.Exception(() => Run(fx.Provider));
        Assert.Null(ex);
    }

    // ---------------------------------------------------------------------------------------
    // Idempotent update — re-saving the SAME stage reference value
    // ---------------------------------------------------------------------------------------

    [Fact]
    public void ReassigningTheSameStageValue_IsDenied_AsAnUnrecognizedTransition()
    {
        // This is real, current plugin behavior, not a test bug: touching cr664_stagereference with
        // the SAME value it already held matches neither the advance branch (codes are equal, so
        // `toStage.Code != fromStage.Code` is false) nor the return branch, and falls through to the
        // final fail-closed "not a recognized governed transition" denial. Documented as a known
        // behavior in DATAVERSE_GOVERNANCE_PLUGIN_DEPLOYMENT.md: a client-side "no-op save" that
        // resends the current stage lookup value will be rejected by this plugin once registered.
        var fx = new PluginTestFixture();
        var deal = fx.NewLoanDeal(fx.Underwriting, fx.StatusOpen);
        var target = PluginTestFixture.TargetFor(deal, newStage: fx.Underwriting.ToEntityReference());
        fx.ConfigureUpdate(preImage: deal, target: target);

        var ex = Assert.Throws<InvalidPluginExecutionException>(() => Run(fx.Provider));
        Assert.Contains("does not match a recognized governed transition", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    // ---------------------------------------------------------------------------------------
    // Null / malformed stage values
    // ---------------------------------------------------------------------------------------

    [Fact]
    public void MissingPreImage_IsDenied_FailClosed()
    {
        var fx = new PluginTestFixture();
        var deal = fx.NewLoanDeal(fx.Intake, fx.StatusOpen);
        var target = PluginTestFixture.TargetFor(deal, newStage: fx.Underwriting.ToEntityReference());
        fx.Provider.Context.Stage = 20;
        fx.Provider.Context.MessageName = "Update";
        fx.Provider.Context.PrimaryEntityName = "cr664_loandeal";
        fx.Provider.Context.InputParameters = new ParameterCollection { { "Target", target } };
        fx.Provider.Context.PreEntityImages = new EntityImageCollection(); // deliberately empty

        var ex = Assert.Throws<InvalidPluginExecutionException>(() => Run(fx.Provider));
        Assert.Contains("no prior-state image", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void NonCanonicalCurrentStageCode_IsDenied_FailClosed()
    {
        var fx = new PluginTestFixture();
        var rogueStage = fx.SeedStage("SOME_UNRATIFIED_CODE", 150);
        var deal = fx.NewLoanDeal(rogueStage, fx.StatusOpen);
        var target = PluginTestFixture.TargetFor(deal, newStage: fx.Underwriting.ToEntityReference());
        fx.ConfigureUpdate(preImage: deal, target: target);

        var ex = Assert.Throws<InvalidPluginExecutionException>(() => Run(fx.Provider));
        Assert.Contains("could not be resolved", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void StageRowMissingSequenceAttribute_IsDenied_FailClosed()
    {
        var fx = new PluginTestFixture();
        var unseeded = new Entity("cr664_dealstagereferences", Guid.NewGuid());
        unseeded["cr664_code"] = "INTAKE"; // canonical code, but no cr664_sequence set at all
        fx.Service.Seed(unseeded);
        var deal = fx.NewLoanDeal(unseeded, fx.StatusOpen);
        var target = PluginTestFixture.TargetFor(deal, newStage: fx.Underwriting.ToEntityReference());
        fx.ConfigureUpdate(preImage: deal, target: target);

        var ex = Assert.Throws<InvalidPluginExecutionException>(() => Run(fx.Provider));
        Assert.Contains("could not be resolved", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void NonCanonicalTargetStageCode_IsDenied_FailClosed()
    {
        // toStage resolves to null (a non-canonical code is never a legal transition target), so the
        // write matches neither the advance nor return branch and falls through to the generic,
        // still fail-closed, catch-all denial — it is never silently allowed.
        var fx = new PluginTestFixture();
        var rogueStage = fx.SeedStage("NOT_A_REAL_STAGE", 250);
        var deal = fx.NewLoanDeal(fx.Intake, fx.StatusOpen);
        var target = PluginTestFixture.TargetFor(deal, newStage: rogueStage.ToEntityReference());
        fx.ConfigureUpdate(preImage: deal, target: target);

        var ex = Assert.Throws<InvalidPluginExecutionException>(() => Run(fx.Provider));
        Assert.Contains("does not match a recognized governed transition", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void DanglingStatusReference_ToARowThatDoesNotExist_IsDeniedGracefully_NotARawPlatformFault()
    {
        // Workstream 1 hardening: ResolveStatusCode now wraps its Retrieve in try/catch so a
        // dangling/unresolvable lookup (row deleted, id typo'd) fails closed with the plugin's own
        // safe message instead of letting a raw platform exception escape uncaught.
        var fx = new PluginTestFixture();
        var deal = fx.NewLoanDeal(fx.Intake, fx.StatusOpen);
        var target = PluginTestFixture.TargetFor(deal);
        target["cr664_statusreference"] = new EntityReference("cr664_dealstatusreferences", Guid.NewGuid()); // no row seeded at all
        fx.ConfigureUpdate(preImage: deal, target: target);

        var ex = Assert.Throws<InvalidPluginExecutionException>(() => Run(fx.Provider));
        Assert.Contains("could not be resolved", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void DanglingStageReference_OnThePreImage_IsDeniedGracefully_NotARawPlatformFault()
    {
        var fx = new PluginTestFixture();
        var deal = new Entity("cr664_loandeal", Guid.NewGuid());
        deal["cr664_stagereference"] = new EntityReference("cr664_dealstagereferences", Guid.NewGuid()); // dangling
        deal["cr664_statusreference"] = fx.StatusOpen.ToEntityReference();
        fx.Service.Seed(deal);
        var target = PluginTestFixture.TargetFor(deal, newStage: fx.Underwriting.ToEntityReference());
        fx.ConfigureUpdate(preImage: deal, target: target);

        var ex = Assert.Throws<InvalidPluginExecutionException>(() => Run(fx.Provider));
        Assert.Contains("could not be resolved", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    // ---------------------------------------------------------------------------------------
    // Message / entity / pipeline-stage filters (defense against the plugin firing where it
    // should not even look at the record)
    // ---------------------------------------------------------------------------------------

    [Fact]
    public void NonUpdateMessage_IsIgnoredEntirely()
    {
        var fx = new PluginTestFixture();
        fx.Provider.Context.MessageName = "Create";
        fx.Provider.Context.Stage = 20;
        fx.Provider.Context.PrimaryEntityName = "cr664_loandeal";
        // Deliberately no InputParameters/PreEntityImages seeded — if the plugin tried to read
        // Target it would throw a cast/key-not-found exception, proving it truly returned early.
        var ex = Record.Exception(() => Run(fx.Provider));
        Assert.Null(ex);
    }

    [Fact]
    public void NonLoanDealPrimaryEntity_IsIgnoredEntirely()
    {
        var fx = new PluginTestFixture();
        fx.Provider.Context.MessageName = "Update";
        fx.Provider.Context.Stage = 20;
        fx.Provider.Context.PrimaryEntityName = "cr664_dealtask1";
        var ex = Record.Exception(() => Run(fx.Provider));
        Assert.Null(ex);
    }

    [Theory]
    [InlineData(30)] // main operation
    [InlineData(40)] // post-operation — too late to prevent the write
    public void WrongPipelineStage_IsIgnoredEntirely(int stage)
    {
        var fx = new PluginTestFixture();
        fx.Provider.Context.MessageName = "Update";
        fx.Provider.Context.Stage = stage;
        fx.Provider.Context.PrimaryEntityName = "cr664_loandeal";
        var ex = Record.Exception(() => Run(fx.Provider));
        Assert.Null(ex);
    }

    // ---------------------------------------------------------------------------------------
    // Stage-10 rejection audit write (the durable "blocked" audit trail)
    // ---------------------------------------------------------------------------------------

    [Fact]
    public void PreValidationRejection_WritesADurableAuditRow_WhenTheActorResolves()
    {
        var fx = new PluginTestFixture();
        var deal = fx.NewLoanDeal(fx.Intake, fx.StatusOpen);
        var coreUserId = Guid.NewGuid();
        fx.SeedSystemUser(fx.Provider.Context.InitiatingUserId, "banker@oldglorybank.com");
        fx.SeedPlatformUser("banker@oldglorybank.com", coreUserId);
        var target = PluginTestFixture.TargetFor(deal, newStage: fx.CreditApproval.ToEntityReference()); // a skip
        fx.ConfigureUpdate(preImage: deal, target: target, stage: 10);

        Assert.Throws<InvalidPluginExecutionException>(() => Run(fx.Provider));

        var audit = Assert.Single(fx.Service.Created);
        Assert.Equal("cr664_auditevents", audit.LogicalName);
        Assert.Equal("Governed Transition Rejected", audit["cr664_auditeventname"]);
        Assert.Equal(fx.Provider.Context.CorrelationId.ToString(), audit["cr664_correlationid"]);
        var changedBy = Assert.IsType<EntityReference>(audit["cr664_ChangedBy"]);
        Assert.Equal("cr664_user", changedBy.LogicalName);
        Assert.Equal(coreUserId, changedBy.Id);
    }

    [Fact]
    public void PreValidationRejection_NeverFabricatesAnAuditActor_WhenTheActorCannotBeResolved()
    {
        var fx = new PluginTestFixture();
        var deal = fx.NewLoanDeal(fx.Intake, fx.StatusOpen);
        // Deliberately no systemuser / platform-user rows seeded — actor cannot be resolved.
        var target = PluginTestFixture.TargetFor(deal, newStage: fx.CreditApproval.ToEntityReference());
        fx.ConfigureUpdate(preImage: deal, target: target, stage: 10);

        Assert.Throws<InvalidPluginExecutionException>(() => Run(fx.Provider));

        Assert.Empty(fx.Service.Created); // fail closed: no audit row rather than a fabricated actor bind
    }

    [Fact]
    public void PreOperationRejection_NeverAttemptsAnAuditWrite()
    {
        // Stage 20 rejections roll back with the aborted transaction, so the plugin must not even
        // try — an attempted write here would be silently discarded by the platform, which is a
        // worse outcome than clearly never attempting it.
        var fx = new PluginTestFixture();
        var deal = fx.NewLoanDeal(fx.Intake, fx.StatusOpen);
        var coreUserId = Guid.NewGuid();
        fx.SeedSystemUser(fx.Provider.Context.InitiatingUserId, "banker@oldglorybank.com");
        fx.SeedPlatformUser("banker@oldglorybank.com", coreUserId);
        var target = PluginTestFixture.TargetFor(deal, newStage: fx.CreditApproval.ToEntityReference());
        fx.ConfigureUpdate(preImage: deal, target: target, stage: 20);

        Assert.Throws<InvalidPluginExecutionException>(() => Run(fx.Provider));

        Assert.Empty(fx.Service.Created);
    }
}
