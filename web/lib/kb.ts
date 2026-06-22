// Server-only KB access. This is the ONE place the app reaches the data core; pages and route
// handlers import from here, never the DB directly. Reuses the serving-surface query API
// (search/filter/getRecord/resolveMaterial) plus the system-of-record write path and ranker.
import './env'; // must precede @kb/* so the root .env is loaded before config reads process.env

export {
  search,
  filter,
  getRecord,
  resolveMaterial,
  type SearchHit,
  type SignRow,
  type RecordResult,
  type ReferenceEntry,
  type ResolvedMaterial,
  type FilterCriteria,
  type SignFilters,
} from '@kb/api';

export { writeRecord, setRecordStatus, RecordValidationError, type RecordStatus } from '@kb/write';
export { answerQuestion, type ChatAnswer, type ChatMessage, type RetrievedRecord } from '@kb/chat';
export {
  ingestPdf,
  ingestFile,
  stageFromBuffer,
  enqueueJob,
  claimNextJob,
  completeJob,
  failJob,
  pendingJobCount,
  type IngestResult,
  type StageResult,
  type ClaimedJob,
} from '@kb/ingest';
export { rollupQualityGrades } from '@kb/ranker';
export {
  proposeFromPrompt,
  proposeExplicit,
  applyCorrection,
  revertCorrection,
  listCorrections,
  getCorrection,
  setRecordField,
  type ChangeEntry,
  type CorrectionProposal,
  type CorrectionRow,
  type ApplyResult,
} from '@kb/correct';
export { exportCorpus } from '@kb/export';
export {
  listReference,
  getReferenceEntry,
  proposeReferenceEntry,
  upsertReferenceEntry,
  type ReferenceEntry as ReferenceLayerEntry,
  type ReferenceProposal,
} from '@kb/reference';
export { listProposedTerms, resolveProposedTerm, enumValuesFor, type ProposedTerm } from '@kb/vocab';
export { listSavedQueries, saveQuery, deleteSavedQuery, type SavedQuery } from '@kb/saved';
export { buildExportBundle, type ExportBundle } from '@kb/export';
export { query } from '@kb/db';
export { config as kbConfig } from '@kb/config';
