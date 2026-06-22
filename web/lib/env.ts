import dotenv from 'dotenv';
import path from 'node:path';

// Load the repo-root .env so ../src/config picks up DATABASE_URL / OPENAI_API_KEY when the app
// runs the query API and write path server-side. Imported first by lib/kb.ts so it evaluates
// before @kb/config reads process.env. (Vercel injects real env vars in production.)
dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });

export {};
