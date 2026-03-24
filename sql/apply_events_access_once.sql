/*
  =============================================================================
  APLICAR UMA VEZ no Supabase → SQL Editor → Run (ficheiro inteiro)
  =============================================================================
  Resolve: perfil sem todos os eventos; admin sem fila de aprovação (RLS a
  bloquear SELECT). O app chama estas funções RPC; o cliente anon não consegue
  contornar RLS só com JavaScript.

  Requer: public.is_current_user_admin() já existir (como no projeto).
*/

-- ========== RPCs (SECURITY DEFINER — leem events sem depender de RLS) ==========

create or replace function public.get_my_published_events(p_limit int default 10)
returns setof public.events
language sql
stable
security definer
set search_path = public
as $$
  select e.*
  from public.events e
  where e.user_id = auth.uid()
    and e.date is not null
    and e.date >= current_date
  order by e.created_at desc nulls last, e.id desc
  limit greatest(1, least(coalesce(p_limit, 10), 500));
$$;

grant execute on function public.get_my_published_events(int) to authenticated;

create or replace function public.count_my_published_events()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint
  from public.events
  where user_id = auth.uid()
    and date is not null
    and date >= current_date;
$$;

grant execute on function public.count_my_published_events() to authenticated;

create or replace function public.admin_list_pending_events()
returns setof public.events
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_current_user_admin(), false) then
    raise exception 'Acesso negado (admin): is_current_user_admin() = false' using errcode = '42501';
  end if;
  return query
    select e.*
    from public.events e
    where lower(trim(coalesce(e.payment_status::text, ''))) in ('pending', 'awaiting_payment')
    order by e.date asc nulls last, e.id asc;
end;
$$;

grant execute on function public.admin_list_pending_events() to authenticated;

create or replace function public.admin_events_dashboard_stats()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pending bigint;
  v_total bigint;
  v_today bigint;
begin
  if not coalesce(public.is_current_user_admin(), false) then
    return json_build_object(
      'is_admin', false,
      'pending', 0,
      'total', 0,
      'today', 0
    );
  end if;

  select count(*) into v_pending
  from public.events
  where lower(trim(coalesce(payment_status::text, ''))) in ('pending', 'awaiting_payment');

  select count(*) into v_total from public.events;

  select count(*) into v_today
  from public.events e
  where (e.date)::date = (current_timestamp at time zone 'America/Fortaleza')::date;

  return json_build_object(
    'is_admin', true,
    'pending', v_pending,
    'total', v_total,
    'today', v_today
  );
end;
$$;

grant execute on function public.admin_events_dashboard_stats() to authenticated;

-- ========== Políticas RLS (recomendado — ajuda consultas .from() quando não há RPC) ==========
-- Não activamos RLS aqui (evita bloquear INSERT se a tabela ainda não tiver políticas de insert).

drop policy if exists "events_select_owner_own_rows" on public.events;
create policy "events_select_owner_own_rows"
  on public.events for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "events_select_admin_all" on public.events;
create policy "events_select_admin_all"
  on public.events for select to authenticated
  using (coalesce(is_current_user_admin(), false));

drop policy if exists "events_update_owner_own_rows" on public.events;
create policy "events_update_owner_own_rows"
  on public.events for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "events_update_admin_all" on public.events;
create policy "events_update_admin_all"
  on public.events for update to authenticated
  using (coalesce(is_current_user_admin(), false))
  with check (coalesce(is_current_user_admin(), false));

drop policy if exists "events_delete_admin_all" on public.events;
create policy "events_delete_admin_all"
  on public.events for delete to authenticated
  using (coalesce(is_current_user_admin(), false));
