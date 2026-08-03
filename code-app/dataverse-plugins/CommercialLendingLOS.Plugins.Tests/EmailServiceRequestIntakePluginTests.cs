using System;
using System.Linq;
using CommercialLendingLOS.Plugins.Tests.Fakes;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace CommercialLendingLOS.Plugins.Tests;

public sealed class EmailServiceRequestIntakePluginTests
{
    private static FakeServiceProvider Ready(out Guid dealId, out Guid assigneeId)
    {
        var provider = new FakeServiceProvider();
        var actorId = Guid.NewGuid();
        dealId = Guid.NewGuid();
        assigneeId = Guid.NewGuid();
        var coreUserId = Guid.NewGuid();
        provider.Context.MessageName = EmailServiceRequestIntakePlugin.MessageName;
        provider.Context.Stage = 30;
        provider.Context.ExecutionMode = 0;
        provider.Context.InitiatingUserId = actorId;
        provider.OrganizationService.Seed(new Entity("systemuser", actorId) { ["internalemailaddress"] = "automation@oldglorybank.com", ["isdisabled"] = false });
        provider.OrganizationService.Seed(new Entity("systemuser", assigneeId) { ["internalemailaddress"] = "banker@oldglorybank.com", ["isdisabled"] = false });
        provider.OrganizationService.Seed(new Entity("cr664_loandeal", dealId) { ["cr664_name"] = "Deal 1" });
        provider.OrganizationService.Seed(new Entity("cr664_user", coreUserId) { ["cr664_email"] = "automation@oldglorybank.com" });
        provider.OrganizationService.Seed(new Entity("cr664_emailautomationpermission", Guid.NewGuid())
        {
            ["cr664_serviceactor"] = new EntityReference("systemuser", actorId),
            ["cr664_coreuser"] = new EntityReference("cr664_user", coreUserId),
            ["cr664_mailboxid"] = "service@oldglorybank.com",
            ["cr664_automatictaskcreation"] = true,
            ["cr664_minimumconfidence"] = .90m,
            ["cr664_maximumagehours"] = 24,
            ["cr664_defaultduehours"] = 8,
            ["cr664_allowedcategoriescsv"] = "servicing_request,document_request",
            ["cr664_effectivefrom"] = DateTime.UtcNow.AddDays(-1),
            ["statecode"] = new OptionSetValue(0)
        });
        provider.Context.InputParameters = Input(dealId, assigneeId);
        return provider;
    }

    private static ParameterCollection Input(Guid dealId, Guid assigneeId) => new()
    {
        ["CorrelationId"] = Guid.NewGuid().ToString("D"), ["MailboxId"] = "service@oldglorybank.com",
        ["InternetMessageId"] = "<message-1@example.com>", ["ContentHash"] = new string('a', 64),
        ["SenderAddress"] = "customer@example.com", ["ReceivedAt"] = DateTime.UtcNow.AddMinutes(-5).ToString("o"),
        ["Subject"] = "Please update my insurance", ["Category"] = "servicing_request", ["Confidence"] = .98m,
        ["IsServiceRequest"] = true, ["SuspiciousContent"] = false, ["UsedProtectedCharacteristic"] = false,
        ["MatchStatus"] = "unique", ["DealId"] = dealId.ToString("D"), ["AssigneeSystemUserId"] = assigneeId.ToString("D"),
        ["RequestedDueAt"] = "", ["SuggestedTaskTitle"] = "Review insurance renewal",
        ["Rationale"] = "Explicit servicing request.", ["HasAttachments"] = true
    };

    [Fact]
    public void CreatesTaskAuditTimelineAndIntakeForAuthorizedUniqueRequest()
    {
        var provider = Ready(out _, out _);
        new EmailServiceRequestIntakePlugin().Execute(provider);
        Assert.Single(provider.OrganizationService.Created.Where(row => row.LogicalName == "cr664_dealtask1"));
        Assert.Single(provider.OrganizationService.Created.Where(row => row.LogicalName == "cr664_auditevent"));
        Assert.Single(provider.OrganizationService.Created.Where(row => row.LogicalName == "cr664_dealtimelineevent"));
        var intake = Assert.Single(provider.OrganizationService.Created.Where(row => row.LogicalName == "cr664_emailservicerequestintake"));
        Assert.Equal("TASK_CREATED", intake.GetAttributeValue<string>("cr664_status"));
        Assert.Contains("task-created", (string)provider.Context.OutputParameters["ResultJson"]);
    }

    [Fact]
    public void DuplicateDeliveryReturnsExistingResultWithoutSecondTask()
    {
        var provider = Ready(out _, out _);
        var plugin = new EmailServiceRequestIntakePlugin();
        plugin.Execute(provider);
        provider.Context.OutputParameters = new ParameterCollection();
        provider.Context.InputParameters["CorrelationId"] = Guid.NewGuid().ToString("D");
        plugin.Execute(provider);
        Assert.Single(provider.OrganizationService.Created.Where(row => row.LogicalName == "cr664_dealtask1"));
        Assert.Contains("duplicate", (string)provider.Context.OutputParameters["ResultJson"]);
    }

    [Theory]
    [InlineData("Confidence", 0.20)]
    [InlineData("SuspiciousContent", true)]
    [InlineData("MatchStatus", "ambiguous")]
    [InlineData("Category", "suspected_fraud")]
    public void UnsafeOrUncertainRequestGoesToTriageWithoutTask(string key, object value)
    {
        var provider = Ready(out _, out _);
        provider.Context.InputParameters[key] = value;
        new EmailServiceRequestIntakePlugin().Execute(provider);
        Assert.Empty(provider.OrganizationService.Created.Where(row => row.LogicalName == "cr664_dealtask1"));
        var intake = Assert.Single(provider.OrganizationService.Created.Where(row => row.LogicalName == "cr664_emailservicerequestintake"));
        Assert.Equal("TRIAGE_REQUIRED", intake.GetAttributeValue<string>("cr664_status"));
    }

    [Fact]
    public void ProtectedCharacteristicFailsClosedBeforeAnyCreate()
    {
        var provider = Ready(out _, out _);
        provider.Context.InputParameters["UsedProtectedCharacteristic"] = true;
        var error = Assert.Throws<InvalidPluginExecutionException>(() => new EmailServiceRequestIntakePlugin().Execute(provider));
        Assert.Contains("PROTECTED_CHARACTERISTIC_REJECTED", error.Message);
        Assert.Empty(provider.OrganizationService.Created);
    }

    [Fact]
    public void MissingMailboxPermissionFailsClosed()
    {
        var provider = Ready(out _, out _);
        provider.Context.InputParameters["MailboxId"] = "unapproved@oldglorybank.com";
        var error = Assert.Throws<InvalidPluginExecutionException>(() => new EmailServiceRequestIntakePlugin().Execute(provider));
        Assert.Contains("EMAIL_PERMISSION_MISSING", error.Message);
        Assert.Empty(provider.OrganizationService.Created);
    }

    [Fact]
    public void SameMessageIdentityWithChangedContentFailsClosed()
    {
        var provider = Ready(out _, out _);
        var plugin = new EmailServiceRequestIntakePlugin();
        plugin.Execute(provider);
        provider.Context.InputParameters["ContentHash"] = new string('b', 64);
        var error = Assert.Throws<InvalidPluginExecutionException>(() => plugin.Execute(provider));
        Assert.Contains("MESSAGE_ID_CONFLICT", error.Message);
        Assert.Single(provider.OrganizationService.Created.Where(row => row.LogicalName == "cr664_dealtask1"));
    }
}
