using System;
using Microsoft.Xrm.Sdk;
using CommercialLendingLOS.Plugins.Tests.Fakes;

namespace CommercialLendingLOS.Plugins.Tests.Fixtures;

/// <summary>
/// Builds a minimal, realistic set of seeded Dataverse rows for
/// <see cref="LoanDealGovernedTransitionPlugin"/> tests: the seven canonical stage-reference rows
/// (in ratified sequence order, matching stageOrderingContract.ts), the five canonical
/// status-reference rows, and helpers for banker/systemuser/platform-user authority rows. Every
/// schema name mirrors the plugin's own constants exactly (see governancePluginParityFixture.test.ts
/// for the TypeScript-side pin of the same literals).
/// </summary>
public sealed class PluginTestFixture
{
    public FakeServiceProvider Provider { get; } = new();
    public FakeOrganizationService Service => Provider.OrganizationService;

    public Entity Intake { get; }
    public Entity Underwriting { get; }
    public Entity CreditApproval { get; }
    public Entity Commitment { get; }
    public Entity Documentation { get; }
    public Entity ClosingFunding { get; }
    public Entity Boarded { get; }

    public Entity StatusOpen { get; }
    public Entity StatusOnHold { get; }
    public Entity StatusDeclined { get; }
    public Entity StatusWithdrawn { get; }
    public Entity StatusBoarded { get; }

    public PluginTestFixture()
    {
        Intake = SeedStage("INTAKE", 100);
        Underwriting = SeedStage("UNDERWRITING", 200);
        CreditApproval = SeedStage("CREDIT_APPROVAL", 300);
        Commitment = SeedStage("COMMITMENT", 400);
        Documentation = SeedStage("DOCUMENTATION", 500);
        ClosingFunding = SeedStage("CLOSING_FUNDING", 600);
        Boarded = SeedStage("BOARDED", 700);

        StatusOpen = SeedStatus("OPEN");
        StatusOnHold = SeedStatus("ON_HOLD");
        StatusDeclined = SeedStatus("DECLINED");
        StatusWithdrawn = SeedStatus("WITHDRAWN");
        StatusBoarded = SeedStatus("BOARDED");
    }

    public Entity SeedStage(string code, int sequence, bool active = true)
    {
        var e = new Entity("cr664_dealstagereferences", Guid.NewGuid());
        e["cr664_code"] = code;
        e["cr664_sequence"] = sequence;
        e["cr664_activeflag"] = active;
        Service.Seed(e);
        return e;
    }

    public Entity SeedStatus(string code)
    {
        var e = new Entity("cr664_dealstatusreferences", Guid.NewGuid());
        e["cr664_code"] = code;
        Service.Seed(e);
        return e;
    }

    public Entity SeedSystemUser(Guid id, string email)
    {
        var e = new Entity("systemuser", id);
        e["internalemailaddress"] = email;
        Service.Seed(e);
        return e;
    }

    public Entity SeedBanker(string email, decimal? approvalLimit, bool? creditCommitteeMember, bool? overrideAuthority)
    {
        var e = new Entity("cr664_banker", Guid.NewGuid());
        e["cr664_email"] = email;
        if (approvalLimit.HasValue) e["cr664_approvallimit"] = new Money(approvalLimit.Value);
        if (creditCommitteeMember.HasValue) e["cr664_creditcommitteemember"] = creditCommitteeMember.Value;
        if (overrideAuthority.HasValue) e["cr664_approvaloverrideauthority"] = overrideAuthority.Value;
        Service.Seed(e);
        return e;
    }

    public Entity SeedPlatformUser(string email, Guid coreUserId, bool active = true)
    {
        var e = new Entity("cr664_platformuser", Guid.NewGuid());
        e["cr664_email"] = email;
        e["cr664_normalizedemail"] = email.Trim().ToLowerInvariant();
        e["cr664_activestatus"] = active;
        e["statecode"] = 0;
        e["cr664_coreuser"] = new EntityReference("cr664_user", coreUserId);
        Service.Seed(e);
        return e;
    }

    public Entity NewLoanDeal(Entity stage, Entity status, decimal? amount = null)
    {
        var e = new Entity("cr664_loandeal", Guid.NewGuid());
        e["cr664_stagereference"] = stage.ToEntityReference();
        e["cr664_statusreference"] = status.ToEntityReference();
        if (amount.HasValue) e["cr664_amount"] = new Money(amount.Value);
        Service.Seed(e);
        return e;
    }

    /// <summary>Configures the fake context for a stage-20 (pre-operation, in-transaction) Update on
    /// the given deal, with the supplied pre-image and a Target carrying only the changed
    /// attributes (as the real platform would send).</summary>
    public void ConfigureUpdate(Entity preImage, Entity target, int stage = 20)
    {
        Provider.Context.Stage = stage;
        Provider.Context.MessageName = "Update";
        Provider.Context.PrimaryEntityName = "cr664_loandeal";
        Provider.Context.InputParameters = new ParameterCollection { { "Target", target } };
        Provider.Context.PreEntityImages = new EntityImageCollection { { "PreImage", preImage } };
    }

    public static Entity TargetFor(Entity deal, EntityReference? newStage = null, EntityReference? newStatus = null, decimal? newAmount = null)
    {
        var target = new Entity(deal.LogicalName, deal.Id);
        if (newStage != null) target["cr664_stagereference"] = newStage;
        if (newStatus != null) target["cr664_statusreference"] = newStatus;
        if (newAmount.HasValue) target["cr664_amount"] = new Money(newAmount.Value);
        return target;
    }
}
