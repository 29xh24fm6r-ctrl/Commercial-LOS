import type { ClosingDocumentTemplateKey, GeneratedClosingDocumentManifest } from './closingDocumentTypes';

/**
 * final-seven-workstreams Workstream 6 — the storage seam for generated closing-document
 * manifests + content.
 *
 * PR A update: a live Dataverse-backed implementation (`createDataverseClosingDocumentStore`) now
 * exists below, mirroring `fundingAuthorizationDataverseStore.ts`'s precedent exactly. This closes
 * the gap the original comment here described — but it comes with the SAME caveat that precedent
 * disclosed: the backing table (`cr664_closingdocumentmanifest`, proposed in
 * `scripts/schema-migrations/pr123-closing-document-persistence/`) has NOT been applied to any live
 * Dataverse environment, and the generated SDK pairing
 * (`Cr664_closingdocumentmanifestsModel.ts`/`Service.ts`) was hand-authored to mirror `entity.mjs`
 * rather than produced by a real `pac code add-data-source` regeneration (no live credentials exist
 * in this sandbox). Until an operator applies that migration and confirms the SDK regeneration,
 * every live call this adapter makes will fail — safely, fail-closed (an honest
 * `{ success: false, error }`), never a fabricated success.
 *
 * `createInMemoryClosingDocumentStore()` below is still a real, working reference implementation —
 * useful for tests and as the honest fallback while the schema migration is pending — but it is NOT
 * persistence; it is lost on page reload. Callers must not present it to a user as "saved."
 */
export interface ClosingDocumentStorageResult {
  readonly success: boolean;
  readonly id?: string;
  readonly error?: string;
}

export interface ClosingDocumentListResult {
  readonly success: boolean;
  readonly manifests?: readonly GeneratedClosingDocumentManifest[];
  readonly error?: string;
}

export interface ClosingDocumentStorageDeps {
  readonly createManifestRecord: (
    manifest: GeneratedClosingDocumentManifest,
    renderedContent: string,
  ) => Promise<ClosingDocumentStorageResult>;
  readonly listManifestsForDeal: (dealId: string) => Promise<ClosingDocumentListResult>;
}

export function createInMemoryClosingDocumentStore(): ClosingDocumentStorageDeps & {
  readonly all: () => readonly GeneratedClosingDocumentManifest[];
  readonly contentFor: (manifestId: string) => string | undefined;
} {
  const manifests: GeneratedClosingDocumentManifest[] = [];
  const content = new Map<string, string>();
  return {
    createManifestRecord: async (manifest, renderedContent) => {
      manifests.push(manifest);
      content.set(manifest.manifestId, renderedContent);
      return { success: true, id: manifest.manifestId };
    },
    listManifestsForDeal: async (dealId) => ({
      success: true,
      manifests: manifests.filter((m) => m.dealId === dealId),
    }),
    all: () => manifests,
    contentFor: (manifestId) => content.get(manifestId),
  };
}

// ---------------------------------------------------------------------------
// PR A — live Dataverse-backed implementation (see the header disclosure above)
// ---------------------------------------------------------------------------

const VALID_TEMPLATE_KEYS: ReadonlySet<string> = new Set([
  'closing_checklist',
  'borrower_closing_instruction_letter',
  'internal_funding_checklist',
  'conditions_precedent_certification',
  'closing_package_cover_sheet',
]);

const VALID_STATUSES: ReadonlySet<string> = new Set(['draft', 'final']);

/** The subset of `Cr664_closingdocumentmanifests` fields this adapter reads. */
const SELECT_FIELDS = [
  'cr664_manifestid',
  'cr664_dealid',
  'cr664_templatekey',
  'cr664_templateversion',
  'cr664_generatedatiso',
  'cr664_generatedbyactoremail',
  'cr664_contenthash',
  'cr664_correlationid',
  'cr664_status',
  'cr664_supersedesmanifestid',
] as const;

type ClosingDocumentManifestRow = Record<(typeof SELECT_FIELDS)[number], unknown>;

type MapResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

/** Fail-closed row -> manifest mapping — a malformed/missing required field fails this ONE row's
 *  read rather than being silently coerced into a fabricated value. */
