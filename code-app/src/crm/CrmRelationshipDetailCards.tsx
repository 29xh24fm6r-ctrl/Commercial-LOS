import { type CSSProperties, type ReactNode } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, spacing, typography, type SeverityKey } from '../shared/theme';
import type { CrmRelationshipViewModel } from './crmRelationshipViewModel';
import type {
  CrmRelationshipDetailReadiness,
  CrmDetailSectionKey,
} from './crmRelationshipDetailReadiness';

/**
 * Phase 189F — read-only CRM detail cards, gated by Phase 189E readiness.
 *
 * Presentational only. Renders record-detail content ONLY for sections the
 * readiness audit marked safe (real ids + verified real-lookup classification).
 * Blocked sections render compact explanatory copy — never a fake placeholder
 * record. No Dataverse IO, no service/client/fetch, no write affordances, no
 * fabricated Salesforce-style spine.
 */

interface Props {
  viewModel: CrmRelationshipViewModel;
  readiness: CrmRelationshipDetailReadiness;
}

// Stable render order for the detail sections.
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

export function CrmRelationshipDetailCards({ viewModel, readiness }: Props) {
  const vm = viewModel;
  const safe = (s: CrmDetailSectionKey) => readiness.safeDetailSections.includes(s);
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

      <div
        data-testid="crm-relationship-detail-cards"
        data-readiness-status={readiness.readinessStatus}
      >
        {SECTION_ORDER.map((section) => (
          <section
            key={section}
            style={sectionStyle}
            aria-label={SECTION_LABEL[section]}
            data-section={section}
            data-section-state={safe(section) ? 'safe' : 'blocked'}
          >
            <div style={sectionHeadStyle}>
              <span style={labelStyle}>{SECTION_LABEL[section]}</span>
              {safe(section) ? (
                <Badge variant="clear" appearance="outline">
                  safe
                </Badge>
              ) : (
                <Badge
                  variant={section === 'salesforceSpine' ? 'neutral' : 'atRisk'}
                  appearance="outline"
                >
                  {section === 'salesforceSpine' ? 'not seeded' : 'blocked'}
                </Badge>
              )}
            </div>
            {safe(section) ? (
              <SafeSection section={section} vm={vm} readiness={readiness} />
            ) : (
              <div style={blockedStyle} data-section-reason>
                {reasonFor(section)}
              </div>
            )}
          </section>
        ))}

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
        <span>
          Read-only detail — no Dataverse write, no schema change, no external contact. Blocked
          sections show only the readiness reason; no records are fabricated.
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
          <Field label="Name" value={vm.canonicalClient.name ?? '(unnamed)'} />
          <Field label="Record id" value={vm.canonicalClient.id} mono />
          <Field label="Type" value="borrower/client stub (cr664_clientrelationship)" />
          {vm.canonicalClient.borrowerType && (
            <Field label="Borrower type" value={vm.canonicalClient.borrowerType} />
          )}
          <ClassificationChip value="real-lookup" />
        </div>
      ) : null;

    case 'teamOwnership':
      return vm.team ? (
        <div style={detailStyle}>
          <Field label="Name" value={vm.team.name ?? `team ${vm.team.id}`} />
          <Field label="Record id" value={vm.team.id} mono />
          <ClassificationChip value="real-lookup" />
        </div>
      ) : null;

    case 'assignedBanker':
      return vm.assignedBanker ? (
        <div style={detailStyle}>
          <Field label="Name" value={vm.assignedBanker.name ?? `banker ${vm.assignedBanker.id}`} />
          <Field label="Record id" value={vm.assignedBanker.id} mono />
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
              '(workspace)'
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
