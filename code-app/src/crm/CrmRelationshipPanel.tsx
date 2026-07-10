import { type CSSProperties, type ReactNode, useState } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography, type SeverityKey } from '../shared/theme';
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
import { LinkDealCrmEntityModal } from './LinkDealCrmEntityModal';
import { loadClientLinkTargetOptions, loadTeamOptions, type CrmLinkOption } from './dealCrmLinkOptions';
import {
  linkDealCrmEntity,
  buildLiveLinkDealCrmEntityDeps,
  type DealCrmLinkTarget,
  type LinkDealCrmEntityOutcome,
} from './write/linkDealCrmEntity';
import {
  bridgeOrgToClientRelationship,
  bridgedClientRelationshipId,
  buildLiveBridgeOrgToClientDeps,
  type BridgeOrgToClientOutcome,
} from './write/bridgeOrgToClientRelationship';
import { loadLiveDealIndustryProjection } from './dealIndustryProjection';
import { hydrateDealIndustryFromCrm } from '../deals/hydrateDealIndustryFromCrm';
import type { DealIndustryHydration } from '../deals/dealIndustryHydration';
import { updateDealProfile } from '../deals/write/updateDealProfile';
import { buildLiveUpdateDealProfileDeps } from '../deals/write/buildLiveUpdateDealProfileDeps';
import type { DealDetail } from '../deals/dealQueries';

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
  clientAction,
  teamAction,
  industryStatus,
}: {
  viewModel: CrmRelationshipViewModel;
  /** Optional interactive affordance rendered in the Client section (e.g. the
   *  "Link CRM client" button when no canonical client is linked). */
  clientAction?: ReactNode;
  /** Optional interactive affordance rendered in the Owning-team section. */
  teamAction?: ReactNode;
  /** Optional CRM/NAICS-derived Industry status + remediation, rendered in the
   *  Client section (the deal Industry is derived from the linked client). */
  industryStatus?: ReactNode;
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
          {clientAction}
          {industryStatus}
        </section>

        {/* Team + assigned banker */}
        <section style={sectionStyle} aria-label="Owning team and banker">
          <div style={labelStyle}>Owning team</div>
          <div style={vm.team ? valueStyle : emptyStyle}>
            {vm.team ? vm.team.name ?? `team ${vm.team.id}` : 'Not linked in this view.'}
          </div>
          {!vm.team && teamAction}
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
            <span style={stubChipStyle}>optional · not seeded · not wired</span>
          </div>
          <div style={noteStyle}>{vm.futureSpine.note}</div>
          <div style={noteStyle}>
            Optional — the spine is not required to view canonical client detail and is not what
            blocks this panel.
          </div>
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
/**
 * Map a governed-bridge FAILURE (no usable client id) onto the link modal's
 * outcome union so the modal reports it with the same honest copy it uses for a
 * direct link failure. Only called when `bridgedClientRelationshipId` is null.
 */
function mapBridgeFailureToLinkOutcome(
  bridge: BridgeOrgToClientOutcome,
): LinkDealCrmEntityOutcome {
  switch (bridge.kind) {
    case 'unauthorized':
      return { kind: 'unauthorized', reason: bridge.reason };
    case 'identity-unresolved':
      return { kind: 'identity-unresolved', reason: bridge.reason };
    case 'not-eligible':
    case 'invalid-input':
      return { kind: 'invalid-input', reason: bridge.reason };
    case 'readback-mismatch':
      return { kind: 'readback-mismatch', correlationId: bridge.correlationId };
    case 'write-failed':
      return { kind: 'write-failed', error: bridge.error, correlationId: bridge.correlationId };
    default:
      // created / linked-existing / audit-failed all yield a usable id, so they
      // never reach here; fail closed if the union ever changes.
      return {
        kind: 'write-failed',
        error: 'Unexpected bridge outcome; nothing was linked.',
        correlationId: 'n/a',
      };
  }
}

export function DealCrmRelationshipPanel() {
  const { deal, applyVerifiedDealPatch } = useDealData();
  const banker = useOptionalBanker();

  // Which link modal (if any) is open.
  const [modal, setModal] = useState<DealCrmLinkTarget | null>(null);
  // Governed CRM/NAICS → deal Industry hydration for the Intake "Industry" exit
  // criterion. Set after a client link or a banker re-check; drives the honest
  // source line + a direct remediation. Never fabricated — a missing hop is an
  // honest unresolved state and the banker can still enter Industry manually.
  const [industryHydration, setIndustryHydration] = useState<DealIndustryHydration | null>(null);
  const [industryBusy, setIndustryBusy] = useState(false);
  // Optimistic, readback-verified links made in this session. A successful
  // `linkDealCrmEntity` reads the deal back and proves it now points at the
  // selected record, so reflecting that here is truthful — not fabricated.
  // (DealDataProvider.refresh does not reload the deal record itself, so we
  // hold the confirmed link locally until the next full workspace load.)
  const [linkedClient, setLinkedClient] = useState<{ id: string; name: string } | null>(null);
  const [linkedTeam, setLinkedTeam] = useState<{ id: string; name: string } | null>(null);

  // A banker can perform the governed write only with a resolved Dataverse
  // identity and no write-disabled reason (mirrors every other governed
  // write surface). Manager read-only mode has no banker → no write.
  const authorized = !!banker && !!banker.systemUserId && !banker.writeDisabledReason;
  const writeBlockedReason =
    banker?.writeDisabledReason ??
    'No Dataverse identity is available for your sign-in, so CRM links are read-only.';

  const effectiveClientId = linkedClient?.id ?? deal.clientId ?? null;
  const effectiveClientName = linkedClient?.name ?? deal.clientName ?? null;
  const effectiveClientClassification = linkedClient
    ? 'real-lookup'
    : deal.clientLookupClassification;
  const effectiveTeamId = linkedTeam?.id ?? deal.teamId ?? null;
  const effectiveTeamName = linkedTeam?.name ?? deal.teamName ?? null;
  const effectiveTeamClassification = linkedTeam ? 'real-lookup' : deal.teamLookupClassification;

  // Phase 189D — the already-authorized deal row carries real lookup ids +
  // classifications (no second Dataverse GET). A real client GUID wins; the
  // builder still falls back to a `name:` surrogate when only a label exists.
  // Build the graph input ONCE, then derive BOTH the view-model (189B) and the
  // detail readiness gate (189E) from the same input.
  const input = buildCrmRelationshipInput({
    deal: { id: deal.id, name: deal.name },
    clientId: effectiveClientId,
    clientName: effectiveClientName,
    clientLookupClassification: effectiveClientClassification,
    team: effectiveTeamId
      ? {
          id: effectiveTeamId,
          name: effectiveTeamName,
          lookupClassification: effectiveTeamClassification,
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

  async function handleLink(
    target: DealCrmLinkTarget,
    option: CrmLinkOption,
  ): Promise<LinkDealCrmEntityOutcome> {
    let entityId = option.id;
    let entityName = option.name;

    // A CRM Hub company (cr664_crmorganization) is not itself deal-linkable —
    // the deal's cr664_Client targets cr664_clientrelationship. Run the governed
    // bridge to create/find the canonical client, then link the deal to THAT.
    if (target === 'client' && option.sourceKind === 'organization') {
      const bridge = await bridgeOrgToClientRelationship(
        {
          organizationId: option.id,
          organizationName: option.name,
          organizationType: option.organizationType ?? '',
          website: option.website,
          taxIdPresent: option.taxIdPresent,
          actorEmail: banker?.email,
          actorSystemUserId: banker?.systemUserId,
          authorized,
        },
        buildLiveBridgeOrgToClientDeps(),
      );
      const bridgedId = bridgedClientRelationshipId(bridge);
      if (!bridgedId) return mapBridgeFailureToLinkOutcome(bridge);
      entityId = bridgedId;
      if (bridge.kind === 'created' || bridge.kind === 'linked-existing') {
        entityName = bridge.clientName;
      }
    }

    return linkDealCrmEntity(
      {
        dealId: deal.id,
        target,
        entityId,
        entityName,
        actorEmail: banker?.email,
        actorSystemUserId: banker?.systemUserId,
        authorized,
      },
      buildLiveLinkDealCrmEntityDeps(),
    );
  }

  // Governed apply of a CRM-derived deal Industry — reuses the existing
  // updateDealProfile adapter (validate → write → readback → audit). Writes ONLY
  // with a resolved Dataverse identity and returns the readback-verified patch so
  // the cockpit reflects the persisted value. It NEVER overwrites a manual
  // Industry — the pure decision only asks it to write when there is no manual
  // value (see deriveDealIndustryHydration).
  async function applyDealIndustry(
    industry: string,
  ): Promise<{ ok: boolean; verified?: Record<string, unknown> }> {
    if (!banker?.systemUserId) return { ok: false };
    const outcome = await updateDealProfile(
      {
        dealId: deal.id,
        actorEmail: banker.email,
        actorSystemUserId: banker.systemUserId,
        authorized: true,
        patch: { industry },
      },
      buildLiveUpdateDealProfileDeps(),
    );
    return outcome.kind === 'updated'
      ? { ok: true, verified: outcome.verified as Record<string, unknown> }
      : { ok: false };
  }

  // After a CRM client is linked OR the banker re-checks (e.g. having just fixed
  // NAICS in the CRM company record): derive the governed CRM/NAICS Industry,
  // auto-apply it when the deal has no manual value, and refresh the cockpit
  // (header / summary tiles / Intake blocker model / stage map) with the verified
  // patch — no full reload. Fail-closed: any missing hop is an honest unresolved
  // state, and nothing is written unless a valid NAICS actually derives.
  async function refreshDealIndustryFromCrm(clientRelationshipId: string | undefined) {
    setIndustryBusy(true);
    try {
      const { hydration, appliedPatch } = await hydrateDealIndustryFromCrm(
        clientRelationshipId,
        deal.industry ?? undefined,
        { loadProjection: loadLiveDealIndustryProjection, applyDealIndustry },
      );
      if (appliedPatch) applyVerifiedDealPatch?.(appliedPatch as Partial<DealDetail>);
      setIndustryHydration(hydration);
    } finally {
      setIndustryBusy(false);
    }
  }

  const clientMissing = viewModel.canonicalClient === null;
  const teamMissing = viewModel.team === null;

  // Deal Industry is derived from the linked CRM client's NAICS. Once a client is
  // linked (and the banker can write), expose an on-demand, no-reload check that
  // surfaces the governed CRM-derived Industry, auto-applies it when a valid NAICS
  // classifies the company, and — when unresolved — points at the CRM NAICS editor.
  const clientLinked = effectiveClientId !== null;
  const industryStatus =
    clientLinked && authorized ? (
      <div style={industryStatusStyle} data-crm-industry>
        {industryHydration && (
          <>
            <div style={labelStyle}>Industry (Intake criterion)</div>
            <div
              style={valueStyle}
              data-crm-industry-status={
                industryHydration.criterionSatisfied ? 'satisfied' : 'unresolved'
              }
              data-crm-industry-source={industryHydration.source}
            >
              {industryHydration.status}
            </div>
            {industryHydration.remediation?.kind === 'edit-crm-naics' && (
              <div style={noteStyle} data-crm-industry-remediation="edit-crm-naics">
                Fix the NAICS code on the linked CRM company in its governed CRM editor, then
                re-check. The deal Industry is derived from NAICS — a manual Industry is never
                overwritten.
              </div>
            )}
          </>
        )}
        <button
          type="button"
          onClick={() => void refreshDealIndustryFromCrm(effectiveClientId)}
          disabled={industryBusy}
          style={linkButtonStyle}
          data-crm-industry-recheck
          aria-label="Check the CRM-derived Industry for this deal"
        >
          {industryBusy
            ? 'Checking…'
            : industryHydration
              ? 'Re-check CRM industry'
              : 'Check CRM industry'}
        </button>
      </div>
    ) : undefined;

  const clientAction = clientMissing ? (
    authorized ? (
      <button
        type="button"
        onClick={() => setModal('client')}
        style={linkButtonStyle}
        data-crm-link-action="client"
        aria-label="Link a canonical CRM client to this deal"
      >
        Link CRM client
      </button>
    ) : (
      <div style={readOnlyNoteStyle} data-crm-link-readonly="client">
        {writeBlockedReason}
      </div>
    )
  ) : undefined;

  const teamAction = teamMissing ? (
    authorized ? (
      <button
        type="button"
        onClick={() => setModal('team')}
        style={linkButtonStyle}
        data-crm-link-action="team"
        aria-label="Assign the owning team for this deal"
      >
        Assign owning team
      </button>
    ) : (
      <div style={readOnlyNoteStyle} data-crm-link-readonly="team">
        {writeBlockedReason}
      </div>
    )
  ) : undefined;

  return (
    <>
      <CrmRelationshipPanel
        viewModel={viewModel}
        clientAction={clientAction}
        teamAction={teamAction}
        industryStatus={industryStatus}
      />
      <CrmRelationshipDetailCards viewModel={viewModel} readiness={readiness} />
      {modal === 'client' && (
        <LinkDealCrmEntityModal
          targetKind="client"
          dealName={deal.name}
          loadOptions={loadClientLinkTargetOptions}
          onLink={(option) => handleLink('client', option)}
          onLinked={(option, outcome) => {
            // Reflect the REAL client the deal now points at. For a bridged CRM
            // company that is the created/found cr664_clientrelationship (its id
            // from the readback-verified link outcome), never the org id.
            const linked = outcome.kind === 'success' || outcome.kind === 'audit-failed';
            const entityId = linked ? outcome.entityId : option.id;
            const entityName =
              (outcome.kind === 'success' ? outcome.entityName : option.name) ?? option.name;
            setLinkedClient({ id: entityId, name: entityName });
            if (linked) {
              // CORE FIX: the deal now points at this client — refresh the WHOLE
              // cockpit (header, summary tiles, Intake blocker model, stage map),
              // not just this panel's local state, using the readback-verified id.
              applyVerifiedDealPatch?.({
                clientId: entityId,
                clientName: entityName,
              } as Partial<DealDetail>);
              // Auto-hydrate the governed Industry from the linked company's NAICS
              // so the banker need not re-enter it when CRM already classifies it.
              void refreshDealIndustryFromCrm(entityId);
            }
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'team' && (
        <LinkDealCrmEntityModal
          targetKind="team"
          dealName={deal.name}
          loadOptions={loadTeamOptions}
          onLink={(option) => handleLink('team', option)}
          onLinked={(option) => setLinkedTeam({ id: option.id, name: option.name })}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

const linkButtonStyle: CSSProperties = {
  marginTop: spacing.xs,
  alignSelf: 'flex-start',
  background: palette.primary,
  color: palette.textInverse,
  border: 'none',
  borderRadius: radius.sm,
  padding: `${spacing.xxs} ${spacing.sm}`,
  fontSize: typography.size.sm,
  fontWeight: typography.weight.semibold,
  cursor: 'pointer',
  fontFamily: typography.family,
};

const readOnlyNoteStyle: CSSProperties = {
  marginTop: spacing.xs,
  fontSize: typography.size.xs,
  color: palette.textSubtle,
  fontStyle: 'italic',
};

const industryStatusStyle: CSSProperties = {
  marginTop: spacing.xs,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  alignItems: 'flex-start',
};

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
