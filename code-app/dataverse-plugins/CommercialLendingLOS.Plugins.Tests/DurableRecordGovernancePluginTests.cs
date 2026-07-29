using CommercialLendingLOS.Plugins.Tests.Fakes;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace CommercialLendingLOS.Plugins.Tests;

public sealed class DurableRecordGovernancePluginTests
{
    private const string DealId = "11111111-1111-1111-1111-111111111111";
    private const string ActorEmail = "approver@oldglorybank.com";
    private const string RequesterEmail = "requester@oldglorybank.com";

    [Fact]
    public void Create_CreditDecision_AllowsDistinctAuthorizedApprover()
    {
        var fx = NewFixture();
        var target = Base("cr664_creditapprovaldecision");
        target["cr664_decisionstatus"] = "APPROVED";
        target["cr664_requestedby"] = RequesterEmail;
        target["cr664_decidedby"] = ActorEmail;
        target["cr664_rationale"] = "Approved after independent review.";
        target["cr664_authoritytier"] = "committee";
        ConfigureCreate(fx, target);

        Assert.Null(Record.Exception(() => Run(fx)));
    }

    [Fact]
    public void Create_CreditDecision_BlocksSelfApproval()
    {
        var fx = NewFixture();
        var target = Base("cr664_creditapprovaldecision");
        target["cr664_decisionstatus"] = "APPROVED";
        target["cr664_requestedby"] = ActorEmail;
        target["cr664_decidedby"] = ActorEmail;
        target["cr664_rationale"] = "Attempted self approval.";
        target["cr664_authoritytier"] = "committee";
        ConfigureCreate(fx, target);

        Assert.Contains("requester cannot decide", Assert.Throws<InvalidPluginExecutionException>(() => Run(fx)).Message);
    }

    [Fact]
    public void Create_CreditDecision_BlocksSpoofedActor()
    {
        var fx = NewFixture();
        var target = Base("cr664_creditapprovaldecision");
        target["cr664_decisionstatus"] = "DECLINED";
        target["cr664_requestedby"] = RequesterEmail;
        target["cr664_decidedby"] = "someone.else@oldglorybank.com";
        target["cr664_rationale"] = "Spoofed actor.";
        ConfigureCreate(fx, target);

        Assert.Contains("must match", Assert.Throws<InvalidPluginExecutionException>(() => Run(fx)).Message);
    }

    [Fact]
    public void Create_CreditDecision_BlocksInactiveCoreIdentity()
    {
        var fx = NewFixture(coreIdentityActive: false);
        var target = Base("cr664_creditapprovaldecision");
        target["cr664_decisionstatus"] = "APPROVED";
        target["cr664_requestedby"] = RequesterEmail;
        target["cr664_decidedby"] = ActorEmail;
        target["cr664_rationale"] = "Attempt through inactive core identity.";
        target["cr664_authoritytier"] = "committee";
        ConfigureCreate(fx, target);

        Assert.Contains("core identity must be active", Assert.Throws<InvalidPluginExecutionException>(() => Run(fx)).Message);
    }

    [Fact]
    public void Create_CreditDecision_BlocksBankerLinkedToDifferentCoreIdentity()
    {
        var fx = NewFixture(bankerLinkedToActor: false);
        var target = Base("cr664_creditapprovaldecision");
        target["cr664_decisionstatus"] = "APPROVED";
        target["cr664_requestedby"] = RequesterEmail;
        target["cr664_decidedby"] = ActorEmail;
        target["cr664_rationale"] = "Attempt through mismatched banker link.";
        target["cr664_authoritytier"] = "committee";
        ConfigureCreate(fx, target);

        Assert.Contains("linked to the same core identity", Assert.Throws<InvalidPluginExecutionException>(() => Run(fx)).Message);
    }

    [Fact]
    public void Create_Commitment_BlocksIssueWithoutApprovedDecision()
    {
        var fx = NewFixture();
        var target = Base("cr664_commitmentrecord");
        target["cr664_commitmentstatus"] = "ISSUED";
        target["cr664_issuedby"] = ActorEmail;
        target["cr664_keytermssummary"] = "Terms";
        ConfigureCreate(fx, target);

        Assert.Contains("approved credit decision", Assert.Throws<InvalidPluginExecutionException>(() => Run(fx)).Message);
    }

    [Fact]
    public void Create_Commitment_AllowsIssueAfterApprovedDecision()
    {
        var fx = NewFixture();
        var approval = new Entity("cr664_creditapprovaldecision", Guid.NewGuid());
        approval["cr664_dealid"] = DealId;
        approval["cr664_decisionstatus"] = "APPROVED";
        fx.OrganizationService.Seed(approval);
        var target = Base("cr664_commitmentrecord");
        target["cr664_commitmentstatus"] = "ISSUED";
        target["cr664_issuedby"] = ActorEmail;
        target["cr664_keytermssummary"] = "Terms";
        ConfigureCreate(fx, target);

        Assert.Null(Record.Exception(() => Run(fx)));
    }

