using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;

namespace CommercialLendingLOS.Plugins.Tests.Fakes;

/// <summary>
/// A minimal, hand-rolled in-memory <see cref="IOrganizationService"/> covering exactly the
/// operations <see cref="LoanDealGovernedTransitionPlugin"/> actually issues: Retrieve by id,
/// RetrieveMultiple over a small subset of QueryExpression shapes (single-condition equality
/// filters, the platform-user email-OR-normalizedemail filter, and the next-stage-by-sequence
/// greater-than/order/top-1 query), and Create (captured for assertion). Every other member
/// throws NotSupportedException so a test silently relying on unimplemented behavior fails loudly
/// instead of returning a fabricated result.
/// </summary>
public sealed class FakeOrganizationService : IOrganizationService
{
    private readonly Dictionary<string, Dictionary<Guid, Entity>> _store = new();
    public List<Entity> Created { get; } = new();

    public void Seed(Entity entity)
    {
        if (entity.Id == Guid.Empty) entity.Id = Guid.NewGuid();
        if (!_store.TryGetValue(entity.LogicalName, out var table))
        {
            table = new Dictionary<Guid, Entity>();
            _store[entity.LogicalName] = table;
        }
        table[entity.Id] = entity;
    }

    public Guid Create(Entity entity)
    {
        Created.Add(entity);
        if (entity.Id == Guid.Empty) entity.Id = Guid.NewGuid();
        Seed(entity);
        return entity.Id;
    }

    public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet)
    {
        if (_store.TryGetValue(entityName, out var table) && table.TryGetValue(id, out var found))
        {
            return found;
        }
        throw new InvalidOperationException($"FakeOrganizationService: no seeded '{entityName}' row with id {id}.");
    }

    public EntityCollection RetrieveMultiple(QueryExpression query)
    {
        if (!_store.TryGetValue(query.EntityName, out var table))
        {
            return new EntityCollection(new List<Entity>());
        }
        IEnumerable<Entity> rows = table.Values;
        if (query.Criteria != null)
        {
            rows = rows.Where(e => MatchesFilter(e, query.Criteria));
        }
        if (query.Orders.Count > 0)
        {
            var order = query.Orders[0];
            rows = order.OrderType == OrderType.Ascending
                ? rows.OrderBy(e => e.GetAttributeValue<int>(order.AttributeName))
                : rows.OrderByDescending(e => e.GetAttributeValue<int>(order.AttributeName));
        }
        var list = rows.ToList();
        if (query.TopCount.HasValue) list = list.Take(query.TopCount.Value).ToList();
        return new EntityCollection(list);
    }

    private static bool MatchesFilter(Entity entity, FilterExpression filter)
    {
        var results = filter.Conditions.Select(c => MatchesCondition(entity, c)).ToList();
        results.AddRange(filter.Filters.Select(f => MatchesFilter(entity, f)));
        if (results.Count == 0) return true;
        return filter.FilterOperator == LogicalOperator.Or ? results.Any(r => r) : results.All(r => r);
    }

    private static bool MatchesCondition(Entity entity, ConditionExpression condition)
    {
        var value = entity.Contains(condition.AttributeName) ? entity[condition.AttributeName] : null;
        var expected = condition.Values.Count > 0 ? condition.Values[0] : null;
        switch (condition.Operator)
        {
            case ConditionOperator.Equal:
                return ValuesEqual(value, expected);
            case ConditionOperator.GreaterThan:
                return value is int iv && expected is int ev && iv > ev;
            default:
                throw new NotSupportedException($"FakeOrganizationService: unsupported operator {condition.Operator}.");
        }
    }

    private static bool ValuesEqual(object? actual, object? expected)
    {
        if (actual is bool ab && expected is bool eb) return ab == eb;
        if (actual is string astr && expected is string estr) return string.Equals(astr, estr, StringComparison.Ordinal);
        if (actual is Guid ag && expected is Guid eg) return ag == eg;
        if (actual is EntityReference ar && expected is Guid er) return ar.Id == er;
        if (actual is OptionSetValue aos && expected is int eos) return aos.Value == eos;
        return Equals(actual, expected);
    }

    public void Update(Entity entity) => throw new NotSupportedException();
    public void Delete(string entityName, Guid id) => throw new NotSupportedException();
    public OrganizationResponse Execute(OrganizationRequest request) => throw new NotSupportedException();
    public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
    public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
    public EntityCollection RetrieveMultiple(Microsoft.Xrm.Sdk.Query.QueryBase query) =>
        query is QueryExpression qe ? RetrieveMultiple(qe) : throw new NotSupportedException();
}
