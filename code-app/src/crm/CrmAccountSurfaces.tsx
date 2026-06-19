import { type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, spacing, typography } from '../shared/theme';
import {
  deriveCrmAccountSurfaceViewModel,
  type CrmAccountSurfaceInput,
  type CrmField,
} from './crmAccountViewModel';

/**
 * Phase 193D — CRM Account / Contact / Coverage surfaces (read surfaces).
 *
 * Presentational only. Renders whatever authorized/loaded spine data is on hand
 * via the pure view-model. Missing fields render an explicit "Missing" marker;
 * a provisional account identity is badged "provisional". Nothing is fabricated:
 * no contacts, titles, company data, emails, phones, or decision influence are
 * invented. No write controls (writes go through the gated persistence adapter
 * in a separate surface).
 */

interface Props {
  input: CrmAccountSurfaceInput;
}

export function CrmAccountSurface({ input }: Props) {
  const vm = deriveCrmAccountSurfaceViewModel(input);

  return (
    <Card>
      <CardHeader
        title="CRM Account"
        subtitle="Read-only relationship surface — missing data is shown as missing, never mocked"
        trailing={
          vm.hasAccount ? (
            <Badge variant={vm.isProvisional ? 'atRisk' : 'clear'}>
              {vm.isProvisional ? 'provisional' : 'account'}
            </Badge>
          ) : (
            <Badge variant="blocked">no account</Badge>
          )
        }
      />

      <div data-testid="crm-account-surface" data-has-account={String(vm.hasAccount)} data-provisional={String(vm.isProvisional)}>
        {vm.emptyStateCopy ? (
          <div style={mutedStyle} data-testid="crm-account-empty">
            {vm.emptyStateCopy}
          </div>
        ) : (
          <>
            <Section testid="crm-account-identity" label="Account identity">
              <FieldList fields={vm.accountIdentity} />
            </Section>

            <Section testid="crm-account-contacts" label={`Contacts (${vm.contacts.length})`}>
              {vm.contacts.length === 0 ? (
                <MissingNote section="contacts" />
              ) : (
                vm.contacts.map((c) => (
                  <div key={c.id} style={rowBlockStyle} data-testid={`crm-contact-${c.id}`}>
                    <FieldList fields={c.fields} />
                  </div>
                ))
              )}
            </Section>

            <Section testid="crm-account-coverage" label={`Coverage team (${vm.coverage.length})`}>
              {vm.coverage.length === 0 ? (
                <MissingNote section="coverage team" />
              ) : (
                vm.coverage.map((m) => (
                  <div key={m.id} style={rowBlockStyle} data-testid={`crm-coverage-${m.id}`}>
                    <FieldList fields={m.fields} />
                  </div>
                ))
              )}
            </Section>

            <Section testid="crm-account-roles" label={`Relationship roles (${vm.roles.length})`}>
              {vm.roles.length === 0 ? <MissingNote section="relationship roles" /> : <FieldList fields={vm.roles} />}
            </Section>

            <Section testid="crm-account-health" label="Relationship health">
              {vm.relationshipHealth.length === 0 ? <MissingNote section="relationship health" /> : <FieldList fields={vm.relationshipHealth} />}
            </Section>

            <Section testid="crm-account-related-deals" label={`Related deals (${vm.relatedDeals.length})`}>
              {vm.relatedDeals.length === 0 ? (
                <MissingNote section="related deals" />
              ) : (
                <ul style={listStyle}>
                  {vm.relatedDeals.map((d) => (
                    <li key={d.dealId} style={detailStyle} data-testid={`crm-related-deal-${d.dealId}`}>
                      {d.dealId}
                      {d.accountProvisional ? <span style={mutedInlineStyle}> (provisional account side)</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section testid="crm-account-source-facts" label="Source facts">
              {vm.sourceFacts.length === 0 ? (
                <MissingNote section="source facts" />
              ) : (
                <ul style={listStyle}>
                  {vm.sourceFacts.map((f, i) => (
                    <li key={i} style={mutedStyle}>
                      {f}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        )}
      </div>

      <CardFooter>
        <span data-testid="crm-account-footer">
          Read-only CRM account surface. No Dataverse write, no fabricated contacts/titles/company
          data. Missing data is shown as missing.
        </span>
      </CardFooter>
    </Card>
  );
}

function Section({ testid, label, children }: { testid: string; label: string; children: React.ReactNode }) {
  return (
    <section style={sectionStyle} aria-label={label} data-testid={testid}>
      <div style={labelStyle}>{label}</div>
      {children}
    </section>
  );
}

function FieldList({ fields }: { fields: CrmField[] }) {
  return (
    <dl style={dlStyle}>
      {fields.map((f, i) => (
        <div key={i} style={fieldRowStyle} data-field-state={f.state}>
          <dt style={dtStyle}>{f.label}</dt>
          <dd style={ddStyle}>
            {f.state === 'missing' ? (
              <span style={missingChipStyle} data-testid="crm-field-missing">
                Missing
              </span>
            ) : (
              <>
                {f.value}
                {f.state === 'provisional' ? <span style={mutedInlineStyle}> (provisional)</span> : null}
              </>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function MissingNote({ section }: { section: string }) {
  return (
    <div style={missingNoteStyle} data-testid="crm-section-missing" data-missing-section={section}>
      No {section} on record. This is shown as missing — not mocked.
    </div>
  );
}

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: spacing.xs,
  paddingTop: spacing.sm,
  borderTop: `1px solid ${palette.divider}`,
  marginTop: spacing.sm,
};
const labelStyle: CSSProperties = {
  fontSize: typography.size.xs,
  textTransform: 'uppercase',
  letterSpacing: typography.letterSpacing.label,
  color: palette.textSubtle,
  fontWeight: typography.weight.semibold,
};
const dlStyle: CSSProperties = { margin: 0, display: 'flex', flexDirection: 'column', gap: 2 };
const fieldRowStyle: CSSProperties = { display: 'flex', gap: spacing.sm, alignItems: 'baseline' };
const dtStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, minWidth: 160 };
const ddStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.text };
const detailStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const mutedStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textMuted, fontStyle: 'italic' };
const mutedInlineStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle };
const missingNoteStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
const missingChipStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, fontStyle: 'italic' };
const listStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const rowBlockStyle: CSSProperties = { paddingTop: spacing.xs };
