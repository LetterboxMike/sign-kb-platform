-- Phase 2: private Storage bucket for uploaded sign drawings. Accessed server-side only via the
-- service-role key (web/lib/storage.ts); the anon key is never shipped to the browser. Uploads
-- go direct-to-storage via signed upload URLs (bypassing the serverless body limit); the review
-- queue renders drawings via short-lived signed view URLs.
-- allowed_mime_types includes application/octet-stream + variants because browsers often report
-- an empty/generic type for PDFs; the client also derives a content-type from the extension.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('drawings', 'drawings', false, 524288000,
        array['application/pdf','application/x-pdf','application/octet-stream',
              'image/png','image/jpeg','image/jpg','image/webp','image/tiff'])
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
