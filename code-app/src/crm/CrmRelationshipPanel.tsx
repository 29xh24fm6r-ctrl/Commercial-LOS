import { type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, spacing, typography, type SeverityKey } from '../shared/theme';
import { useDealData } from '../deals/DealDataProvider';
import { useOptionalBanker } from '../banker/BankerContext';
import { buildCrmRelationshipInput } from './buildCrmRelationshipInput';
import {
  deriveCrmRelationshipViewModel,
  type CrmRelationshipViewModel,
  type CrmRelationshipStatus,
} from './crmRelationshipViewModel';
import { deriveCrmRelationshipDetailReadiness } from './crmRelationshipDetailReadiness';
import { CrmRelationshipDetailCards } from './CrmRelationshipDetailCards';

/**
 * Phase 189C — read-only CRM Relationship panel.
 *
 * Renders the Phase 189B `deriveCrmRelationshipViewModel` projection of the
 * live relationship graph around the current deal. READ-ONLY: no Dataverse
 * writes, no schema change, no external contact, no live persistence flip, and
 * no fabricated Salesforce-style spine. The future spine is shown honestly as
 * not seeded / not wired.
 *
 * Two exports:
 *   - `CrmRelationshipPanel` — pure presentational; takes a derived view-model.
 *   - `DealCrmRelationshipPanel` — connected container that builds the input
 *     from the already-authorized deal/workspace context and renders the panel.
 */

const STATUS_VARIANT: Record<CrmRelationshipStatus, SeverityKey> = {
  ready: 'clear',
  partial: 'atRisk',
  blocked: 'blocked',
};

const SEVERITY_VARIANT: Record<string, SeverityKey> = {
  blocking: 'blocked',
  degraded: 'atRisk',
  informational: 'info',
};

