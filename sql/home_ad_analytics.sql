-- =============================================================================
-- Métricas do banner na home (impressões, alcance, cliques)
-- Rode no SQL Editor do Supabase após home_advertising.sql.
-- Requer: public.is_current_user_admin()
-- =============================================================================

create table if not exists public.home_ad_events (
  id bigserial primary key,
  ad_id uuid not null references public.home_advertising (id) on delete cascade,
  viewer_key text not null,
  event_kind text not null,
  created_at timestamptz not null default now(),
  constraint home_ad_events_kind_ok check (event_kind in ('impression', 'click')),
  constraint home_ad_events_viewer_len check (char_length(viewer_key) between 8 and 256)
);

create index if not exists home_ad_events_ad_kind_idx
  on public.home_ad_events (ad_id, event_kind);

create index if not exists home_ad_events_ad_created_idx
  on public.home_ad_events (ad_id, created_at desc);

comment on table public.home_ad_events is
  'Eventos de publicidade: impression (cada exibição) e click. viewer_key = u:<uuid> autenticado ou a:<uuid> anónimo (localStorage).';

alter table public.home_ad_events enable row level security;

-- Sem políticas: escrita só via RPC security definer; leitura só via admin_home_ad_stats.

-- Registo público (anon + autenticado): só se a campanha estiver visível na home hoje (SP).
create or replace function public.record_home_ad_event(
  p_ad_id uuid,
  p_kind text,
  p_viewer_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (timezone('America/Sao_Paulo', now()))::date;
  v_key text;
  v_last timestamptz;
begin
  if p_ad_id is null then
    return;
  end if;

  if p_kind is null or p_kind not in ('impression', 'click') then
    return;
  end if;

  v_key := trim(coalesce(p_viewer_key, ''));
  if length(v_key) < 8 or length(v_key) > 256 then
    return;
  end if;

  if not exists (
    select 1
    from public.home_advertising ha
    where ha.id = p_ad_id
      and ha.is_active = true
      and v_today >= ha.start_date
      and v_today <= ha.end_date
  ) then
    return;
  end if;

  if p_kind = 'impression' then
    select max(created_at) into v_last
    from public.home_ad_events
    where ad_id = p_ad_id
      and viewer_key = v_key
      and event_kind = 'impression';

    if v_last is not null and now() - v_last < interval '30 seconds' then
      return;
    end if;
  elsif p_kind = 'click' then
    select max(created_at) into v_last
    from public.home_ad_events
    where ad_id = p_ad_id
      and viewer_key = v_key
      and event_kind = 'click';

    if v_last is not null and now() - v_last < interval '2 seconds' then
      return;
    end if;
  end if;

  insert into public.home_ad_events (ad_id, viewer_key, event_kind)
  values (p_ad_id, v_key, p_kind);
end;
$$;

comment on function public.record_home_ad_event is
  'Regista impressão ou clique no banner; ignora IDs inválidos ou campanhas fora do ar.';

grant execute on function public.record_home_ad_event(uuid, text, text) to anon, authenticated;

-- Estatísticas agregadas (só admin).
create or replace function public.admin_home_ad_stats(p_ad_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_imp bigint;
  v_uni bigint;
  v_clk bigint;
begin
  if not coalesce(public.is_current_user_admin(), false) then
    return json_build_object('ok', false, 'error', 'denied');
  end if;

  if p_ad_id is null or not exists (select 1 from public.home_advertising where id = p_ad_id) then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;

  select count(*)::bigint into v_imp
  from public.home_ad_events
  where ad_id = p_ad_id and event_kind = 'impression';

  select count(distinct viewer_key)::bigint into v_uni
  from public.home_ad_events
  where ad_id = p_ad_id and event_kind = 'impression';

  select count(*)::bigint into v_clk
  from public.home_ad_events
  where ad_id = p_ad_id and event_kind = 'click';

  return json_build_object(
    'ok', true,
    'impressions', coalesce(v_imp, 0),
    'unique_viewers', coalesce(v_uni, 0),
    'clicks', coalesce(v_clk, 0)
  );
end;
$$;

grant execute on function public.admin_home_ad_stats(uuid) to authenticated;
