using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace CommercialLendingLOS.Plugins
{
    /// <summary>
    /// Blocks a mailbox automation identity from creating LOS tasks through any
    /// path except the registered email-intake Custom API transaction.
    /// Normal human task creation is unaffected.
    /// </summary>
    public sealed class EmailAutomationDirectTaskWriteGuardPlugin : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            if (context == null || context.Stage != 20 || context.Mode != 0 ||
                !string.Equals(context.MessageName, "Create", StringComparison.OrdinalIgnoreCase) ||
                !(string.Equals(context.PrimaryEntityName, "cr664_dealtask1", StringComparison.OrdinalIgnoreCase) ||
                  string.Equals(context.PrimaryEntityName, "cr664_emailservicerequestintake", StringComparison.OrdinalIgnoreCase)))
                throw new InvalidPluginExecutionException("EMAIL_WRITE_GUARD_REGISTRATION_INVALID: The direct-write guard is registered incorrectly.");
            if (context.InitiatingUserId == Guid.Empty)
                throw new InvalidPluginExecutionException("EMAIL_TASK_GUARD_ACTOR_UNRESOLVED: The authenticated actor is unavailable.");

            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var service = factory.CreateOrganizationService(context.InitiatingUserId);
            var query = new QueryExpression("cr664_emailautomationpermission") { ColumnSet = new ColumnSet("statecode", "cr664_effectivefrom", "cr664_effectivethrough") };
            query.Criteria.AddCondition("cr664_serviceactor", ConditionOperator.Equal, context.InitiatingUserId);
            var now = DateTime.UtcNow;
            var permission = service.RetrieveMultiple(query).Entities.Any(row =>
            {
                if (row.Contains("statecode") && row.GetAttributeValue<OptionSetValue>("statecode")?.Value != 0) return false;
                var from = row.GetAttributeValue<DateTime?>("cr664_effectivefrom");
                var through = row.GetAttributeValue<DateTime?>("cr664_effectivethrough");
                return (!from.HasValue || from <= now) && (!through.HasValue || through >= now);
            });
            if (!permission) return;

            var parent = context.ParentContext;
            if (parent == null || !string.Equals(parent.MessageName, EmailServiceRequestIntakePlugin.MessageName, StringComparison.OrdinalIgnoreCase))
                throw new InvalidPluginExecutionException("EMAIL_AUTOMATION_DIRECT_WRITE_BLOCKED: Mailbox automation identities must create intake and task records through the governed service-request Custom API.");
        }
    }
}