export function CrmRelationshipPanel({
  viewModel,
}: {
  viewModel: CrmRelationshipViewModel;
}) {
  const vm = viewModel;
  return (
    <Card>
      <CardHeader
        title={vm.title}
        subtitle={vm.subtitle}
        trailing={
          <Badge variant={STATUS_VARIANT[vm.relationshipStatus]} aria-label={`Relationship status: ${vm.relationshipStatus}`}>
            {vm.relationshipStatus}
          </Badge>
        }
      />

      <div
        data-testid="crm-relationship-panel"
        data-relationship-status={vm.relationshipStatus}
      >
        <div style={bannerStyle}>{vm.safetyCopy}</div>

        {/* Canonical client (borrower/client stub) */}
        <section style={sectionStyle} aria-label="Canonical client">
          <div style={labelStyle}>Client</div>
          {vm.canonicalClient ? (
            <>
              <div style={valueStyle}>
                {vm.canonicalClient.name ?? '(unnamed client)'}{' '}
                <span style={stubChipStyle}>borrower/client stub</span>
              </div>
              <div style={noteStyle}>{vm.canonicalClient.note}</div>
            </>
          ) : (
            <div style={emptyStyle}>No canonical client linked to this deal.</div>
          )}
        </section>

        {/* Team + assigned banker */}
        <section style={sectionStyle} aria-label="Owning team and banker">
          <div style={labelStyle}>Owning team</div>
          <div style={vm.team ? valueStyle : emptyStyle}>
            {vm.team ? vm.team.name ?? `team ${vm.team.id}` : 'Not linked in this view.'}
          </div>
          <div style={labelStyle}>Assigned banker</div>
          <div style={vm.assignedBanker ? valueStyle : emptyStyle}>
            {vm.assignedBanker
              ? `${vm.assignedBanker.name ?? `banker ${vm.assignedBanker.id}`}` +
                (vm.assignedBanker.teamMatchesDeal === null
                  ? ''
                  : vm.assignedBanker.teamMatchesDeal
                    ? ' (team matches deal)'
                    : ' (team does NOT match deal)')
              : 'Not linked in this view.'}
          </div>
        </section>

        {/* Optional platform-user context */}
        {vm.platformUserContext && (
          <section style={sectionStyle} aria-label="Platform user context">
            <div style={labelStyle}>Workspace context</div>
            <div style={valueStyle}>
              {vm.platformUserContext.primaryWorkspaceName ??
                vm.platformUserContext.primaryWorkspaceId ??
                'workspace'}
            </div>
          </section>
        )}

        {/* Pseudo-lookup warnings */}
        {vm.unsafePseudoLookupWarnings.length > 0 && (
          <section style={sectionStyle} aria-label="Unsafe pseudo-lookup warnings">
            <div style={labelStyle}>Unsafe pseudo lookups</div>
            <ul style={listStyle}>
              {vm.unsafePseudoLookupWarnings.map((w, i) => (
                <li key={i} style={rowStyle}>
                  <Badge variant="blocked">{w.edge}</Badge>
                  <span style={itemStyle} title={w.detail}>
                    {w.logicalColumn}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Edges still to wire */}
        {vm.missingRelationshipEdges.length > 0 && (
          <section style={sectionStyle} aria-label="Relationship edges to wire">
            <div style={labelStyle}>Edges not linked in this view</div>
            <ul style={listStyle}>
              {vm.missingRelationshipEdges.map((m, i) => (
                <li key={i} style={rowStyle}>
                  <Badge variant={SEVERITY_VARIANT[m.severity] ?? 'neutral'}>{m.severity}</Badge>
                  <span style={itemStyle}>
                    {m.edge} → {m.target}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Recommended next actions */}
        <section style={sectionStyle} aria-label="Recommended next actions">
          <div style={labelStyle}>Recommended next steps</div>
          <ol style={olStyle}>
            {vm.recommendedNextActions.map((a, i) => (
              <li key={i} style={actionRowStyle} data-action-kind={a.kind}>
                {a.action}
              </li>
            ))}
          </ol>
        </section>

        {/* Future Salesforce-style spine — honest */}
        <section style={sectionStyle} aria-label="Future Salesforce-style spine">
          <div style={labelStyle}>
            Future Salesforce-style spine{' '}
            <span style={stubChipStyle}>not seeded · not wired</span>
          </div>
          <div style={noteStyle}>{vm.futureSpine.note}</div>
        </section>
      </div>

      <CardFooter>
        <span>
          Read-only relationship projection — no Dataverse write, no schema change, no external
          contact. Live CRM persistence is disabled.
        </span>
      </CardFooter>
    </Card>
  );
}

/**
 * Connected container. Reads the already-authorized deal + banker context,
 * builds the view-model input, derives the view-model, and renders the panel.
 * Performs NO IO of its own — both `useDealData` and `useOptionalBanker` expose
 * data the workspace already loaded under existing authorization.
 */
export function DealCrmRelationshipPanel() {
  const { deal } = useDealData();
  const banker = useOptionalBanker();

  // Phase 189D — the already-authorized deal row carries real lookup ids +
  // classifications (no second Dataverse GET). A real client GUID wins; the
  // builder still falls back to a `name:` surrogate when only a label exists.
  // Build the graph input ONCE, then derive BOTH the view-model (189B) and the
  // detail readiness gate (189E) from the same input.
  const input = buildCrmRelationshipInput({
    deal: { id: deal.id, name: deal.name },
    clientId: deal.clientId ?? null,
    clientName: deal.clientName ?? null,
    clientLookupClassification: deal.clientLookupClassification,
    team: deal.teamId
      ? {
          id: deal.teamId,
          name: deal.teamName ?? null,
          lookupClassification: deal.teamLookupClassification,
        }
      : null,
    // Prefer the deal's real cr664_AssignedBanker lookup id when present;
    // otherwise fall back to the current banker context (the deal was
    // authorized to them, so they ARE the assigned banker).
    assignedBanker: deal.assignedBankerId
      ? {
          id: deal.assignedBankerId,
          name: deal.bankerName ?? null,
          email: banker?.email ?? null,
          lookupClassification: deal.assignedBankerLookupClassification,
        }
      : banker
        ? { id: banker.bankerId, name: banker.fullName, email: banker.email }
        : null,
  });

  const viewModel = deriveCrmRelationshipViewModel(input);
  // Phase 189F — gate the read-only detail cards on the 189E readiness audit.
  const readiness = deriveCrmRelationshipDetailReadiness(input);

  return (
    <>
      <CrmRelationshipPanel viewModel={viewModel} />
      <CrmRelationshipDetailCards viewModel={viewModel} readiness={readiness} />
    </>
  );
}

const bannerStyle: CSSProperties = {
  fontSize: typography.size.sm,
  color: palette.textMuted,
  background: palette.panelBg,
  padding: spacing.sm,
  borderRadius: 4,
  marginBottom: spacing.sm,
};
const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  paddingTop: spacing.sm,
  borderTop: `1px solid ${palette.divider}`,
};
const labelStyle: CSSProperties = {
  fontSize: typography.size.xs,
  textTransform: 'uppercase',
  letterSpacing: typography.letterSpacing.label,
  color: palette.textSubtle,
  fontWeight: typography.weight.semibold,
};
const valueStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const noteStyle: CSSProperties = {
  fontSize: typography.size.xs,
  color: palette.textSubtle,
  fontStyle: 'italic',
};
const emptyStyle: CSSProperties = {
  fontSize: typography.size.sm,
  color: palette.textSubtle,
  fontStyle: 'italic',
};
const stubChipStyle: CSSProperties = {
  fontSize: typography.size.xs,
  color: palette.textSubtle,
  fontStyle: 'italic',
};
const listStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: spacing.xs,
};
const olStyle: CSSProperties = {
  margin: 0,
  paddingLeft: spacing.lg,
  display: 'flex',
  flexDirection: 'column',
  gap: spacing.xs,
};
const rowStyle: CSSProperties = { display: 'flex', gap: spacing.sm, alignItems: 'center' };
const itemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const actionRowStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
