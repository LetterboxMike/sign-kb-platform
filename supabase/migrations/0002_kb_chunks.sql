-- Phase 2 — semantic retrieval. kb_chunks holds sign-knowledge chunks AND design-canon
-- chunks together (the spec embeds canon alongside records). Embeddings are halfvec(3072)
-- for text-embedding-3-large: pgvector indexes the standard `vector` type only to 2000 dims,
-- but supports HNSW on halfvec up to 4000 dims (pgvector >= 0.7).

create extension if not exists vector;

create table if not exists kb_chunks (
  id              bigserial primary key,
  source_id       text not null,          -- record_id, canon principle id, or synthesized exemplar id
  source_kind     text not null,          -- 'record' | 'canon'
  chunk_type      text not null,          -- summary | rationale | design_obs | principle | exemplar
  seq             int  not null default 0,
  text            text not null,
  content_hash    text not null,          -- sha256(model + text); drives incremental re-embedding
  embedding       halfvec(3072),
  embedding_model text,
  unique (source_id, chunk_type, seq)
);

create index if not exists idx_kb_chunks_source_id  on kb_chunks (source_id);
create index if not exists idx_kb_chunks_chunk_type on kb_chunks (chunk_type);
create index if not exists idx_kb_chunks_embedding  on kb_chunks using hnsw (embedding halfvec_cosine_ops);
