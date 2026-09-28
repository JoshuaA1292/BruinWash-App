-- Local-only stubs that emulate the parts of a Supabase instance our
-- migrations depend on. Never applied to a real project.
create role anon              nologin;
create role authenticated     nologin;
create role service_role      nologin bypassrls;

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists net;

create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at         timestamptz default now()
);

-- Test harness swaps the acting user by setting request.jwt.claim.sub.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table storage.buckets (
  id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text, owner uuid, created_at timestamptz default now()
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

-- pg_net stand-in: record the call instead of making it.
create table net.calls (id bigserial primary key, url text, body jsonb, at timestamptz default now());
create or replace function net.http_post(
  url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000
) returns bigint
language plpgsql as $$
begin
  insert into net.calls (url, body) values (url, body);
  return 1;
end $$;

create publication supabase_realtime;

grant usage on schema public, auth, storage to anon, authenticated, service_role;

-- Supabase grants authenticated broad access to storage.objects and relies on
-- bucket policies to restrict it. Mirror that so the tests exercise the policies.
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;

-- Supabase grants broad table privileges to anon/authenticated and relies on
-- RLS to restrict rows. Mirror that here so our tests exercise RLS, not GRANTs.
alter default privileges in schema public grant all on tables    to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
