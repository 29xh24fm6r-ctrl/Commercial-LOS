using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;

namespace CommercialLendingLOS.Plugins.Tests.Fakes;

/// <summary>
/// Minimal fake of <see cref="IPluginExecutionContext"/> — only the members
/// <see cref="LoanDealGovernedTransitionPlugin"/> actually reads are implemented; everything else
/// throws so an accidental dependency on unfaked behavior fails the test instead of silently
/// returning a default.
/// </summary>
public sealed class FakePluginExecutionContext : IPluginExecutionContext
{
    public string MessageName { get; set; } = "Update";
    public string PrimaryEntityName { get; set; } = "cr664_loandeal";
    public int Stage { get; set; } = 20;
    public IPluginExecutionContext? Parent { get; set; }
    public int ExecutionMode { get; set; } = 0;
    public ParameterCollection InputParameters { get; set; } = new();
    public EntityImageCollection PreEntityImages { get; set; } = new();
    public Guid InitiatingUserId { get; set; } = Guid.NewGuid();
    public Guid CorrelationId { get; set; } = Guid.NewGuid();
    public Guid OrganizationId { get; set; } = LosUserProvisioningCustomApiPlugin.ProductionOrganizationId;

    // --- Unused by the plugin under test; throw loudly if ever touched. ---
    public EntityImageCollection PostEntityImages => throw new NotSupportedException();
    public int Mode => ExecutionMode;
    public int IsolationMode => throw new NotSupportedException();
    public int Depth => throw new NotSupportedException();
    public string RequestName => throw new NotSupportedException();
    public string SecondaryEntityName => throw new NotSupportedException();
    public ParameterCollection OutputParameters { get; set; } = new();
    public ParameterCollection SharedVariables => throw new NotSupportedException();
    public Guid UserId => InitiatingUserId;
    public Guid BusinessUnitId => throw new NotSupportedException();
    public string OrganizationName => throw new NotSupportedException();
    public Guid PrimaryEntityId => throw new NotSupportedException();
    public EntityReferenceCollection[] SharedVariablesTyped => throw new NotSupportedException();
    public EntityReference OwningExtension => throw new NotSupportedException();
    public IPluginExecutionContext ParentContext => Parent!;
    public Guid? RequestId => throw new NotSupportedException();
    public bool IsExecutingOffline => throw new NotSupportedException();
    public bool IsOfflinePlayback => throw new NotSupportedException();
    public bool IsInTransaction => throw new NotSupportedException();
    public Guid OperationId => throw new NotSupportedException();
    public DateTime OperationCreatedOn => throw new NotSupportedException();
}
