-- Kudi Supabase schema. Run once in the Supabase SQL editor, then set
-- STORE=supabase in .env.local. Only conversation state and single-use nonces
-- are stored — never card PANs, CVVs, secrets or tokens.

create table if not exists public.kudi_turns (
  id          bigint generated always as identity primary key,
  session_id  text        not null,
  seq         int         not null,
  turn        jsonb       not null,
  created_at  timestamptz not null default now()
);
create index if not exists kudi_turns_session_idx on public.kudi_turns (session_id, seq);

create table if not exists public.kudi_nonces (
  session_id  text        not null,
  nonce       text        not null,
  created_at  timestamptz not null default now(),
  primary key (session_id, nonce)
);

-- These tables are only ever touched by the server using the service_role key,
-- which bypasses RLS. We still enable RLS with no policies so that the anon /
-- authenticated keys (if ever exposed) can read nothing.
alter table public.kudi_turns  enable row level security;
alter table public.kudi_nonces enable row level security;
