import { type CSSProperties, type ReactNode } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type {
  AdminConfigurationPersistenceReadiness,
  AdminConfigurationPersistenceSchemaState,
} from './adminConfigurationPersistenceTypes';
import { ADMIN_CONFIG_TARGET_TABLES } from './adminConfigurationDataverseSchemaPlan';

interface Props {
  readiness: AdminConfigurationPersistenceReadiness;
  schemaState: AdminConfigurationPersistenceSchemaState;
}

/**
 * Phase 142J — Admin configuration persistence readiness panel (read-only).
 *
 * Shows the adapter mode, schema readiness, planned tables, missing
 * tables/columns/relationships, and the read/write/apply status. It is read-only:
 * there is NO enable-persistence / enable-write / enable-apply / seed-schema /
 * create-schema / save / apply / deploy / publish / activate / Dataverse-write /
 * fetch affordance. Write and apply are always disabled.
 */
export function AdminConfigurationPersistenceReadinessPanel({ readiness, schemaState }: Props) {
  return (
    <Card>
      <CardHeader title="Admin configuration persistence readiness" subtitle={`Mode: ${readiness.mode.replace(/_/g, ' ')}`} />

      <div style={bannerStyle}>
        Read-only persistence readiness — persistence is disabled by default. No schema is created or seeded, no record is saved, no configuration is applied, and no Dataverse write or fetch occurs here.
      </div>

      <dl style={metaStyle}>
        <Row label="Adapter mode" value={readiness.mode.replace(/_/g, ' ')} />
        <Row label="Status" value={readiness.status.replace(/_/g, ' ')} />
        <Row label="Schema ready" value={String(readiness.schemaReady)} />
        <Row label="Read enabled" value={String(readiness.readEnabled)} />
        <Row label="Write enabled" value={String(readiness.writeEnabled)} />
        <Row label="Apply enabled" value={String(readiness.applyEnabled)} />
      </dl>

      <Section title="Planned future tables">
        <ul style={ulStyle}>
          {ADMIN_CONFIG_TARGET_TABLES.map((t) => (
            <li key={t.logicalName} style={itemStyle}>{t.displayName} ({t.logicalName})</li>
          ))}
        </ul>
      </Section>

      {schemaState.tablesMissing.length > 0 && (
        <Section title="Missing tables">
          <ul style={ulStyle}>
            {schemaState.tablesMissing.map((t) => (
              <li key={t} style={warnItemStyle}>{t}</li>
            ))}
          </ul>
        </Section>
      )}

      {schemaState.columnsMissing.length > 0 && (
        <Section title="Missing columns">
          <span style={itemStyle}>{schemaState.columnsMissing.length} planned column(s) not yet present.</span>
        </Section>
      )}

      {schemaState.relationshipsMissing.length > 0 && (
        <Section title="Missing relationships (optional)">
          <ul style={ulStyle}>
            {schemaState.relationshipsMissing.map((r) => (
              <li key={r.relationshipSchemaName} style={warnItemStyle}>{r.relationshipSchemaName}</li>
            ))}
          </ul>
        </Section>
      )}

      {readiness.blockers.length > 0 && (
        <Section title="Blockers">
          <ul style={ulStyle}>
            {readiness.blockers.map((b, i) => (
              <li key={i} style={blockerItemStyle}>{b.message}</li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Next best action">
        <span style={itemStyle}>{readiness.nextBestAction.label}</span>
      </Section>

      <CardFooter>
        <span>Persistence is disabled by default. Future activation requires policy approval, transport injection, permission controls, and audit verification — writes and apply remain disabled.</span>
      </CardFooter>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={sectionStyle}>
      <span style={sectionTitleStyle}>{title}</span>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={rowStyle}>
      <dt style={dtStyle}>{label}</dt>
      <dd style={ddStyle}>{value}</dd>
    </div>
  );
}

const bannerStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.atRiskFg, background: palette.atRiskBg, padding: spacing.sm, borderRadius: 4 };
const metaStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, margin: 0 };
const rowStyle: CSSProperties = { display: 'flex', gap: spacing.md };
const dtStyle: CSSProperties = { minWidth: 160, fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ddStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.text };
const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginTop: spacing.sm };
const sectionTitleStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ulStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const itemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const warnItemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.atRiskFg };
const blockerItemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.blockedFg };
