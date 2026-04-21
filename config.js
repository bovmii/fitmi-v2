// Supabase configuration. Anon key is a public client-side token — safe to
// commit; real security comes from Postgres RLS policies.
//
// When both values are empty strings the app runs in local-only mode
// (IndexedDB, no auth, no sync). Fill these in after you have provisioned
// your Supabase project:
//   1. Create the project at https://supabase.com
//   2. Settings → API → copy "Project URL" and "anon public" key
//   3. Authentication → Providers → enable GitHub
//   4. SQL Editor → paste db/schema.sql and run it

export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

// Only this GitHub user is allowed to use the app. Other Supabase accounts
// get signed out client-side on login. RLS still scopes every row to the
// authenticated user_id as a second line of defence.
export const ALLOWED_GITHUB_LOGINS = ['bovmii'];

export const hasSupabaseConfig = () => SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
