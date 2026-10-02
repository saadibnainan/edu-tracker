-- EDU-Tracker app schema.
-- Every table: client-generated uuid id, user_id, created_at, updated_at.
-- Conflicts resolve last-write-wins on updated_at (see lww_guard).
--
-- Isolation: route handlers run every data query inside a transaction that
-- does `SET LOCAL ROLE app_user` and sets `app.user_id` (lib/server/db.ts).
-- app_user has no BYPASSRLS, so the policies below apply on Neon too, where
-- the connection role itself may bypass RLS.

-- ---------------------------------------------------------------------------
-- Role
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user nologin noinherit;
  end if;
end
$$;

-- The connection role must be able to SET ROLE app_user.
grant app_user to current_user;
grant usage on schema public to app_user;

create or replace function public.current_app_user() returns text
language sql stable
as $$ select nullif(current_setting('app.user_id', true), '') $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default public.current_app_user() references public."user" (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  color_index smallint not null default 0 check (color_index between 0 and 5),
  weekly_target_minutes integer check (weekly_target_minutes is null or weekly_target_minutes between 1 and 10080),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default public.current_app_user() references public."user" (id) on delete cascade,
  subject_id uuid not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_seconds integer not null check (duration_seconds between 0 and 86400),
  kind text not null check (kind in ('stopwatch', 'countdown', 'pomodoro', 'manual')),
  note text check (note is null or char_length(note) <= 2000),
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at >= started_at),
  foreign key (subject_id, user_id) references public.subjects (id, user_id)
);

create index sessions_user_started_idx on public.sessions (user_id, started_at desc);
create index sessions_tags_idx on public.sessions using gin (tags);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default public.current_app_user() references public."user" (id) on delete cascade,
  subject_id uuid,
  period text not null check (period in ('daily', 'weekly')),
  target_minutes integer not null check (target_minutes between 1 and 10080),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (subject_id, user_id) references public.subjects (id, user_id)
);

-- One live goal per (user, subject or global, period). Goal ids are also
-- deterministic per scope (lib/ids.ts), so offline devices converge on one row.
create unique index goals_one_live_per_scope
  on public.goals (user_id, subject_id, period) nulls not distinct
  where deleted_at is null;

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default public.current_app_user() references public."user" (id) on delete cascade,
  subject_id uuid not null,
  exam_date date not null,
  title text check (title is null or char_length(title) <= 120),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (subject_id, user_id) references public.subjects (id, user_id)
);

create index exams_user_date_idx on public.exams (user_id, exam_date);

create table public.calendar_sources (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default public.current_app_user() references public."user" (id) on delete cascade,
  url text not null check (url ~ '^https://' and char_length(url) <= 2048),
  label text check (label is null or char_length(label) <= 80),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Last-write-wins guard
-- ---------------------------------------------------------------------------

create or replace function public.lww_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- A device with a fast clock must not win every future conflict.
  if new.updated_at > now() + interval '5 minutes' then
    new.updated_at := now();
  end if;

  if tg_op = 'UPDATE' then
    -- Stale write: keep the stored row, report success to the client.
    if new.updated_at < old.updated_at then
      return null;
    end if;
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  end if;

  return new;
end;
$$;

create trigger subjects_lww before insert or update on public.subjects
  for each row execute function public.lww_guard();
create trigger sessions_lww before insert or update on public.sessions
  for each row execute function public.lww_guard();
create trigger goals_lww before insert or update on public.goals
  for each row execute function public.lww_guard();
create trigger exams_lww before insert or update on public.exams
  for each row execute function public.lww_guard();
create trigger calendar_sources_lww before insert or update on public.calendar_sources
  for each row execute function public.lww_guard();

-- ---------------------------------------------------------------------------
-- Row Level Security: app_user reaches only rows whose user_id matches
-- app.user_id. No delete grant: subjects archive, the others tombstone.
-- ---------------------------------------------------------------------------

grant select, insert, update on public.subjects, public.sessions, public.goals, public.exams, public.calendar_sources to app_user;
grant execute on function public.current_app_user() to app_user;

alter table public.subjects enable row level security;
alter table public.sessions enable row level security;
alter table public.goals enable row level security;
alter table public.exams enable row level security;
alter table public.calendar_sources enable row level security;

create policy subjects_select on public.subjects for select to app_user using (user_id = public.current_app_user());
create policy subjects_insert on public.subjects for insert to app_user with check (user_id = public.current_app_user());
create policy subjects_update on public.subjects for update to app_user
  using (user_id = public.current_app_user()) with check (user_id = public.current_app_user());

create policy sessions_select on public.sessions for select to app_user using (user_id = public.current_app_user());
create policy sessions_insert on public.sessions for insert to app_user with check (user_id = public.current_app_user());
create policy sessions_update on public.sessions for update to app_user
  using (user_id = public.current_app_user()) with check (user_id = public.current_app_user());

create policy goals_select on public.goals for select to app_user using (user_id = public.current_app_user());
create policy goals_insert on public.goals for insert to app_user with check (user_id = public.current_app_user());
create policy goals_update on public.goals for update to app_user
  using (user_id = public.current_app_user()) with check (user_id = public.current_app_user());

create policy exams_select on public.exams for select to app_user using (user_id = public.current_app_user());
create policy exams_insert on public.exams for insert to app_user with check (user_id = public.current_app_user());
create policy exams_update on public.exams for update to app_user
  using (user_id = public.current_app_user()) with check (user_id = public.current_app_user());

create policy calendar_sources_select on public.calendar_sources for select to app_user using (user_id = public.current_app_user());
create policy calendar_sources_insert on public.calendar_sources for insert to app_user with check (user_id = public.current_app_user());
create policy calendar_sources_update on public.calendar_sources for update to app_user
  using (user_id = public.current_app_user()) with check (user_id = public.current_app_user());
