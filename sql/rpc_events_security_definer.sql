/*
================================================================================
  OPCIONAL — o app NÃO depende destas funções (usa só supabase.from no cliente).
================================================================================

  Só use se quiser RPCs com SECURITY DEFINER para contornar RLS sem mexer em
  políticas. Não é necessário rodar isto para o WebPipa funcionar.

  Requer: função `public.is_current_user_admin()` já existente (como no app).
*/

--- COPIE DAQUI ---

-- Lista “meus eventos publicados” (perfil) — sempre inclui free / awaiting / paid
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
  limit greatest(1, least(coalesce(p_limit, 10), 100));
$$;

grant execute on function public.get_my_published_events(int) to authenticated;

-- Contador do card “Eventos criados” no perfil
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

-- Fila de aprovação (admin)
create or replace function public.admin_list_pending_events()
returns setof public.events
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_current_user_admin(), false) then
    raise exception 'Acesso negado: is_current_user_admin() retornou false para este usuário. Marque seu usuário como admin na tabela/critério que essa função usa.' using errcode = '42501';
  end if;
  return query
    select e.*
    from public.events e
    where lower(trim(coalesce(e.payment_status::text, ''))) in ('pending', 'awaiting_payment')
    order by e.date asc nulls last, e.id asc;
end;
$$;

grant execute on function public.admin_list_pending_events() to authenticated;

-- Contadores do painel admin (pendentes, total, hoje — data local do servidor)
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
      'today', 0,
      'hint', 'Conta não é admin em is_current_user_admin() — corrija no Supabase ou ajuste a função.'
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

--- ATÉ AQUI ---
