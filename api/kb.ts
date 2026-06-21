// Vercel Function — thin HTTP boundary over the serving-surface query API.
// POST JSON { fn: "search"|"filter"|"getRecord"|"resolveMaterial", ...args }.
// Env: DATABASE_URL (all fns) and OPENAI_API_KEY (search only).
//
// This is an optional HTTP boundary; TS consumers can also import src/api.ts directly.
import { search, filter, getRecord, resolveMaterial } from '../src/api';

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
    let data: unknown;
    switch (body.fn) {
      case 'search':
        data = await search(body.query, body.filters ?? {}, body.k ?? 12);
        break;
      case 'filter':
        data = await filter(body.criteria ?? {}, body.limit ?? 100);
        break;
      case 'getRecord':
        data = await getRecord(body.id, { resolveRefs: Boolean(body.resolveRefs) });
        break;
      case 'resolveMaterial':
        data = await resolveMaterial(body.ref);
        break;
      default:
        res.status(400).json({ error: `unknown fn: ${String(body.fn)}` });
        return;
    }
    res.status(200).json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'internal error' });
  }
}
