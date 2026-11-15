-- ============================================================================
-- Autok / Admin Supabase hardening migration
-- ============================================================================
-- Replaces the permissive "USING (true)" policies with role-scoped RLS:
--   * anon                -> no access at all
--   * authenticated       -> only users whose email is in public.admins
--   * agent               -> per-machine JWT, scoped to its own mac_address
--
-- Prerequisites:
--   1. Run this in the Supabase SQL editor (runs as postgres/owner).
--   2. Add your admin login email(s) to public.admins (see bootstrap below).
--   3. Mint an agent token per machine with scripts/issue_agent_token.py and
--      register it in public.agents (the script prints the exact SQL).
--   4. Set SUPABASE_AGENT_TOKEN on each agent and SUPABASE_TOKEN on AdminPanel.
--   5. If pre-agent-token ("old exe") clients must keep working, run
--      supabase_legacy_clients.sql AFTER this file. It scopes anon access to
--      rows marked legacy_mode = true and leaves new agents hardened.
--
-- Safe to re-run (idempotent).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. Database roles
-- ---------------------------------------------------------------------------
do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'agent') then
        execute 'create role agent nologin';
    end if;
end
$$;

-- PostgREST switches into the role named by the JWT "role" claim.
grant agent to authenticator;

-- ---------------------------------------------------------------------------
-- 1. Admin allowlist + helpers
-- ---------------------------------------------------------------------------
create table if not exists public.admins (
    email       text primary key,
    created_at  timestamptz not null default now()
);

alter table public.admins enable row level security;

-- Admins are identified by a Supabase Auth user whose email is allow-listed,
-- or by a token carrying app_metadata.role = "admin".
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

-- Bootstrap: add your admin email once.
-- insert into public.admins(email) values ('you@example.com')
-- on conflict (email) do nothing;

drop policy if exists "admins_admin_all" on public.admins;
create policy "admins_admin_all" on public.admins
    for all to authenticated
    using (public.is_admin())
    with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. Agent registry + helpers
-- ---------------------------------------------------------------------------
create table if not exists public.agents (
    mac_address  text primary key,
    token_id     uuid not null default gen_random_uuid(),
    label        text,
    revoked      boolean not null default false,
    created_at   timestamptz not null default now()
);

alter table public.agents enable row level security;

create or replace function public.current_machine_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(auth.jwt() ->> 'machine_id', '');
$$;

create or replace function public.is_active_agent()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.agents a
        where a.mac_address = auth.jwt() ->> 'machine_id'
          and a.token_id::text = auth.jwt() ->> 'agent_token_id'
          and a.revoked = false
    );
$$;

<<<<<<< HEAD
=======
alter table public.machines
    add column if not exists block_scope text not null default 'all';

>>>>>>> e74106a (Initial commit: separate old/new Autok identity and scoped IP blocks)
-- Agents must not read other machines' rows, but they still need the
-- "permanently blocked IP" check. Expose only a boolean through a
-- security-definer RPC.
create or replace function public.is_ip_blocked(p_ip text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.machines m
        where m.public_ip = p_ip
          and (m.status = 'DESTRUCTED' or m.blocked = true)
          and m.mac_address like 'BLOCKED_IP_%'
<<<<<<< HEAD
=======
          and case
              when auth.jwt() ->> 'role' = 'anon'
                  then m.block_scope in ('legacy', 'all')
              when auth.jwt() ->> 'role' = 'agent'
                  then m.block_scope in ('agent', 'all')
              else true
          end
>>>>>>> e74106a (Initial commit: separate old/new Autok identity and scoped IP blocks)
    );
$$;

grant execute on function public.is_ip_blocked(text) to agent;

drop policy if exists "agents_admin_all" on public.agents;
create policy "agents_admin_all" on public.agents
    for all to authenticated
    using (public.is_admin())
    with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. Deny anon everywhere, then grant least privilege
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

alter table public.machines add column if not exists reported_status text;

grant usage on schema public to authenticated, agent;

-- Admins (authenticated) keep full access, gated by RLS.
grant select, insert, update, delete on public.admins to authenticated;
grant select, insert, update, delete on public.agents to authenticated;
grant select, insert, update, delete on public.machines to authenticated;
grant select, insert, update, delete on public.commands to authenticated;
grant select, insert, update, delete on public.sessions to authenticated;
grant select, insert, update, delete on public.error_logs to authenticated;
grant select, insert, update, delete on public.gateway_status to authenticated;
grant select, insert, update, delete on public.hermes_operations_log to authenticated;
grant select, insert, update, delete on public.software_enabled to authenticated;
grant select, insert, update, delete on public.global_credentials to authenticated;

