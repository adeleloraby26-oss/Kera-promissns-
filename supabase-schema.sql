-- KIRA Network — Supabase schema
-- Run this once in Supabase: Project → SQL Editor → New query → paste → Run

-- 1) One row per visitor session
create table if not exists kira_sessions (
  id uuid primary key default gen_random_uuid(),
  user_agent text,
  created_at timestamptz not null default now()
);

-- 2) One row per permission action (button press / API result)
create table if not exists kira_permission_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references kira_sessions(id) on delete cascade,
  permission text not null check (permission in ('location','camera','mic','notif','files')),
  status text not null check (status in ('pending','granted','denied')),
  detail text,
  created_at timestamptz not null default now()
);

-- 3) One row per completed agreement (the three checkboxes + Continue)
create table if not exists kira_consents (
  id bigint generated always as identity primary key,
  session_id uuid not null references kira_sessions(id) on delete cascade,
  privacy_ack boolean not null,
  permissions_ack boolean not null,
  agree boolean not null,
  created_at timestamptz not null default now()
);

-- Indexes for the admin dashboard's ordering/filtering
create index if not exists idx_events_created_at on kira_permission_events (created_at desc);
create index if not exists idx_consents_created_at on kira_consents (created_at desc);

-- Row Level Security: public site can INSERT only, never read/update/delete.
-- Admin dashboard reads using the service_role key instead (bypasses RLS),
-- or you can add a separate authenticated "admin" policy — see notes below.
alter table kira_sessions enable row level security;
alter table kira_permission_events enable row level security;
alter table kira_consents enable row level security;

create policy "public can insert sessions"
  on kira_sessions for insert
  to anon
  with check (true);

create policy "public can insert events"
  on kira_permission_events for insert
  to anon
  with check (true);

create policy "public can insert consents"
  on kira_consents for insert
  to anon
  with check (true);

-- Realtime: make sure these tables broadcast INSERTs to subscribers.
-- In Supabase Dashboard → Database → Replication → toggle these 3 tables ON,
-- OR run the lines below (safe to re-run):
alter publication supabase_realtime add table kira_sessions;
alter publication supabase_realtime add table kira_permission_events;
alter publication supabase_realtime add table kira_consents;

-- ⚠️ Security note for your project write-up:
-- The public site only ever gets the "anon" key, which under these policies
-- can INSERT and nothing else (no select/update/delete). The admin dashboard
-- must use the "service_role" key (Project Settings → API → service_role),
-- which bypasses RLS — never ship the service_role key inside the public
-- kira-permissions.html, only inside kira-admin.html, and ideally keep the
-- admin page behind its own login before deploying it anywhere public.
