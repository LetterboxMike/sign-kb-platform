import { query } from './db';

/** Saved queries — named searches/filters a user can re-run from the console. */

export interface SavedQuery {
  id: string;
  name: string;
  kind: 'search' | 'filter';
  q: string | null;
  filters: Record<string, unknown>;
  created_at: string;
}

export async function listSavedQueries(): Promise<SavedQuery[]> {
  const r = await query<SavedQuery>(
    'select id, name, kind, q, filters, created_at from saved_queries order by created_at desc limit 100',
  );
  return r.rows;
}

export async function saveQuery(input: {
  name: string;
  kind: 'search' | 'filter';
  q?: string | null;
  filters?: Record<string, unknown>;
}): Promise<string> {
  const r = await query<{ id: string }>(
    `insert into saved_queries (name, kind, q, filters) values ($1,$2,$3,$4::jsonb) returning id`,
    [input.name, input.kind, input.q ?? null, JSON.stringify(input.filters ?? {})],
  );
  return r.rows[0].id;
}

export async function deleteSavedQuery(id: string): Promise<void> {
  await query('delete from saved_queries where id = $1', [id]);
}
