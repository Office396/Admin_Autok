-- ============================================================================
-- Autok legacy client compatibility (Old Autok tab)
-- ============================================================================
-- Old Autok EXEs predate the per-agent JWT and still connect with the public
-- anon key. After supabase_hardening.sql, anon has no access, so those clients
-- disappear from the portal and cannot receive LOCK/STOP/DESTRUCT commands.
--
-- This patch grants anon access ONLY to rows explicitly marked legacy_mode.
-- New agent-token clients are unaffected and keep the hardened per-machine RLS.
--
-- SECURITY NOTE: legacy_mode clients are inherently weaker (the anon key is
-- public and old EXEs cannot prove which machine they are). Treat this as a
-- migration bridge: move every machine to an agent token, then set
-- legacy_mode = false / revoke anon access again.
--
-- Safe to re-run. Run AFTER supabase_hardening.sql.
-- ============================================================================

begin;

grant usage on schema public to anon;

alter table public.machines add column if not exists legacy_mode boolean not null default false;
alter table public.machines add column if not exists reported_status text;

-- ---------------------------------------------------------------------------
-- 1. Keep admin-owned control fields safe from old (anon) clients
-- ---------------------------------------------------------------------------
create or replace function public.legacy_guard_machine_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    jwt_role text := coalesce(
        nullif(current_setting('request.jwt.claim.role', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
        ''
    );
begin
    if jwt_role = 'anon' then
        if tg_op = 'INSERT' then
            -- New rows written by an old EXE are legacy by definition.
            new.legacy_mode := true;
            new.status := 'ACTIVE';
            new.blocked := false;
            new.reported_status := null;
        elsif tg_op = 'UPDATE' then
            -- Old EXEs re-send status/blocked on every heartbeat. Keep the
            -- portal authoritative so a remote LOCK/STOP cannot be erased.
            new.mac_address := old.mac_address;
            new.status := old.status;
            new.blocked := old.blocked;
            new.legacy_mode := old.legacy_mode;
            new.reported_status := old.reported_status;
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists legacy_guard_machine_row on public.machines;
create trigger legacy_guard_machine_row
    before insert or update on public.machines
    for each row execute function public.legacy_guard_machine_row();

-- ---------------------------------------------------------------------------
-- 2. Classify old clients: no active agent token => legacy
-- ---------------------------------------------------------------------------
update public.machines m
   set legacy_mode = not exists (
       select 1
         from public.agents a
        where a.mac_address = m.mac_address
          and a.revoked = false
   )
 where m.mac_address not like 'BLOCKED_IP_%';

-- Registering/restoring an agent token graduates the machine out of legacy mode.
create or replace function public.agents_clear_legacy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if coalesce(new.revoked, false) = false then
        update public.machines
           set legacy_mode = false
         where mac_address = new.mac_address;
    end if;
    return new;
end;
$$;

drop trigger if exists agents_clear_legacy on public.agents;
create trigger agents_clear_legacy
    after insert or update of mac_address, revoked on public.agents
    for each row execute function public.agents_clear_legacy();

-- Helper used by the legacy policies. SECURITY DEFINER avoids RLS recursion.
create or replace function public.is_legacy_machine(p_mac text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
          from public.machines
         where mac_address = p_mac
           and legacy_mode = true
    );
$$;

grant execute on function public.is_legacy_machine(text) to anon;

-- ---------------------------------------------------------------------------
-- 3. Least-privilege anon grants + legacy-only policies
-- ---------------------------------------------------------------------------
-- Current agents also upsert the full machine row, including mac_address.
-- RLS still pins the new value to current_machine_id(), so this is safe.
grant update (mac_address, pc_name, username, public_ip, last_seen,
              current_session_id, reported_status, gateway_status, gateway_pid,
              background_running, hermes_installed, hermes_version,
              config_migrated, last_gateway_check)
    on public.machines to agent;

revoke all on public.machines from anon;
grant select on public.machines to anon;
grant insert (mac_address, pc_name, username, public_ip, last_seen,
              status, blocked, current_session_id, gateway_status, gateway_pid,
              background_running, hermes_installed, hermes_version,
              config_migrated, last_gateway_check)
    on public.machines to anon;
grant update (mac_address, pc_name, username, public_ip, last_seen,
              status, blocked, current_session_id, gateway_status, gateway_pid,
              background_running, hermes_installed, hermes_version,
              config_migrated, last_gateway_check)
    on public.machines to anon;

drop policy if exists "machines_legacy_anon_select" on public.machines;
drop policy if exists "machines_legacy_anon_insert" on public.machines;
drop policy if exists "machines_legacy_anon_update" on public.machines;
create policy "machines_legacy_anon_select" on public.machines
    for select to anon
    using (legacy_mode = true);
create policy "machines_legacy_anon_insert" on public.machines
    for insert to anon
    with check (legacy_mode = true);
create policy "machines_legacy_anon_update" on public.machines
    for update to anon
    using (legacy_mode = true)
    with check (legacy_mode = true);

-- Commands: legacy clients may only read/ack their own queued commands.
revoke all on public.commands from anon;
grant select on public.commands to anon;
grant update (executed) on public.commands to anon;
grant delete on public.commands to anon;

drop policy if exists "commands_legacy_anon_select" on public.commands;
drop policy if exists "commands_legacy_anon_update" on public.commands;
drop policy if exists "commands_legacy_anon_delete" on public.commands;
create policy "commands_legacy_anon_select" on public.commands
    for select to anon
    using (public.is_legacy_machine(mac_address));
create policy "commands_legacy_anon_update" on public.commands
    for update to anon
    using (public.is_legacy_machine(mac_address))
    with check (public.is_legacy_machine(mac_address));
create policy "commands_legacy_anon_delete" on public.commands
    for delete to anon
    using (public.is_legacy_machine(mac_address));

-- Sessions: old EXEs create/update their own session history rows.
revoke all on public.sessions from anon;
grant select, insert, update, delete on public.sessions to anon;

drop policy if exists "sessions_legacy_anon_select" on public.sessions;
drop policy if exists "sessions_legacy_anon_insert" on public.sessions;
drop policy if exists "sessions_legacy_anon_update" on public.sessions;
drop policy if exists "sessions_legacy_anon_delete" on public.sessions;
create policy "sessions_legacy_anon_select" on public.sessions
    for select to anon
    using (public.is_legacy_machine(mac_address));
create policy "sessions_legacy_anon_insert" on public.sessions
    for insert to anon
    with check (public.is_legacy_machine(mac_address));
create policy "sessions_legacy_anon_update" on public.sessions
    for update to anon
    using (public.is_legacy_machine(mac_address))
    with check (public.is_legacy_machine(mac_address));
create policy "sessions_legacy_anon_delete" on public.sessions
    for delete to anon
    using (public.is_legacy_machine(mac_address));

-- Error logs: old EXEs insert, read, and prune their own logs.
revoke all on public.error_logs from anon;
grant select, insert, update, delete on public.error_logs to anon;

drop policy if exists "error_logs_legacy_anon_select" on public.error_logs;
drop policy if exists "error_logs_legacy_anon_insert" on public.error_logs;
drop policy if exists "error_logs_legacy_anon_update" on public.error_logs;
drop policy if exists "error_logs_legacy_anon_delete" on public.error_logs;
create policy "error_logs_legacy_anon_select" on public.error_logs
    for select to anon
    using (public.is_legacy_machine(mac_address));
create policy "error_logs_legacy_anon_insert" on public.error_logs
    for insert to anon
    with check (public.is_legacy_machine(mac_address));
create policy "error_logs_legacy_anon_update" on public.error_logs
    for update to anon
    using (public.is_legacy_machine(mac_address))
    with check (public.is_legacy_machine(mac_address));
create policy "error_logs_legacy_anon_delete" on public.error_logs
    for delete to anon
    using (public.is_legacy_machine(mac_address));

-- Gateway telemetry: harmless if an old build does not use it yet.
revoke all on public.gateway_status from anon;
grant select, insert, update, delete on public.gateway_status to anon;

drop policy if exists "gateway_status_legacy_anon_select" on public.gateway_status;
drop policy if exists "gateway_status_legacy_anon_insert" on public.gateway_status;
drop policy if exists "gateway_status_legacy_anon_update" on public.gateway_status;
drop policy if exists "gateway_status_legacy_anon_delete" on public.gateway_status;
create policy "gateway_status_legacy_anon_select" on public.gateway_status
    for select to anon
    using (public.is_legacy_machine(mac_address));
create policy "gateway_status_legacy_anon_insert" on public.gateway_status
    for insert to anon
    with check (public.is_legacy_machine(mac_address));
create policy "gateway_status_legacy_anon_update" on public.gateway_status
    for update to anon
    using (public.is_legacy_machine(mac_address))
    with check (public.is_legacy_machine(mac_address));
create policy "gateway_status_legacy_anon_delete" on public.gateway_status
    for delete to anon
    using (public.is_legacy_machine(mac_address));

-- STOP/UNSTOP: old EXEs only read enabled state, never write it.
revoke all on public.software_enabled from anon;
grant select on public.software_enabled to anon;

drop policy if exists "software_enabled_legacy_anon_select" on public.software_enabled;
create policy "software_enabled_legacy_anon_select" on public.software_enabled
    for select to anon
    using (
        mac_address = 'GLOBAL_ALL'
        or public.is_legacy_machine(mac_address)
    );

-- ---------------------------------------------------------------------------
-- 8. Persistent STOP ALL for old clients
-- ---------------------------------------------------------------------------
-- Old EXEs cannot read a "stop all" flag of their own, so the portal writes
-- LEGACY_ALL plus a software_enabled row for every known legacy MAC. This
-- trigger makes a reinstall / new legacy MAC inherit the same stop state.
insert into public.software_enabled (mac_address, enabled)
values ('LEGACY_ALL', true)
on conflict (mac_address) do nothing;

create or replace function public.legacy_inherit_stop_all()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.legacy_mode = true then
        if exists (
            select 1
              from public.software_enabled
             where mac_address = 'LEGACY_ALL'
               and enabled = false
        ) then
            insert into public.software_enabled (mac_address, enabled)
            values (new.mac_address, false)
            on conflict (mac_address) do update set enabled = false;
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists legacy_inherit_stop_all on public.machines;
create trigger legacy_inherit_stop_all
    after insert or update of mac_address, legacy_mode on public.machines
    for each row execute function public.legacy_inherit_stop_all();

-- Old EXEs still call the login/verification RPCs with the anon key. Bcrypt
-- (cost 12) rate-limits guessing, but legacy clients should be migrated.
grant execute on function public.verify_terminal_password(text, text) to anon;
grant execute on function public.verify_handler_password(text) to anon;
grant execute on function public.terminal_login_info() to anon;
grant execute on function public.is_ip_blocked(text) to anon;

commit;

-- Verify:
--   select mac_address, pc_name, legacy_mode, last_seen
--     from public.machines
--    where mac_address not like 'BLOCKED_IP_%'
--    order by last_seen desc;
