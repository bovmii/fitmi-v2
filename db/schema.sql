-- fit.mi v2 Supabase schema
-- Paste this in the SQL editor of your Supabase project and run it.

-- ---------------------------------------------------------------------------
-- Single wide "records" table indexed by (user_id, store, updated_at).
-- Every IndexedDB object store in the client maps to rows with the matching
-- `store` value. The shape of each row lives in the `data` jsonb column so
-- we don't have to maintain 20 parallel Postgres schemas.
-- ---------------------------------------------------------------------------

create table if not exists public.records (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  store text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists records_sync_idx
  on public.records (user_id, store, updated_at);

create index if not exists records_deleted_idx
  on public.records (user_id, deleted_at)
  where deleted_at is not null;

-- ---------------------------------------------------------------------------
-- Row-level security: each user can only see and modify their own rows.
-- The client sends its own updated_at timestamp; the server trusts it to
-- keep sync logic simple for a solo-user app. Tighten later with a
-- server-now() trigger if clock drift becomes an issue.
-- ---------------------------------------------------------------------------

alter table public.records enable row level security;

drop policy if exists "records are private per user" on public.records;
create policy "records are private per user"
  on public.records
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Realtime: publish the records table so the client can subscribe to live
-- changes from other devices.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.records;