    [Theory]
    [InlineData("cr664_conditionverification", "cr664_verifiedby", "cr664_verificationstatus", "CLEARED")]
    [InlineData("cr664_executeddocattestation", "cr664_attestedby", "cr664_attestationstatus", "ATTESTED")]
    [InlineData("cr664_bookingqccheck", "cr664_reviewedby", "cr664_qcstatus", "PASSED")]
    public void Create_LifecycleRecord_RequiresAuthenticatedActor(
        string entity, string actorField, string statusField, string status)
    {
        var fx = NewFixture();
        var target = Base(entity);
        target[actorField] = "spoofed@oldglorybank.com";
        target[statusField] = status;
        target["cr664_notes"] = "Evidence";
        if (entity == "cr664_conditionverification") target["cr664_conditiontype"] = "COLLATERAL";
        if (entity == "cr664_executeddocattestation") target["cr664_executeddate"] = DateTime.UtcNow;
        ConfigureCreate(fx, target);

        Assert.Contains("must match", Assert.Throws<InvalidPluginExecutionException>(() => Run(fx)).Message);
    }

    [Fact]
    public void Create_BookingQc_BlocksOriginatingBanker()
    {
        var fx = NewFixture(actorIsOriginator: true);
        var target = Base("cr664_bookingqccheck");
        target["cr664_reviewedby"] = ActorEmail;
        target["cr664_qcstatus"] = "PASSED";
        target["cr664_notes"] = "Reviewed";
        ConfigureCreate(fx, target);

        Assert.Contains("other than the originating banker", Assert.Throws<InvalidPluginExecutionException>(() => Run(fx)).Message);
    }

    [Fact]
    public void Create_AdverseAction_BlocksNonDeclinedDeal()
    {
        var fx = NewFixture();
        var target = Base("cr664_adverseactionrecord");
        target["cr664_recordedby"] = ActorEmail;
        target["cr664_actionstatus"] = "SENT";
        target["cr664_notes"] = "Notice evidence";
        ConfigureCreate(fx, target);

        Assert.Contains("declined deal", Assert.Throws<InvalidPluginExecutionException>(() => Run(fx)).Message);
    }

    [Fact]
    public void Update_AppendOnlyRecord_IsBlocked()
    {
        var fx = NewFixture();
        var pre = Base("cr664_conditionverification");
        var target = new Entity(pre.LogicalName, pre.Id) { ["cr664_notes"] = "Changed" };
        ConfigureUpdate(fx, pre, target);

        Assert.Contains("append-only", Assert.Throws<InvalidPluginExecutionException>(() => Run(fx)).Message);
    }

    [Fact]
    public void Delete_AnyGovernedRecord_IsBlocked()
    {
        var fx = NewFixture();
        fx.Context.MessageName = "Delete";
        fx.Context.PrimaryEntityName = "cr664_creditapprovaldecision";

        Assert.Contains("cannot be deleted", Assert.Throws<InvalidPluginExecutionException>(() => Run(fx)).Message);
    }

    [Fact]
    public void Create_FundingRequest_AllowsAuthenticatedRequester()
    {
        var fx = NewFixture();
        var target = Base("cr664_fundingauthorization");
        target["cr664_authorizationstatus"] = "PENDING";
        target["cr664_requestedby"] = ActorEmail;
        target["cr664_requestedamount"] = 500000m;
        ConfigureCreate(fx, target);

        Assert.Null(Record.Exception(() => Run(fx)));
    }

    [Fact]
    public void Update_Funding_BlocksRequesterApproval()
    {
        var fx = NewFixture(actorEmail: RequesterEmail);
        var pre = FundingPre();
        var target = new Entity(pre.LogicalName, pre.Id);
        target["cr664_authorizationstatus"] = "APPROVED";
        target["cr664_authorizedby"] = RequesterEmail;
        target["cr664_approvedamount"] = 100000m;
        ConfigureUpdate(fx, pre, target);

        Assert.Contains("requester cannot approve", Assert.Throws<InvalidPluginExecutionException>(() => Run(fx)).Message);
    }

    [Fact]
    public void Update_Funding_BlocksSingleApprovalAboveThreshold()
    {
        var fx = NewFixture();
        var pre = FundingPre();
        var target = new Entity(pre.LogicalName, pre.Id);
        target["cr664_authorizationstatus"] = "APPROVED";
        target["cr664_authorizedby"] = ActorEmail;
        target["cr664_approvedamount"] = 500000m;
        ConfigureUpdate(fx, pre, target);

        Assert.Contains("requires a second", Assert.Throws<InvalidPluginExecutionException>(() => Run(fx)).Message);
    }

