-- ============================================================================
-- Handler-tab password: online bcrypt set/verify
-- ============================================================================
-- Use this ONLY if you have not run supabase_hardening.sql yet. It lets you
-- change the Handler password from the admin portal without revoking the anon
-- key, so existing customer apps keep working.
--
-- If you already ran supabase_hardening.sql, do NOT run this; use the admin
-- portal directly.
--
-- Safe to re-run.
-- ============================================================================

begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.admins (
    email       text primary key,
    created_at  timestamptz not null default now()
);

alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.admins a
        where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

alter table public.global_credentials add column if not exists password_hash text;

create or replace function public.set_handler_password(p_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_admin() then
        raise exception 'not authorized';
    end if;
    if p_password is null or length(p_password) < 6 or length(p_password) > 128 then
        raise exception 'password must be 6-128 characters';
    end if;

    insert into public.global_credentials
        (credential_type, username, password, password_hash, updated_at)
    values
        ('handler', 'handler', '',
         extensions.crypt(p_password, extensions.gen_salt('bf', 12)), now())
    on conflict (credential_type) do update
        set username = excluded.username,
            password = '',
            password_hash = excluded.password_hash,
            updated_at = now();
end;
$$;

-- Interim version: no active-agent check yet, because current installs still
-- use the shared anon key. The full hardening migration replaces this.
create or replace function public.verify_handler_password(p_password text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.global_credentials g
        where g.credential_type = 'handler'
          and g.password_hash is not null
          and extensions.crypt(p_password, g.password_hash) = g.password_hash
    );
$$;

revoke all on function public.set_handler_password(text) from public, anon, authenticated;
revoke all on function public.verify_handler_password(text) from public, anon, authenticated;

grant execute on function public.set_handler_password(text) to authenticated;
grant execute on function public.verify_handler_password(text) to anon, authenticated;

-- Add your admin login email (replace and uncomment):
-- insert into public.admins(email) values ('you@example.com')
-- on conflict (email) do nothing;

commit;
