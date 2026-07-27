import { DURABLE_RECORD_CAPABILITIES } from '../shared/governance/durableRecordCapabilityInventory';
import { GOVERNED_WRITES } from '../shared/governance/platformInventory';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { adminStyles } from './adminCardChrome';
import { spacing, typography } from '../shared/theme';

/**
 * Final LOS Completion arc — Workstream M.
 *
 * `AdminCapabilityTruthMatrix.tsx`'s own header documents 9 pre-existing panels, each with its own
 * status vocabulary, and explicitly declines to retire or merge any of them — this workstream does
 * not touch that decision. What it closes is a DIFFERENT, narrower gap: the six durable-record
 * capabilities Workstreams C/D/E/F/H/J shipped (Credit Approval Decision, Commitment, Condition
 * Verification, Executed Document Attestation, Booking QC, Adverse Action Record) were registered as
 * `GOVERNED_WRITES` entries for the first time in THIS workstream, but `GOVERNED_WRITES` only tracks
 * whether a write emits audit/timeline — it says nothing about the capability's own domain status
 * vocabulary (e.g. a Commitment can be ISSUED/ACCEPTED/DECLINED/EXPIRED/WITHDRAWN). That is exactly
 * the kind of fact `AdminCapabilityTruthMatrix` itself does not model for these six.
 *
 * ADDITIVE: one new panel, reading the new `durableRecordCapabilityInventory.ts` registry (itself
 * additive — see that module's header), mounted alongside `AdminCapabilityTruthMatrix`, touching
 * neither it nor any of the 9 pre-existing readiness panels.
 */
export function AdminDurableRecordCapabilityPanel() {
  return (
    <Card>
      <CardHeader
        title="Durable-Record Capability Status Vocabularies"
        subtitle={`${DURABLE_RECORD_CAPABILITIES.length} durable-record capabilities added by the Final LOS Completion arc, each with its own domain status vocabulary`}
      />
      <ul style={adminStyles.list} data-admin-durable-record-capability-rows>
        {DURABLE_RECORD_CAPABILITIES.map((c) => {
          const governedWrite = GOVERNED_WRITES.find((w) => w.id === c.governedWriteId);
          return (
            <li key={c.id} style={adminStyles.row} data-admin-durable-record-capability-row={c.id}>
              <div style={adminStyles.rowHead}>
                <span style={adminStyles.rowTitle}>{c.label}</span>
                <Badge variant={governedWrite ? 'clear' : 'blocked'} appearance="outline">
                  {governedWrite ? 'Live governed write' : 'Not registered'}
                </Badge>
              </div>
              <div style={styles.statusRow}>
                {c.statusVocabulary.map((status) => (
                  <Badge key={status} variant="neutral" appearance="outline">
                    {status}
                  </Badge>
                ))}
              </div>
              <p style={styles.detail}>
                Types: {c.typesFile} · Store: {c.storeFile} · Action: {c.actionFile} · Mounted via {c.mountedInPanel}
              </p>
            </li>
          );
        })}
      </ul>
      <CardFooter>
        <span>
          Sourced from shared/governance/durableRecordCapabilityInventory.ts — a new, additive
          registry alongside platformInventory.ts's existing four. Does not replace or reinterpret the
          9 pre-existing capability/readiness panels or AdminCapabilityTruthMatrix.
        </span>
      </CardFooter>
    </Card>
  );
}

const styles: Record<string, React.CSSProperties> = {
  statusRow: { display: 'flex', flexWrap: 'wrap', gap: spacing.xxs, marginTop: spacing.xxs },
  detail: { margin: `${spacing.xxs} 0 0`, fontSize: typography.size.sm, color: 'var(--cc-text-muted)', lineHeight: typography.lineHeight.snug },
};
