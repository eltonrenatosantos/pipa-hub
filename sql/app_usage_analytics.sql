-- =============================================================================
-- Analytics de uso do app
-- DAU / MAU / novos usuários / eventos criados / visualizações de eventos
-- Rode no SQL Editor do Supabase depois de criar a tabela de eventos.
-- Requer: public.is_current_user_admin()
-- =============================================================================

create table if not exists public.app_usage_events (
  id bigserial primary key,
  event_kind text not null,
  viewer_key text not null,
  target_event_id uuid references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint app_usage_events_kind_ok check (event_kind in ('app_open', 'event_view')),
  constraint app_usage_events_viewer_len check (char_length(viewer_key) between 8 and 256)
);

create index if not exists app_usage_events_kind_created_idx
  on public.app_usage_events (event_kind, created_at desc);

create index if not exists app_usage_events_viewer_kind_created_idx
  on public.app_usage_events (viewer_key, event_kind, created_at desc);

create index if not exists app_usage_events_target_created_idx
  on public.app_usage_events (target_event_id, created_at desc);

comment on table public.app_usage_events is
  'Eventos de uso do app: app_open para abertura do app e event_view para visualização de evento. viewer_key = u:<uuid> autenticado ou a:<uuid> anónimo.';

alter table public.app_usage_events enable row level security;

-- Registro público de uso do app.
create or replace function public.record_app_usage_event(
  p_kind text,
  p_viewer_key text,
  p_target_event_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := lower(trim(coalesce(p_kind, '')));
  v_viewer_key text := trim(coalesce(p_viewer_key, ''));
  v_now_sp timestamp := timezone('America/Sao_Paulo', now());
  v_today_start_sp timestamp := date_trunc('day', v_now_sp);
begin
  if v_kind not in ('app_open', 'event_view') then
    return;
  end if;

  if char_length(v_viewer_key) < 8 or char_length(v_viewer_key) > 256 then
    return;
  end if;

  if v_kind = 'app_open' then
    if exists (
      select 1
      from public.app_usage_events e
      where e.event_kind = 'app_open'
        and e.viewer_key = v_viewer_key
        and timezone('America/Sao_Paulo', e.created_at) >= v_today_start_sp
    ) then
      return;
    end if;

    insert into public.app_usage_events (event_kind, viewer_key)
    values (v_kind, v_viewer_key);
    return;
  end if;

  if p_target_event_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.events
    where id = p_target_event_id
  ) then
    return;
  end if;

  insert into public.app_usage_events (event_kind, viewer_key, target_event_id)
  values (v_kind, v_viewer_key, p_target_event_id);
end;
$$;

comment on function public.record_app_usage_event(text, text, uuid) is
  'Regista abertura do app ou visualização de evento, com dedupe diário por viewer no app_open.';

revoke all on function public.record_app_usage_event(text, text, uuid) from public;
grant execute on function public.record_app_usage_event(text, text, uuid) to anon, authenticated;

-- Painel admin resumido.
create or replace function public.admin_usage_dashboard_stats()
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_now_sp timestamp := timezone('America/Sao_Paulo', now());
  v_today_start_sp timestamp := date_trunc('day', v_now_sp);
  v_week_start_sp timestamp := date_trunc('week', v_now_sp);
  v_month_start_sp timestamp := date_trunc('month', v_now_sp);
  v_dau bigint := 0;
  v_mau bigint := 0;
  v_new_users_week bigint := 0;
  v_new_users_month bigint := 0;
  v_events_created_day bigint := 0;
  v_events_created_month bigint := 0;
  v_total_event_views bigint := 0;
begin
  if not coalesce(public.is_current_user_admin(), false) then
    return json_build_object('ok', false, 'error', 'denied');
  end if;

  select count(distinct e.viewer_key)::bigint
  into v_dau
  from public.app_usage_events e
  where e.event_kind = 'app_open'
    and timezone('America/Sao_Paulo', e.created_at) >= v_today_start_sp;

  select count(distinct e.viewer_key)::bigint
  into v_mau
  from public.app_usage_events e
  where e.event_kind = 'app_open'
    and timezone('America/Sao_Paulo', e.created_at) >= v_month_start_sp;

  select count(*)::bigint
  into v_new_users_week
  from auth.users u
  where timezone('America/Sao_Paulo', u.created_at) >= v_week_start_sp;

  select count(*)::bigint
  into v_new_users_month
  from auth.users u
  where timezone('America/Sao_Paulo', u.created_at) >= v_month_start_sp;

  select count(*)::bigint
  into v_events_created_day
  from public.events ev
  where timezone('America/Sao_Paulo', ev.created_at) >= v_today_start_sp;

  select count(*)::bigint
  into v_events_created_month
  from public.events ev
  where timezone('America/Sao_Paulo', ev.created_at) >= v_month_start_sp;

  select count(*)::bigint
  into v_total_event_views
  from public.app_usage_events e
  where e.event_kind = 'event_view';

  return json_build_object(
    'ok', true,
    'dau', coalesce(v_dau, 0),
    'mau', coalesce(v_mau, 0),
    'new_users_week', coalesce(v_new_users_week, 0),
    'new_users_month', coalesce(v_new_users_month, 0),
    'events_created_day', coalesce(v_events_created_day, 0),
    'events_created_month', coalesce(v_events_created_month, 0),
    'total_event_views', coalesce(v_total_event_views, 0)
  );
