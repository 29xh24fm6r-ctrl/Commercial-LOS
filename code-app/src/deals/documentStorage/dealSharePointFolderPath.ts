const INVALID_CHARACTERS = new Set('"*:<>?/\\|');
const TRAILING = /[ .]+$/g;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const MAX_SEGMENT_LENGTH = 120;

function replaceInvalidSharePointCharacters(value: string, replacement: string): string {
  return [...value]
    .map((character) => character.charCodeAt(0) < 32 || INVALID_CHARACTERS.has(character) ? replacement : character)
    .join('');
}

function stableSuffix(value: string): string {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export interface DealFolderPathInput {
  readonly dealId: string;
  readonly borrowerIdentity: string;
  readonly companyLegalName: string;
  readonly documentPackageDate: string;
  readonly libraryRoot?: string;
  readonly persistedCompanyFolderPath?: string;
  readonly collisionDetected?: boolean;
  readonly stableDealNumber?: string;
}

export interface DerivedDealFolderPath {
  readonly year: number;
  readonly annualFolderPath: string;
  readonly companyFolderName: string;
  readonly companyFolderPath: string;
  readonly namingSource: 'BORROWER_LEGAL_NAME' | 'BORROWER_LEGAL_NAME_WITH_DEAL_SUFFIX';
  readonly reusedPersistedPath: boolean;
}

export function sanitizeSharePointPathSegment(value: string): string {
  const normalized = replaceInvalidSharePointCharacters(value.normalize('NFC'), ' ').replace(/\s+/g, ' ').trim().replace(TRAILING, '');
  if (!normalized || normalized === '.' || normalized === '..') throw new Error('A non-empty safe SharePoint folder name is required.');
  const safe = RESERVED.test(normalized) ? '_' + normalized : normalized;
  if (safe.length <= MAX_SEGMENT_LENGTH) return safe;
  const suffix = stableSuffix(safe);
  return safe.slice(0, MAX_SEGMENT_LENGTH - suffix.length - 3).replace(TRAILING, '') + ' - ' + suffix;
}

export function sanitizeSharePointFileName(value: string): string {
  const trimmed = value.normalize('NFC').trim();
  const dot = trimmed.lastIndexOf('.');
  const extension = dot > 0 ? replaceInvalidSharePointCharacters(trimmed.slice(dot), '') : '';
  const stem = dot > 0 ? trimmed.slice(0, dot) : trimmed;
  const safeStem = sanitizeSharePointPathSegment(stem);
  return safeStem + extension;
}

export function deriveDealSharePointFolderPath(input: DealFolderPathInput): DerivedDealFolderPath {
  if (!input.dealId.trim() || !input.borrowerIdentity.trim()) throw new Error('Verified deal and borrower identities are required.');
  if (input.persistedCompanyFolderPath) {
    const persisted = input.persistedCompanyFolderPath.trim();
    if (!persisted.startsWith('/') || persisted.includes('..') || persisted.includes('\\')) {
      throw new Error('Persisted SharePoint folder path is malformed.');
    }
    const match = persisted.match(/\/(\d{4}) Loans\//);
    if (!match) throw new Error('Persisted SharePoint folder path has no governed annual folder.');
    return {
      year: Number(match[1]),
      annualFolderPath: persisted.slice(0, persisted.lastIndexOf('/')),
      companyFolderName: persisted.slice(persisted.lastIndexOf('/') + 1),
      companyFolderPath: persisted,
      namingSource: persisted.endsWith(' - ' + (input.stableDealNumber ?? input.dealId)) ? 'BORROWER_LEGAL_NAME_WITH_DEAL_SUFFIX' : 'BORROWER_LEGAL_NAME',
      reusedPersistedPath: true,
    };
  }
  const year = new Date(input.documentPackageDate).getUTCFullYear();
  if (!Number.isInteger(year) || year < 2000 || year > 2200) throw new Error('An authoritative document-package date is required.');
  const root = '/' + sanitizeSharePointPathSegment(input.libraryRoot ?? '(a) Loans') + '/' + year + ' Loans';
  const base = sanitizeSharePointPathSegment(input.companyLegalName);
  const dealSuffix = sanitizeSharePointPathSegment(input.stableDealNumber?.trim() || input.dealId);
  const companyFolderName = input.collisionDetected ? base + ' - ' + dealSuffix : base;
  return {
    year,
    annualFolderPath: root,
    companyFolderName,
    companyFolderPath: root + '/' + companyFolderName,
    namingSource: input.collisionDetected ? 'BORROWER_LEGAL_NAME_WITH_DEAL_SUFFIX' : 'BORROWER_LEGAL_NAME',
    reusedPersistedPath: false,
  };
}
