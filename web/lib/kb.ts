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
export { ingestPdf, ingestFile, type IngestResult } from '@kb/ingest';
export { rollupQualityGrades } from '@kb/ranker';
export { exportCorpus } from '@kb/export';
export { query } from '@kb/db';
export { config as kbConfig } from '@kb/config';