    [Fact]
    public void Update_Funding_AllowsFirstApprovalAboveThresholdWithoutFinalApproval()
    {
        var fx = NewFixture();
        var pre = FundingPre();
        var target = new Entity(pre.LogicalName, pre.Id);
        target["cr664_authorizedby"] = ActorEmail;
        target["cr664_approvedamount"] = 500000m;
        ConfigureUpdate(fx, pre, target);

        Assert.Null(Record.Exception(() => Run(fx)));
    }

    [Fact]
    public void Update_Funding_BlocksSameSecondApprover()
    {
        var fx = NewFixture();
        var pre = FundingPre();
        pre["cr664_authorizedby"] = ActorEmail;
        pre["cr664_approvedamount"] = 500000m;
        var target = new Entity(pre.LogicalName, pre.Id);
        target["cr664_authorizationstatus"] = "APPROVED";
        target["cr664_secondapprovedby"] = ActorEmail;
        ConfigureUpdate(fx, pre, target);

        Assert.Contains("distinct users", Assert.Throws<InvalidPluginExecutionException>(() => Run(fx)).Message);
    }

    [Fact]
    public void Update_Funding_BlocksApproverFromConfirmingFunding()
    {
        var fx = NewFixture();
        var pre = FundingPre("APPROVED");
        pre["cr664_authorizedby"] = ActorEmail;
        pre["cr664_approvedamount"] = 500000m;
        pre["cr664_destinationverificationstatus"] = "verified";
        pre["cr664_conditionssatisfied"] = true;
        pre["cr664_exceptionsjson"] = "[]";
        var target = new Entity(pre.LogicalName, pre.Id);
        target["cr664_authorizationstatus"] = "FUNDED";
        target["cr664_fundingdate"] = DateTime.UtcNow;
        ConfigureUpdate(fx, pre, target);

        Assert.Contains("distinct from the funding approvers", Assert.Throws<InvalidPluginExecutionException>(() => Run(fx)).Message);
    }

    [Theory]
    [InlineData(788190105)]
    [InlineData(788190106)]
    public void Update_Funding_AllowsWaivedOrNotApplicableRequirementWithoutUpload(int requirementStatus)
    {
        var fx = NewFixture();
        var requirement = new Entity("cr664_documentchecklist", Guid.NewGuid());
        requirement["cr664_deal"] = new EntityReference("cr664_loandeal", Guid.Parse(DealId));
        requirement["cr664_required"] = true;
        requirement["cr664_requirementstatus"] = new OptionSetValue(requirementStatus);
        requirement["cr664_uploadstatus"] = false;
        requirement["cr664_waived"] = false;
        requirement["statecode"] = new OptionSetValue(0);
        fx.OrganizationService.Seed(requirement);

        var pre = FundingPre("APPROVED");
        pre["cr664_authorizedby"] = "first.approver@oldglorybank.com";
        pre["cr664_secondapprovedby"] = "second.approver@oldglorybank.com";
        pre["cr664_approvedamount"] = 500000m;
        pre["cr664_destinationverificationstatus"] = "verified";
        pre["cr664_conditionssatisfied"] = true;
        pre["cr664_exceptionsjson"] = "[]";
        var target = new Entity(pre.LogicalName, pre.Id);
        target["cr664_authorizationstatus"] = "FUNDED";
        target["cr664_fundingdate"] = DateTime.UtcNow;
        ConfigureUpdate(fx, pre, target);

        Assert.Null(Record.Exception(() => Run(fx)));
    }

    [Fact]
    public void Update_Funding_BlocksReviewedRequirementWithoutUpload()
    {
        var fx = NewFixture();
        var requirement = new Entity("cr664_documentchecklist", Guid.NewGuid());
        requirement["cr664_deal"] = new EntityReference("cr664_loandeal", Guid.Parse(DealId));
        requirement["cr664_required"] = true;
        requirement["cr664_requirementstatus"] = new OptionSetValue(788190104);
        requirement["cr664_uploadstatus"] = false;
        requirement["cr664_waived"] = false;
        requirement["statecode"] = new OptionSetValue(0);
        fx.OrganizationService.Seed(requirement);

        var pre = FundingPre("APPROVED");
        pre["cr664_authorizedby"] = "first.approver@oldglorybank.com";
        pre["cr664_secondapprovedby"] = "second.approver@oldglorybank.com";
        pre["cr664_approvedamount"] = 500000m;
        pre["cr664_destinationverificationstatus"] = "verified";
        pre["cr664_conditionssatisfied"] = true;
        pre["cr664_exceptionsjson"] = "[]";
        var target = new Entity(pre.LogicalName, pre.Id);
        target["cr664_authorizationstatus"] = "FUNDED";
        target["cr664_fundingdate"] = DateTime.UtcNow;
        ConfigureUpdate(fx, pre, target);

        Assert.Contains("required documents", Assert.Throws<InvalidPluginExecutionException>(() => Run(fx)).Message);
    }

