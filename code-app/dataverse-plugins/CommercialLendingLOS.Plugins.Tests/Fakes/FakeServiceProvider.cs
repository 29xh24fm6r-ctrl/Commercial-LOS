using System;
using Microsoft.Xrm.Sdk;

namespace CommercialLendingLOS.Plugins.Tests.Fakes;

public sealed class FakeTracingService : ITracingService
{
    public System.Collections.Generic.List<string> Lines { get; } = new();
    public void Trace(string format, params object[] args) => Lines.Add(string.Format(format, args));
}

public sealed class FakeOrganizationServiceFactory : IOrganizationServiceFactory
{
    private readonly IOrganizationService _service;
    public FakeOrganizationServiceFactory(IOrganizationService service) => _service = service;
    public IOrganizationService CreateOrganizationService(Guid? userId) => _service;
}

/// <summary>
/// Wires <see cref="IPluginExecutionContext"/>, <see cref="ITracingService"/>, and
/// <see cref="IOrganizationServiceFactory"/> the same way the real Dataverse plugin host does —
/// resolved by requested type via GetService(Type).
/// </summary>
public sealed class FakeServiceProvider : IServiceProvider
{
    public FakePluginExecutionContext Context { get; } = new();
    public FakeTracingService Tracing { get; } = new();
    public FakeOrganizationService OrganizationService { get; } = new();
    public FakeOrganizationServiceFactory Factory { get; }

    public FakeServiceProvider()
    {
        Factory = new FakeOrganizationServiceFactory(OrganizationService);
    }

    public object? GetService(Type serviceType)
    {
        if (serviceType == typeof(IPluginExecutionContext)) return Context;
        if (serviceType == typeof(ITracingService)) return Tracing;
        if (serviceType == typeof(IOrganizationServiceFactory)) return Factory;
        throw new NotSupportedException($"FakeServiceProvider: no fake registered for {serviceType}.");
    }
}
