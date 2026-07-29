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
-- Non-secret BMONI ids per session. The owner private key is NEVER stored — it
-- is derived from SESSION_SECRET on demand (src/lib/bmoni/owner.ts).
create table if not exists public.kudi_bmoni_accounts (
  session_id      text        primary key,
  bmoni_user_id   text        not null,
  smart_wallet_id text        not null,
  wallet_address  text        not null,
  created_at      timestamptz not null default now()
);

-- Hashed transaction PIN per session (scrypt salt:hash). Never plaintext.
create table if not exists public.kudi_pins (
  session_id  text        primary key,
  pin_hash    text        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Event ledger for the admin dashboard (transfers, confirmations, flags, KYC).
create table if not exists public.kudi_events (
  id          bigint generated always as identity primary key,
  session_id  text        not null,
  kind        text        not null,
  amount_minor bigint,
  currency    text,
  detail      jsonb       not null default '{}'::jsonb,
  flagged     boolean     not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists kudi_events_created_idx on public.kudi_events (created_at desc);

alter table public.kudi_turns          enable row level security;
alter table public.kudi_nonces         enable row level security;
alter table public.kudi_bmoni_accounts enable row level security;
alter table public.kudi_pins           enable row level security;
alter table public.kudi_events         enable row level security;
