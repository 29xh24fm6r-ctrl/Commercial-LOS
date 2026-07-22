import { type CSSProperties, type ReactNode } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, spacing, typography, type SeverityKey } from '../shared/theme';
import { CRM_NAME_REF_PREFIX } from './buildCrmRelationshipInput';
import type { CrmRelationshipViewModel } from './crmRelationshipViewModel';
import type {
  CrmRelationshipDetailReadiness,
  CrmDetailSectionKey,
  CrmDetailSectionState,
} from './crmRelationshipDetailReadiness';

/**
 * Phase 189F/G — read-only CRM detail cards, gated by Phase 189E readiness.
 *
 * Presentational only (banker workspace). Renders record-detail content ONLY
 * for sections the readiness audit marked safe (real ids + verified real-lookup
 * classification). Blocked sections render compact explanatory copy — never a
 * fake placeholder record.
 *
 * Phase 189G fit-and-finish: every visible value is explicitly traceable to its
 * provenance — the already-AUTHORIZED deal row, projected by the 189B
 * view-model, gated by the 189E readiness audit — and NO new CRM lookup is
 * performed. Source-fact chips/footer make that chain visible. `name:` surrogate
 * ids are never displayed.
 *
 * No Dataverse IO, no service/client/fetch, no write affordances, no fabricated
 * Salesforce-style spine, no manager/team/executive mount.
 */

interface Props {
  viewModel: CrmRelationshipViewModel;
  readiness: CrmRelationshipDetailReadiness;
}

// Deterministic render order (Phase 189G): client → team → banker → platform →
// integrity → spine.
const SECTION_ORDER: ReadonlyArray<CrmDetailSectionKey> = [
  'clientIdentity',
  'teamOwnership',
  'assignedBanker',
  'platformWorkspaceBridge',
  'relationshipIntegrity',
  'salesforceSpine',
];

const SECTION_LABEL: Record<CrmDetailSectionKey, string> = {
  clientIdentity: 'Client identity',
  teamOwnership: 'Team ownership',
  assignedBanker: 'Assigned banker',
  platformWorkspaceBridge: 'Platform / workspace',
  relationshipIntegrity: 'Relationship integrity',
  salesforceSpine: 'Salesforce-style spine',
};

// Per-section provenance: names the authorized deal row, the CRM relationship
// view model, and the readiness audit that gates which sections render.
const SECTION_SOURCE_FACT: Record<CrmDetailSectionKey, string> = {
  clientIdentity:
    'Source: authorized deal row (cr664_Client lookup) → the CRM relationship view, gated by the readiness audit. No new CRM lookup.',
  teamOwnership:
    'Source: authorized deal row (cr664_Team lookup) → the CRM relationship view, gated by the readiness audit. No new CRM lookup.',
  assignedBanker:
    'Source: authorized deal row (cr664_AssignedBanker lookup) → the CRM relationship view, gated by the readiness audit. No new CRM lookup.',
  platformWorkspaceBridge:
    'Source: already-authorized workspace context → the CRM relationship view, gated by the readiness audit. No new CRM lookup.',
  relationshipIntegrity:
    'Source: readiness audit facts over the authorized deal context (read-only). No new CRM lookup.',
  salesforceSpine:
    'Source: the readiness audit. The CRM relationship spine is not seeded and not wired.',
};

const PROVENANCE =
  'Every value below is derived from the already-authorized deal row via the CRM relationship view and gated by the readiness audit — no new CRM lookup is performed.';

function isSurrogateId(id: string): boolean {
  return id.startsWith(CRM_NAME_REF_PREFIX);
}

