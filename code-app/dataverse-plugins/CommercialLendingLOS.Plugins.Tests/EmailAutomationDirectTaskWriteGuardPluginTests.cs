using System;
using CommercialLendingLOS.Plugins.Tests.Fakes;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace CommercialLendingLOS.Plugins.Tests;

public sealed class EmailAutomationDirectTaskWriteGuardPluginTests
{
    private static FakeServiceProvider Provider(bool automationActor)
    {
        var provider = new FakeServiceProvider();
        var actor = Guid.NewGuid();
        provider.Context.MessageName = "Create";
        provider.Context.PrimaryEntityName = "cr664_dealtask1";
        provider.Context.Stage = 20;
        provider.Context.ExecutionMode = 0;
        provider.Context.InitiatingUserId = actor;
        provider.Context.InputParameters = new ParameterCollection { ["Target"] = new Entity("cr664_dealtask1") };
        if (automationActor)
        {
            provider.OrganizationService.Seed(new Entity("cr664_emailautomationpermission", Guid.NewGuid())
            {
                ["cr664_serviceactor"] = new EntityReference("systemuser", actor),
                ["cr664_effectivefrom"] = DateTime.UtcNow.AddDays(-1),
                ["statecode"] = new OptionSetValue(0)
            });
        }
        return provider;
    }

    [Fact]
    public void RejectsDirectTaskCreateByMailboxAutomationIdentity()
    {
        var provider = Provider(true);
        var error = Assert.Throws<InvalidPluginExecutionException>(() => new EmailAutomationDirectTaskWriteGuardPlugin().Execute(provider));
        Assert.Contains("EMAIL_AUTOMATION_DIRECT_WRITE_BLOCKED", error.Message);
    }

    [Fact]
    public void RejectsDirectIntakeCreateByMailboxAutomationIdentity()
    {
        var provider = Provider(true);
        provider.Context.PrimaryEntityName = "cr664_emailservicerequestintake";
        provider.Context.InputParameters["Target"] = new Entity("cr664_emailservicerequestintake");
        var error = Assert.Throws<InvalidPluginExecutionException>(() => new EmailAutomationDirectTaskWriteGuardPlugin().Execute(provider));
        Assert.Contains("EMAIL_AUTOMATION_DIRECT_WRITE_BLOCKED", error.Message);
    }
    [Fact]
    public void AllowsNestedTaskCreateFromGovernedCustomApi()
    {
        var provider = Provider(true);
        provider.Context.Parent = new FakePluginExecutionContext { MessageName = EmailServiceRequestIntakePlugin.MessageName };
        new EmailAutomationDirectTaskWriteGuardPlugin().Execute(provider);
    }

    [Fact]
    public void DoesNotChangeNormalHumanTaskCreation()
    {
        var provider = Provider(false);
        new EmailAutomationDirectTaskWriteGuardPlugin().Execute(provider);
    }
}
