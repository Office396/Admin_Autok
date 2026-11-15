-- Run this AFTER supabase_hardening.sql and supabase_legacy_clients.sql.
-- New Autok installs use machine_id NEW:<physical-mac>. Old EXEs keep the
-- physical MAC, so the two identities can be stopped/destructed independently.

begin;

alter table public.machines
    add column if not exists block_scope text not null default 'all';

update public.machines b
   set block_scope = case
       when exists (
           select 1
             from public.machines m
            where m.public_ip = b.public_ip
              and m.legacy_mode = true
              and m.mac_address not like 'BLOCKED_IP_%'
       ) then 'legacy'
       else 'agent'
   end
 where b.mac_address like 'BLOCKED_IP_%'
   and b.block_scope = 'all';

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
           and m.mac_address like 'BLOCKED_IP_%'
           and (m.status = 'DESTRUCTED' or m.blocked = true)
           and case
               when auth.jwt() ->> 'role' = 'anon'
                   then m.block_scope in ('legacy', 'all')
               when auth.jwt() ->> 'role' = 'agent'
                   then m.block_scope in ('agent', 'all')
               else true
           end
    );
$$;

grant execute on function public.is_ip_blocked(text) to anon, agent;

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
            select s.enabled from public.software_enabled s
            where s.mac_address = auth.jwt() ->> 'machine_id'
        ), true)
    );
$$;

revoke all on function public.agent_entitlement() from public, anon, authenticated;
grant execute on function public.agent_entitlement() to agent;

commit;