-- Agents: read control state, write only their own operational fields.
-- They must NOT be able to clear blocked/status or flip software_enabled.
grant select on public.machines to agent;
grant insert (mac_address, pc_name, username, public_ip, last_seen,
              current_session_id, reported_status, gateway_status, gateway_pid,
              background_running, hermes_installed, hermes_version,
              config_migrated, last_gateway_check)
    on public.machines to agent;
grant update (mac_address, pc_name, username, public_ip, last_seen, current_session_id,
              reported_status, gateway_status, gateway_pid, background_running,
              hermes_installed, hermes_version, config_migrated,
              last_gateway_check)
    on public.machines to agent;
grant select on public.commands to agent;
grant update (executed) on public.commands to agent;
grant select, insert, update on public.sessions to agent;
grant select, insert, delete on public.error_logs to agent;
grant select, insert, update on public.gateway_status to agent;
grant select, insert on public.hermes_operations_log to agent;
grant select on public.software_enabled to agent;

-- ---------------------------------------------------------------------------
-- 4. Replace permissive policies (admin policy + scoped agent policy per table)
-- ---------------------------------------------------------------------------
drop policy if exists "Allow all access to machines" on public.machines;
drop policy if exists "machines_admin_all" on public.machines;
drop policy if exists "machines_agent_select" on public.machines;
drop policy if exists "machines_agent_insert" on public.machines;
drop policy if exists "machines_agent_update" on public.machines;
create policy "machines_admin_all" on public.machines
    for all to authenticated
    using (public.is_admin())
    with check (public.is_admin());
create policy "machines_agent_select" on public.machines
    for select to agent
    using (public.is_active_agent() and mac_address = public.current_machine_id());
create policy "machines_agent_insert" on public.machines
    for insert to agent
    with check (public.is_active_agent() and mac_address = public.current_machine_id());
create policy "machines_agent_update" on public.machines
    for update to agent
    using (public.is_active_agent() and mac_address = public.current_machine_id())
    with check (public.is_active_agent() and mac_address = public.current_machine_id());

drop policy if exists "Allow all access to commands" on public.commands;
drop policy if exists "commands_admin_all" on public.commands;
drop policy if exists "commands_agent_select" on public.commands;
drop policy if exists "commands_agent_update" on public.commands;
create policy "commands_admin_all" on public.commands
    for all to authenticated
    using (public.is_admin())
    with check (public.is_admin());
create policy "commands_agent_select" on public.commands
    for select to agent
    using (public.is_active_agent() and mac_address = public.current_machine_id());
create policy "commands_agent_update" on public.commands
    for update to agent
    using (public.is_active_agent() and mac_address = public.current_machine_id())
    with check (public.is_active_agent() and mac_address = public.current_machine_id());

drop policy if exists "Allow all access to sessions" on public.sessions;
drop policy if exists "sessions_admin_all" on public.sessions;
drop policy if exists "sessions_agent_select" on public.sessions;
drop policy if exists "sessions_agent_insert" on public.sessions;
drop policy if exists "sessions_agent_update" on public.sessions;
create policy "sessions_admin_all" on public.sessions
    for all to authenticated
    using (public.is_admin())
    with check (public.is_admin());
create policy "sessions_agent_select" on public.sessions
    for select to agent
    using (public.is_active_agent() and mac_address = public.current_machine_id());
create policy "sessions_agent_insert" on public.sessions
    for insert to agent
    with check (public.is_active_agent() and mac_address = public.current_machine_id());
create policy "sessions_agent_update" on public.sessions
    for update to agent
    using (public.is_active_agent() and mac_address = public.current_machine_id())
    with check (public.is_active_agent() and mac_address = public.current_machine_id());

drop policy if exists "Allow all access to error_logs" on public.error_logs;
drop policy if exists "error_logs_admin_all" on public.error_logs;
drop policy if exists "error_logs_agent_select" on public.error_logs;
drop policy if exists "error_logs_agent_insert" on public.error_logs;
drop policy if exists "error_logs_agent_delete" on public.error_logs;
create policy "error_logs_admin_all" on public.error_logs
    for all to authenticated
    using (public.is_admin())
    with check (public.is_admin());
