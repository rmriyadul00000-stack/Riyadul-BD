/* Public client configuration.
   Only the publishable (anon) key belongs here: it ships to every visitor
   and row level security decides what it can do. The service role key must
   never appear in front-end code. Override per environment with
   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (see .env.example); set
   VITE_SUPABASE_URL to an empty string to force local preview mode. */
const env = import.meta.env;

export const SUPABASE_URL: string =
  env.VITE_SUPABASE_URL ?? 'https://zgvvaxgafeccrawvkbuf.supabase.co';
export const SUPABASE_ANON_KEY: string =
  env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_zEVHxl1jQiNDWvUoYADT0Q_1HLZ8Qxy';

export const HAS_BACKEND = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
