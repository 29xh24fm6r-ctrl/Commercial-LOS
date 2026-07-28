import type {
  MigrationControl,
  MigrationControlSegmentSubtotal,
} from './bookReconciliation';

interface RawMigrationControl {
  cr664_portfoliomigrationcontrolid?: string;
  cr664_name?: string;
  cr664_migrationbatchid?: string;
  cr664_operator?: string;
  cr664_enteredloancount?: number;
  cr664_enteredaggregateoutstanding?: number;
  cr664_segmentsubtotalsjson?: string;
  cr664_expectedloannumbersjson?: string;
  cr664_sourcedescription?: string;
  cr664_enteredat?: string;
}

function parseStringArray(value: string | undefined, label: string): readonly string[] | undefined {
  if (!value) return undefined;
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
    throw new Error(`${label} must contain a JSON string array.`);
  }
  return parsed;
}

function parseSegments(
  value: string | undefined,
): readonly MigrationControlSegmentSubtotal[] | undefined {
  if (!value) return undefined;
  const parsed: unknown = JSON.parse(value);
  if (
    !Array.isArray(parsed) ||
    !parsed.every(
      (item) =>
        item !== null &&
        typeof item === 'object' &&
        typeof (item as Record<string, unknown>).segment === 'string' &&
        typeof (item as Record<string, unknown>).count === 'number' &&
        typeof (item as Record<string, unknown>).outstanding === 'number',
    )
  ) {
    throw new Error('Segment subtotals must contain valid segment/count/outstanding rows.');
  }
  return parsed as readonly MigrationControlSegmentSubtotal[];
}

export function mapMigrationControl(row: RawMigrationControl): MigrationControl {
  const batchId = row.cr664_migrationbatchid?.trim();
  if (!batchId) throw new Error('A migration control row is missing its batch id.');
  if (
    typeof row.cr664_enteredloancount !== 'number' ||
    typeof row.cr664_enteredaggregateoutstanding !== 'number'
  ) {
    throw new Error(`Migration control ${batchId} is missing its required control totals.`);
  }
  return {
    batchId,
    operator: row.cr664_operator,
    enteredLoanCount: row.cr664_enteredloancount,
    enteredAggregateOutstanding: row.cr664_enteredaggregateoutstanding,
    segmentSubtotals: parseSegments(row.cr664_segmentsubtotalsjson),
    expectedLoanNumbers: parseStringArray(
      row.cr664_expectedloannumbersjson,
      'Expected loan numbers',
    ),
    sourceDescription: row.cr664_sourcedescription,
    enteredAt: row.cr664_enteredat,
  };
}

export async function loadMigrationControls(): Promise<readonly MigrationControl[]> {
  // Resolve the generated Power Apps service only when a live read is
  // requested. Static/read-only component tests can render the portfolio shell
  // without bootstrapping the host-only data package.
  const { Cr664_portfoliomigrationcontrolsService } = await import(
    '../../generated/services/Cr664_portfoliomigrationcontrolsService'
  );
  const result = await Cr664_portfoliomigrationcontrolsService.getAll({
    select: [
      'cr664_portfoliomigrationcontrolid',
      'cr664_name',
      'cr664_migrationbatchid',
      'cr664_operator',
      'cr664_enteredloancount',
      'cr664_enteredaggregateoutstanding',
      'cr664_segmentsubtotalsjson',
      'cr664_expectedloannumbersjson',
      'cr664_sourcedescription',
      'cr664_enteredat',
    ],
    filter: 'statecode eq 0',
    orderBy: ['cr664_enteredat desc'],
    maxPageSize: 100,
  });
  if (!result.success || !Array.isArray(result.data)) {
    throw new Error(
      result.error?.message ?? 'Portfolio migration controls could not be loaded.',
    );
  }
  return result.data.map(mapMigrationControl);
}