end;
$$;

revoke all on function public.admin_usage_dashboard_stats() from public;
grant execute on function public.admin_usage_dashboard_stats() to authenticated;

-- =============================================================================
-- Snapshots mensais para diretoria/CEO
-- Guarda a fotografia do mês fechado anterior.
-- =============================================================================

create table if not exists public.app_usage_month_snapshots (
  id bigserial primary key,
  snapshot_year integer not null,
  snapshot_month integer not null,
  month_start date not null,
  month_end date not null,
  dau_peak bigint not null default 0,
  mau bigint not null default 0,
  new_users_month bigint not null default 0,
  events_created_month bigint not null default 0,
  total_event_views bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_usage_month_snapshots_month_ok check (snapshot_month between 1 and 12),
  constraint app_usage_month_snapshots_year_ok check (snapshot_year between 2000 and 2100),
  constraint app_usage_month_snapshots_unique unique (snapshot_year, snapshot_month)
);

comment on table public.app_usage_month_snapshots is
  'Snapshots mensais do uso do app. Cada linha guarda o mês fechado anterior.';

alter table public.app_usage_month_snapshots enable row level security;

create or replace function public.admin_ensure_usage_month_snapshot()
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_now_sp timestamp := timezone('America/Sao_Paulo', now());
  v_curr_month_start_sp timestamp := date_trunc('month', v_now_sp);
  v_prev_month_start_sp timestamp := v_curr_month_start_sp - interval '1 month';
  v_prev_month_end_sp timestamp := v_curr_month_start_sp;
  v_prev_month_start_date date := v_prev_month_start_sp::date;
  v_prev_month_end_date date := (v_curr_month_start_sp::date - interval '1 day')::date;
  v_prev_year integer := extract(year from v_prev_month_start_sp)::integer;
  v_prev_month integer := extract(month from v_prev_month_start_sp)::integer;
  v_dau_peak bigint := 0;
  v_mau bigint := 0;
  v_new_users_month bigint := 0;
  v_events_created_month bigint := 0;
  v_total_event_views bigint := 0;
  v_snapshot jsonb;
begin
  if not coalesce(public.is_current_user_admin(), false) then
    return json_build_object('ok', false, 'error', 'denied');
  end if;

  select coalesce(max(day_dau), 0)
  into v_dau_peak
  from (
    select count(distinct e.viewer_key)::bigint as day_dau
    from public.app_usage_events e
    where e.event_kind = 'app_open'
      and timezone('America/Sao_Paulo', e.created_at) >= v_prev_month_start_sp
      and timezone('America/Sao_Paulo', e.created_at) < v_prev_month_end_sp
    group by date_trunc('day', timezone('America/Sao_Paulo', e.created_at))
  ) day_counts;

  select count(distinct e.viewer_key)::bigint
  into v_mau
  from public.app_usage_events e
  where e.event_kind = 'app_open'
    and timezone('America/Sao_Paulo', e.created_at) >= v_prev_month_start_sp
    and timezone('America/Sao_Paulo', e.created_at) < v_prev_month_end_sp;

  select count(*)::bigint
  into v_new_users_month
  from auth.users u
  where timezone('America/Sao_Paulo', u.created_at) >= v_prev_month_start_sp
    and timezone('America/Sao_Paulo', u.created_at) < v_prev_month_end_sp;

  select count(*)::bigint
  into v_events_created_month
  from public.events ev
  where timezone('America/Sao_Paulo', ev.created_at) >= v_prev_month_start_sp
    and timezone('America/Sao_Paulo', ev.created_at) < v_prev_month_end_sp;

  select count(*)::bigint
  into v_total_event_views
  from public.app_usage_events e
  where e.event_kind = 'event_view'
    and timezone('America/Sao_Paulo', e.created_at) >= v_prev_month_start_sp
    and timezone('America/Sao_Paulo', e.created_at) < v_prev_month_end_sp;

  insert into public.app_usage_month_snapshots (
    snapshot_year,
    snapshot_month,
    month_start,
    month_end,
    dau_peak,
    mau,
    new_users_month,
    events_created_month,
    total_event_views,
    updated_at
  ) values (
    v_prev_year,
    v_prev_month,
    v_prev_month_start_date,
    v_prev_month_end_date,
    coalesce(v_dau_peak, 0),
    coalesce(v_mau, 0),
    coalesce(v_new_users_month, 0),
    coalesce(v_events_created_month, 0),
    coalesce(v_total_event_views, 0),
    now()
  )
  on conflict (snapshot_year, snapshot_month) do update set
    month_start = excluded.month_start,
    month_end = excluded.month_end,
    dau_peak = excluded.dau_peak,
    mau = excluded.mau,
    new_users_month = excluded.new_users_month,
    events_created_month = excluded.events_created_month,
    total_event_views = excluded.total_event_views,
    updated_at = now();

  select to_jsonb(s)
  into v_snapshot
  from public.app_usage_month_snapshots s
  where s.snapshot_year = v_prev_year
    and s.snapshot_month = v_prev_month;

  return json_build_object(
    'ok', true,
    'snapshot', v_snapshot
  );
end;
$$;

revoke all on function public.admin_ensure_usage_month_snapshot() from public;
grant execute on function public.admin_ensure_usage_month_snapshot() to authenticated;