create policy "error_logs_agent_select" on public.error_logs
    for select to agent
    using (public.is_active_agent() and mac_address = public.current_machine_id());
create policy "error_logs_agent_insert" on public.error_logs
    for insert to agent
    with check (public.is_active_agent() and mac_address = public.current_machine_id());
create policy "error_logs_agent_delete" on public.error_logs
    for delete to agent
    using (public.is_active_agent() and mac_address = public.current_machine_id());

drop policy if exists "Allow all access to gateway_status" on public.gateway_status;
drop policy if exists "gateway_status_admin_all" on public.gateway_status;
drop policy if exists "gateway_status_agent_select" on public.gateway_status;
drop policy if exists "gateway_status_agent_insert" on public.gateway_status;
drop policy if exists "gateway_status_agent_update" on public.gateway_status;
create policy "gateway_status_admin_all" on public.gateway_status
    for all to authenticated
    using (public.is_admin())
    with check (public.is_admin());
create policy "gateway_status_agent_select" on public.gateway_status
    for select to agent
    using (public.is_active_agent() and mac_address = public.current_machine_id());
create policy "gateway_status_agent_insert" on public.gateway_status
    for insert to agent
    with check (public.is_active_agent() and mac_address = public.current_machine_id());
create policy "gateway_status_agent_update" on public.gateway_status
    for update to agent
    using (public.is_active_agent() and mac_address = public.current_machine_id())
    with check (public.is_active_agent() and mac_address = public.current_machine_id());

drop policy if exists "Allow all access to hermes_operations_log" on public.hermes_operations_log;
drop policy if exists "hermes_operations_log_admin_all" on public.hermes_operations_log;
drop policy if exists "hermes_operations_log_agent_select" on public.hermes_operations_log;
drop policy if exists "hermes_operations_log_agent_insert" on public.hermes_operations_log;
create policy "hermes_operations_log_admin_all" on public.hermes_operations_log
    for all to authenticated
    using (public.is_admin())
    with check (public.is_admin());
create policy "hermes_operations_log_agent_select" on public.hermes_operations_log
    for select to agent
    using (public.is_active_agent() and mac_address = public.current_machine_id());
create policy "hermes_operations_log_agent_insert" on public.hermes_operations_log
    for insert to agent
    with check (public.is_active_agent() and mac_address = public.current_machine_id());

drop policy if exists "Allow all access to software_enabled" on public.software_enabled;
drop policy if exists "software_enabled_admin_all" on public.software_enabled;
drop policy if exists "software_enabled_agent_select" on public.software_enabled;
drop policy if exists "software_enabled_agent_insert" on public.software_enabled;
drop policy if exists "software_enabled_agent_update" on public.software_enabled;
create policy "software_enabled_admin_all" on public.software_enabled
    for all to authenticated
    using (public.is_admin())
    with check (public.is_admin());
create policy "software_enabled_agent_select" on public.software_enabled
    for select to agent
    using (
        public.is_active_agent()
        and (mac_address = public.current_machine_id() or mac_address = 'GLOBAL_ALL')
    );

drop policy if exists "Allow all access to global_credentials" on public.global_credentials;
drop policy if exists "global_credentials_admin_all" on public.global_credentials;
create policy "global_credentials_admin_all" on public.global_credentials
    for all to authenticated
    using (public.is_admin())
    with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. Server-authoritative passwords + entitlement
-- ---------------------------------------------------------------------------
-- The client never stores or sends a reusable plaintext password. The admin
-- portal sets a bcrypt hash; the agent only asks "is this password valid?".
create extension if not exists pgcrypto with schema extensions;
alter table public.global_credentials add column if not exists password_hash text;