function mapRowToManifest(row: ClosingDocumentManifestRow): MapResult<GeneratedClosingDocumentManifest> {
  const manifestId = row.cr664_manifestid;
  if (typeof manifestId !== 'string' || manifestId.length === 0) {
    return { ok: false, error: 'A closing document manifest row is missing cr664_manifestid.' };
  }
  const dealId = row.cr664_dealid;
  if (typeof dealId !== 'string' || dealId.length === 0) {
    return { ok: false, error: `Manifest ${manifestId} is missing cr664_dealid.` };
  }
  const templateKey = row.cr664_templatekey;
  if (typeof templateKey !== 'string' || !VALID_TEMPLATE_KEYS.has(templateKey)) {
    return { ok: false, error: `Manifest ${manifestId} has an unrecognized template key: ${String(templateKey)}.` };
  }
  const templateVersion = row.cr664_templateversion;
  if (typeof templateVersion !== 'string' || templateVersion.length === 0) {
    return { ok: false, error: `Manifest ${manifestId} is missing cr664_templateversion.` };
  }
  const generatedAtIso = row.cr664_generatedatiso;
  if (typeof generatedAtIso !== 'string' || generatedAtIso.length === 0) {
    return { ok: false, error: `Manifest ${manifestId} is missing cr664_generatedatiso.` };
  }
  const generatedByActorEmail = row.cr664_generatedbyactoremail;
  if (typeof generatedByActorEmail !== 'string' || generatedByActorEmail.length === 0) {
    return { ok: false, error: `Manifest ${manifestId} is missing cr664_generatedbyactoremail.` };
  }
  const contentHash = row.cr664_contenthash;
  if (typeof contentHash !== 'string' || contentHash.length === 0) {
    return { ok: false, error: `Manifest ${manifestId} is missing cr664_contenthash.` };
  }
  const correlationId = row.cr664_correlationid;
  if (typeof correlationId !== 'string' || correlationId.length === 0) {
    return { ok: false, error: `Manifest ${manifestId} is missing cr664_correlationid.` };
  }
  const status = row.cr664_status;
  if (typeof status !== 'string' || !VALID_STATUSES.has(status)) {
    return { ok: false, error: `Manifest ${manifestId} has an unrecognized status: ${String(status)}.` };
  }

  return {
    ok: true,
    value: {
      manifestId,
      templateKey: templateKey as ClosingDocumentTemplateKey,
      templateVersion,
      dealId,
      generatedAtIso,
      generatedByActorEmail,
      contentHash,
      correlationId,
      status: status as GeneratedClosingDocumentManifest['status'],
      supersedesManifestId: typeof row.cr664_supersedesmanifestid === 'string' ? row.cr664_supersedesmanifestid : undefined,
    },
  };
}

function manifestToRow(manifest: GeneratedClosingDocumentManifest, renderedContent: string): Record<string, unknown> {
  return {
    cr664_manifestid: manifest.manifestId,
    cr664_dealid: manifest.dealId,
    cr664_templatekey: manifest.templateKey,
    cr664_templateversion: manifest.templateVersion,
    cr664_generatedatiso: manifest.generatedAtIso,
    cr664_generatedbyactoremail: manifest.generatedByActorEmail,
    cr664_contenthash: manifest.contentHash,
    cr664_correlationid: manifest.correlationId,
    cr664_status: manifest.status,
    cr664_supersedesmanifestid: manifest.supersedesManifestId,
    cr664_renderedcontent: renderedContent,
  };
}

/**
 * PR A — the durable, Dataverse-backed `ClosingDocumentStorageDeps` implementation. Dynamic-
 * import-only (no static SDK import at this module's top level) — matches every other SDK-
 * touching module in this codebase. Every manifest is immutable and append-only (regeneration
 * always creates a NEW row via `supersedesManifestId`, never mutates a prior one — see
 * `closingDocumentGeneration.ts`'s `regenerateClosingDocument`), so this adapter only ever needs
 * `create` and `getAll`, never an update path.
 *
 * FAIL-CLOSED throughout: a malformed/missing required field on any row, or a thrown/rejected SDK
 * call, surfaces as an honest `{ success: false, error }` — never a fabricated manifest. A single
 * unreadable row fails only that read (unlike the funding-authorization adapter's "current
 * record" selection, listing a deal's manifests has no single "current" row whose correctness a
 * bad sibling row could undermine — so `listManifestsForDeal` skips and reports unreadable rows
 * individually rather than failing the whole list).
 */
export function createDataverseClosingDocumentStore(): ClosingDocumentStorageDeps {
  return {
    createManifestRecord: async (manifest, renderedContent) => {
      try {
        const { Cr664_closingdocumentmanifestsService } = await import(
          '../../generated/services/Cr664_closingdocumentmanifestsService'
        );
        const payload = manifestToRow(manifest, renderedContent);
        // ownerid / owneridtype / statecode are server-defaulted Dataverse system fields — never
        // supplied by callers (same convention as fundingAuthorizationDataverseStore.ts).
        const result = await Cr664_closingdocumentmanifestsService.create(
          payload as unknown as Parameters<typeof Cr664_closingdocumentmanifestsService.create>[0],
        );
        if (!result.success) {
          return { success: false, error: result.error?.message ?? 'Closing document manifest create returned non-success.' };
        }
        return { success: true, id: manifest.manifestId };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    listManifestsForDeal: async (dealId) => {
      try {
        const { Cr664_closingdocumentmanifestsService } = await import(
          '../../generated/services/Cr664_closingdocumentmanifestsService'
        );
        const result = await Cr664_closingdocumentmanifestsService.getAll({
          select: [...SELECT_FIELDS],
          filter: `cr664_dealid eq '${dealId.replace(/'/g, "''")}'`,
        });
        if (!result.success || !Array.isArray(result.data)) {
          return { success: false, error: result.error?.message ?? 'Closing document manifest list read failed.' };
        }
        const manifests: GeneratedClosingDocumentManifest[] = [];
        for (const row of result.data) {
          const mapped = mapRowToManifest(row as unknown as ClosingDocumentManifestRow);
          // Unlike getCurrentRecordForDeal's single-current-row selection, a malformed sibling row
          // here can't misidentify which OTHER manifest is authoritative — each manifest stands on
          // its own. Skip it (never fabricate), don't fail the whole list.
          if (mapped.ok) manifests.push(mapped.value);
        }
        return { success: true, manifests };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

// Re-exported so tests needing the pure row<->manifest mapping (without a live/mocked SDK call)
// don't have to reach into this module's private scope.
export const __internal = { mapRowToManifest, manifestToRow };