    private static FakeServiceProvider NewFixture(
        bool actorIsOriginator = false,
        string actorEmail = ActorEmail,
        bool coreIdentityActive = true,
        bool bankerLinkedToActor = true)
    {
        var fx = new FakeServiceProvider();
        var actorSystemUser = new Entity("systemuser", fx.Context.InitiatingUserId);
        actorSystemUser["internalemailaddress"] = actorEmail;
        actorSystemUser["isdisabled"] = false;
        fx.OrganizationService.Seed(actorSystemUser);

        var coreUserId = Guid.NewGuid();
        var coreUser = new Entity("cr664_user", coreUserId);
        coreUser["cr664_email"] = actorEmail.ToLowerInvariant();
        coreUser["cr664_activeaccessflag"] = coreIdentityActive;
        coreUser["statecode"] = new OptionSetValue(0);
        fx.OrganizationService.Seed(coreUser);

        var platform = new Entity("cr664_platformuser", Guid.NewGuid());
        platform["cr664_normalizedemail"] = actorEmail.ToLowerInvariant();
        platform["cr664_activestatus"] = true;
        platform["cr664_coreuser"] = new EntityReference("cr664_user", coreUserId);
        fx.OrganizationService.Seed(platform);

        var banker = new Entity("cr664_banker", Guid.NewGuid());
        banker["cr664_email"] = actorEmail.ToLowerInvariant();
        banker["cr664_activeflag"] = true;
        banker["cr664_userloginmapping"] = new EntityReference(
            "cr664_user",
            bankerLinkedToActor ? coreUserId : Guid.NewGuid());
        banker["statecode"] = new OptionSetValue(0);
        banker["cr664_approvallimit"] = new Money(1000000m);
        banker["cr664_creditcommitteemember"] = true;
        banker["cr664_approvaloverrideauthority"] = false;
        fx.OrganizationService.Seed(banker);

        var status = new Entity("cr664_dealstatusreferences", Guid.NewGuid());
        status["cr664_code"] = "OPEN";
        fx.OrganizationService.Seed(status);

        var deal = new Entity("cr664_loandeal", Guid.Parse(DealId));
        deal["cr664_amount"] = new Money(1000000m);
        deal["cr664_statusreference"] = status.ToEntityReference();
        if (actorIsOriginator) deal["cr664_assignedbanker"] = banker.ToEntityReference();
        else deal["cr664_assignedbanker"] = new EntityReference("cr664_banker", Guid.NewGuid());
        fx.OrganizationService.Seed(deal);
        return fx;
    }

    private static Entity Base(string entity)
    {
        var target = new Entity(entity, Guid.NewGuid());
        target["cr664_dealid"] = DealId;
        target["cr664_correlationid"] = "test-" + Guid.NewGuid();
        return target;
    }

    private static Entity FundingPre(string status = "PENDING")
    {
        var pre = Base("cr664_fundingauthorization");
        pre["cr664_recordid"] = "farec-" + Guid.NewGuid();
        pre["cr664_authorizationstatus"] = status;
        pre["cr664_requestedamount"] = 500000m;
        pre["cr664_requestedby"] = RequesterEmail;
        pre["cr664_requestedat"] = DateTime.UtcNow;
        pre["cr664_destinationverificationstatus"] = "unverified";
        pre["cr664_conditionssatisfied"] = false;
        pre["cr664_exceptionsjson"] = "[]";
        return pre;
    }

    private static void ConfigureCreate(FakeServiceProvider fx, Entity target)
    {
        fx.Context.Stage = 20;
        fx.Context.MessageName = "Create";
        fx.Context.PrimaryEntityName = target.LogicalName;
        fx.Context.InputParameters = new ParameterCollection { { "Target", target } };
        fx.Context.PreEntityImages = new EntityImageCollection();
    }

    private static void ConfigureUpdate(FakeServiceProvider fx, Entity pre, Entity target)
    {
        fx.Context.Stage = 20;
        fx.Context.MessageName = "Update";
        fx.Context.PrimaryEntityName = target.LogicalName;
        fx.Context.InputParameters = new ParameterCollection { { "Target", target } };
        fx.Context.PreEntityImages = new EntityImageCollection { { "PreImage", pre } };
    }

    private static void Run(FakeServiceProvider fx)
        => new DurableRecordGovernancePlugin().Execute(fx);
}