create or replace function public.set_terminal_password(p_username text, p_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_admin() then
        raise exception 'not authorized';
    end if;
    if p_username is null or length(p_username) < 1 or length(p_username) > 128 then
        raise exception 'invalid username';
    end if;
    if p_password is null or length(p_password) < 6 or length(p_password) > 128 then
        raise exception 'password must be 6-128 characters';
    end if;

    insert into public.global_credentials
        (credential_type, username, password, password_hash, updated_at)
    values
        ('terminal_login', p_username, '',
         extensions.crypt(p_password, extensions.gen_salt('bf', 12)), now())
    on conflict (credential_type) do update
        set username = excluded.username,
            password = '',
            password_hash = excluded.password_hash,
            updated_at = now();
end;
$$;

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

create or replace function public.verify_terminal_password(p_username text, p_password text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select public.is_active_agent()
    and exists (
        select 1
        from public.global_credentials g
        where g.credential_type = 'terminal_login'
          and g.username = p_username
          and g.password_hash is not null
          and extensions.crypt(p_password, g.password_hash) = g.password_hash
    );
$$;

create or replace function public.verify_handler_password(p_password text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select public.is_active_agent()
    and exists (
        select 1
        from public.global_credentials g
        where g.credential_type = 'handler'
          and g.password_hash is not null
          and extensions.crypt(p_password, g.password_hash) = g.password_hash
    );
$$;

-- Username + "is a password configured" for the login screen. Never the hash.
create or replace function public.terminal_login_info()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    select jsonb_build_object(
        'username', coalesce((
            select g.username from public.global_credentials g
            where g.credential_type = 'terminal_login'
        ), ''),
        'password_set', exists (
            select 1 from public.global_credentials g
            where g.credential_type = 'terminal_login'
              and g.password_hash is not null
        )
    );
$$;

-- Single heartbeat that tells the agent what the admin currently allows.
create or replace function public.agent_entitlement()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    select jsonb_build_object(
        'active', public.is_active_agent(),
        'machine_id', coalesce(auth.jwt() ->> 'machine_id', ''),
        'blocked', coalesce((
            select m.blocked from public.machines m
            where m.mac_address = auth.jwt() ->> 'machine_id'
        ), false),
        'status', coalesce((
            select m.status from public.machines m
            where m.mac_address = auth.jwt() ->> 'machine_id'
        ), ''),
        'software_enabled', coalesce((
<<<<<<< HEAD
            select case
                when exists (
                    select 1 from public.software_enabled s
                    where s.mac_address = 'GLOBAL_ALL' and s.enabled = false
                ) then false
                else coalesce((
                    select s.enabled from public.software_enabled s
                    where s.mac_address = auth.jwt() ->> 'machine_id'
                ), true)
            end
=======
            select s.enabled from public.software_enabled s
            where s.mac_address = auth.jwt() ->> 'machine_id'
>>>>>>> e74106a (Initial commit: separate old/new Autok identity and scoped IP blocks)
        ), true)
    );
$$;

-- Agents may only ever mark themselves DESTRUCTED, never clear a block.
create or replace function public.mark_self_destructed()
returns void
language sql
security definer
set search_path = public
as $$
    update public.machines
       set status = 'DESTRUCTED',
           blocked = true,
           last_seen = now()
     where mac_address = auth.jwt() ->> 'machine_id'
       and public.is_active_agent();
$$;

-- Remove legacy plaintext once a hash exists (the admin sets it in the portal).
update public.global_credentials
   set password = ''
 where password_hash is not null
   and password <> '';

revoke all on function public.set_terminal_password(text, text) from public, anon, agent;
revoke all on function public.set_handler_password(text) from public, anon, agent;revoke all on function public.verify_terminal_password(text, text) from public, anon, authenticated;
revoke all on function public.verify_handler_password(text) from public, anon, authenticated;
revoke all on function public.terminal_login_info() from public, anon, authenticated;
revoke all on function public.agent_entitlement() from public, anon, authenticated;
revoke all on function public.mark_self_destructed() from public, anon, authenticated;

grant execute on function public.set_terminal_password(text, text) to authenticated;
grant execute on function public.set_handler_password(text) to authenticated;
grant execute on function public.verify_terminal_password(text, text) to agent;
grant execute on function public.verify_handler_password(text) to agent;
grant execute on function public.terminal_login_info() to agent;
grant execute on function public.agent_entitlement() to agent;
grant execute on function public.mark_self_destructed() to agent;

commit;

-- ============================================================================
-- Post-migration checklist
-- ============================================================================
-- 1) insert into public.admins(email) values ('you@example.com') on conflict do nothing;
-- 2) For each machine, mint + register an agent token (offline):
--      python scripts/issue_agent_token.py --secret "<JWT_SECRET>" --machine-id aa:bb:cc:dd:ee:ff
--    then set SUPABASE_AGENT_TOKEN to that token on the machine.
-- 3) For the Tkinter AdminPanel, mint an admin token:
--      python scripts/issue_agent_token.py --secret "<JWT_SECRET>" --admin-email you@example.com
--    then set SUPABASE_TOKEN to that token.
-- 4) Keep the anon key only for the Supabase Auth login flow in the web panel.
