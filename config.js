// Supabase configuration. Anon key is a public client-side token — safe to
// commit; real security comes from Postgres RLS policies.

export const SUPABASE_URL = 'https://oovardnwvpekpmffzpob.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9vdmFyZG53dnBla3BtZmZ6cG9iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NDczNDYsImV4cCI6MjA5MjQyMzM0Nn0.IuDwAtT3tQzZT7AzJLznhTkYcRHVYL6XPAVBYHPKHwU';

export const hasSupabaseConfig = () => SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