export function CrmRelationshipDetailCards({ viewModel, readiness }: Props) {
  const vm = viewModel;
  const safe = (s: CrmDetailSectionKey) => readiness.safeDetailSections.includes(s);
  // Per-section state distinguishes a true blocker (required-missing) from
  // degraded / optional / deferred so optional + deferred surfaces never read
  // as BLOCKED. `safe()` is kept as the render gate for detail content.
  const stateOf = (s: CrmDetailSectionKey): CrmDetailSectionState =>
    safe(s) ? 'safe' : readiness.sectionAssessments.find((a) => a.section === s)?.state ?? 'blocked';
  const reasonFor = (s: CrmDetailSectionKey) =>
    readiness.sectionAssessments.find((a) => a.section === s)?.reason ??
    readiness.blockedDetailSections.find((b) => b.section === s)?.reason ??
    'Not available in this view.';

  return (
    <Card>
      <CardHeader
        title="CRM Relationship Detail"
        subtitle="Read-only — detail shown only for sections proven safe by the readiness audit"
        trailing={
          <Badge
            variant={READINESS_VARIANT[readiness.readinessStatus]}
            aria-label={`Detail readiness: ${readiness.readinessStatus}`}
          >
            {readiness.readinessStatus}
          </Badge>
        }
      />

      <div data-testid="crm-relationship-detail-cards" data-readiness-status={readiness.readinessStatus}>
        <div style={provenanceStyle} data-testid="crm-detail-provenance">
          {PROVENANCE}
        </div>

        {SECTION_ORDER.map((section) => {
          const state = stateOf(section);
          const isSafe = state === 'safe';
          const badge = STATE_BADGE[state];
          return (
            <section
              key={section}
              style={sectionStyle}
              aria-label={SECTION_LABEL[section]}
              data-section={section}
              data-section-state={state}
            >
              <div style={sectionHeadStyle}>
                <span style={labelStyle}>{SECTION_LABEL[section]}</span>
                <Badge variant={badge.variant} appearance="outline">
                  {badge.label}
                </Badge>
              </div>
              {isSafe ? (
                <>
                  <SafeSection section={section} vm={vm} readiness={readiness} />
                  <div style={sourceFactStyle} data-source-fact>
                    {SECTION_SOURCE_FACT[section]}
                  </div>
                </>
              ) : (
                <div style={blockedStyle} data-section-reason>
                  {reasonFor(section)}
                </div>
              )}
            </section>
          );
        })}

        {readiness.unsafeAssumptionsRejected.length > 0 && (
          <section style={sectionStyle} aria-label="Rejected unsafe assumptions" data-section="rejected">
            <div style={labelStyle}>Not inferred (no records to derive these from)</div>
            <ul style={listStyle}>
              {readiness.unsafeAssumptionsRejected.map((a) => (
                <li key={a.assumption} style={rejectedRowStyle}>
                  <span style={rejectedChipStyle}>{a.assumption.replace(/_/g, ' ')}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <CardFooter>
        <span data-testid="crm-detail-source-footer">
          Read-only detail — every value is derived from the existing authorized deal context, not a
          new CRM lookup. No Dataverse write, no schema change, no external contact. Blocked sections
          show only the readiness reason; no records are fabricated.
        </span>
      </CardFooter>
    </Card>
  );
}

function SafeSection({
  section,
  vm,
  readiness,
}: {
  section: CrmDetailSectionKey;
  vm: CrmRelationshipViewModel;
  readiness: CrmRelationshipDetailReadiness;
}): ReactNode {
  switch (section) {
    case 'clientIdentity':
      return vm.canonicalClient ? (
        <div style={detailStyle}>
          <Field label="Name" value={vm.canonicalClient.name ?? '(no name on record)'} />
          {/* Defensive: a real-lookup id is never a surrogate, but never print
              a `name:` surrogate id even if one somehow reached here. */}
          {!isSurrogateId(vm.canonicalClient.id) && (
            <Field label="Record id" value={vm.canonicalClient.id} mono />
          )}
          <Field label="Type" value="Borrower / client record" />
          {vm.canonicalClient.borrowerType && (
            <Field label="Borrower type" value={vm.canonicalClient.borrowerType} />
          )}
          <ClassificationChip value="real-lookup" />
        </div>
      ) : null;

    case 'teamOwnership':
      return vm.team ? (
        <div style={detailStyle}>
          <Field label="Name" value={vm.team.name ?? '(no name on record)'} />
          {!isSurrogateId(vm.team.id) && <Field label="Record id" value={vm.team.id} mono />}
          <ClassificationChip value="real-lookup" />
        </div>
      ) : null;

    case 'assignedBanker':
      return vm.assignedBanker ? (
        <div style={detailStyle}>
          <Field label="Name" value={vm.assignedBanker.name ?? '(no name on record)'} />
          {!isSurrogateId(vm.assignedBanker.id) && (
            <Field label="Record id" value={vm.assignedBanker.id} mono />
          )}
          {vm.assignedBanker.email && <Field label="Email" value={vm.assignedBanker.email} />}
          {vm.assignedBanker.teamMatchesDeal !== null && (
            <Field
              label="Team match"
              value={vm.assignedBanker.teamMatchesDeal ? 'matches deal team' : 'does NOT match deal team'}
            />
          )}
          <ClassificationChip value="real-lookup" />
        </div>
      ) : null;

    case 'platformWorkspaceBridge':
      return vm.platformUserContext ? (
        <div style={detailStyle}>
          <Field
            label="Workspace"
            value={
              vm.platformUserContext.primaryWorkspaceName ??
              vm.platformUserContext.primaryWorkspaceId ??
              '(workspace on record)'
            }
          />
          {vm.platformUserContext.coreUserId && (
            <Field label="Core user" value={vm.platformUserContext.coreUserId} mono />
          )}
        </div>
      ) : null;

    case 'relationshipIntegrity':
      return (
        <div style={detailStyle}>
          <ul style={listStyle}>
            {readiness.sourceFacts.map((f, i) => (
              <li key={i} style={factStyle}>
                {f}
              </li>
            ))}
          </ul>
          {vm.unsafePseudoLookupWarnings.length > 0 && (
            <ul style={listStyle}>
              {vm.unsafePseudoLookupWarnings.map((w, i) => (
                <li key={i} style={factStyle}>
                  <Badge variant="blocked">{w.edge}</Badge> {w.logicalColumn}
                </li>
              ))}
            </ul>
          )}
        </div>
      );

    case 'salesforceSpine':
      // Never safe this phase — handled by the blocked branch — but kept
      // exhaustive so the switch covers every key.
      return <div style={blockedStyle}>{vm.futureSpine.note}</div>;

    default:
      return null;
  }
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={fieldRowStyle}>
      <span style={fieldLabelStyle}>{label}</span>
      <span style={mono ? fieldValueMonoStyle : fieldValueStyle}>{value}</span>
    </div>
  );
}

function ClassificationChip({ value }: { value: string }) {
  return (
    <div style={fieldRowStyle}>
      <span style={fieldLabelStyle}>Lookup</span>
      <Badge variant="clear" appearance="soft">
        {value}
      </Badge>
    </div>
  );
}

const READINESS_VARIANT: Record<CrmRelationshipDetailReadiness['readinessStatus'], SeverityKey> = {
  ready: 'clear',
  partial: 'atRisk',
  blocked: 'blocked',
};

// Honest per-section badges. Only a REQUIRED-missing section reads as
// "blocked"; optional / deferred surfaces get calm, explicit labels so the
// app never looks broken for expected gaps.
const STATE_BADGE: Record<CrmDetailSectionState, { variant: SeverityKey; label: string }> = {
  safe: { variant: 'clear', label: 'safe' },
  blocked: { variant: 'blocked', label: 'blocked' },
  degraded: { variant: 'atRisk', label: 'degraded' },
  optional: { variant: 'neutral', label: 'optional · not provided' },
  deferred: { variant: 'neutral', label: 'deferred · not seeded · not wired' },
};

const provenanceStyle: CSSProperties = {
  fontSize: typography.size.xs,
  color: palette.textMuted,
  background: palette.panelBg,
  padding: spacing.sm,
  borderRadius: 4,
  marginBottom: spacing.xs,
};
const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: spacing.xs,
  paddingTop: spacing.sm,
  borderTop: `1px solid ${palette.divider}`,
};
const sectionHeadStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: spacing.sm,
};
const labelStyle: CSSProperties = {
  fontSize: typography.size.xs,
  textTransform: 'uppercase',
  letterSpacing: typography.letterSpacing.label,
  color: palette.textSubtle,
  fontWeight: typography.weight.semibold,
};
const detailStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2 };
const blockedStyle: CSSProperties = {
  fontSize: typography.size.sm,
  color: palette.textSubtle,
  fontStyle: 'italic',
};
const sourceFactStyle: CSSProperties = {
  fontSize: typography.size.xs,
  color: palette.textSubtle,
  fontStyle: 'italic',
  marginTop: 2,
};
const fieldRowStyle: CSSProperties = { display: 'flex', gap: spacing.sm, alignItems: 'baseline' };
const fieldLabelStyle: CSSProperties = {
  minWidth: 92,
  fontSize: typography.size.xs,
  color: palette.textSubtle,
};
const fieldValueStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const fieldValueMonoStyle: CSSProperties = {
  fontSize: typography.size.xs,
  color: palette.textMuted,
  fontFamily: 'monospace',
};
const listStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};
const factStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textMuted };
const rejectedRowStyle: CSSProperties = { display: 'flex' };
const rejectedChipStyle: CSSProperties = {
  fontSize: typography.size.xs,
  color: palette.textSubtle,
  fontStyle: 'italic',
};
