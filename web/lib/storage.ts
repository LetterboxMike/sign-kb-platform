import './env';
import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only drawing storage on Supabase Storage (private `drawings` bucket). Uses the
 * service-role key — consistent with the rest of the app's server-side, direct-access model
 * (the anon key is never shipped to the browser). Uploads go direct-to-storage via a signed
 * upload URL so they bypass the serverless request-body limit.
 */

const BUCKET = 'drawings';
let cached: SupabaseClient | null = null;

export function storageConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function admin(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Storage not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.');
  }
  if (!cached) cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

function sanitize(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-100);
}

/** A signed URL the browser PUTs the file to directly (bypasses the function body limit). */
export async function createSignedUpload(filename: string): Promise<{ key: string; signedUrl: string }> {
  const key = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${sanitize(filename)}`;
  const { data, error } = await admin().storage.from(BUCKET).createSignedUploadUrl(key);
  if (error) throw error;
  return { key, signedUrl: data.signedUrl };
}

export async function downloadDrawing(key: string): Promise<Buffer> {
  const { data, error } = await admin().storage.from(BUCKET).download(key);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

/** Short-lived URL for viewing a stored drawing. Returns null on error (e.g. a non-storage path). */
export async function signedViewUrl(key: string, expiresIn = 3600): Promise<string | null> {
  if (!storageConfigured()) return null;
  try {
    const { data, error } = await admin().storage.from(BUCKET).createSignedUrl(key, expiresIn);
    if (error) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}
