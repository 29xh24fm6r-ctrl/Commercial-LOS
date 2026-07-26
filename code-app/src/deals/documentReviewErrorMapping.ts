/**
 * Business-safe error mapping for the document requirement/receive/review
 * write family — Production Remediation Factory Arc N-01 / N-21.
 *
 * PR A remediation — this module's mapping logic never actually depended on documents; it has
 * been generalized into `src/shared/errors/businessSafeErrorMapping.ts` (the "global sweep" this
 * module's own header used to say was deferred) and this file now just re-exports it under its
 * original name so every existing call site and test keeps working unchanged.
 */

export {
  mapBusinessSafeError as mapDocumentWriteError,
  type MappedBusinessSafeError as MappedDocumentWriteError,
} from '../shared/errors/businessSafeErrorMapping';
