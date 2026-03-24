/*
================================================================================
  Alterações de perfil da equipe (nome, cidade, região, logo) → aprovação admin
================================================================================
  Pré-requisito: sql/teams_approval.sql (coluna approval_status em teams).

  Rode este ficheiro no SQL Editor do Supabase após teams_approval.sql.
================================================================================
*/

alter table public.teams
  add column if not exists pending_profile jsonb;

comment on column public.teams.pending_profile is
  'Valores propostos (name, city, region, logo_url) aguardando aprovação; null se não há pedido.';

-- ---------------------------------------------------------------------------
-- Utilizador: pedir alteração (só dono, equipe já aprovada)
-- ---------------------------------------------------------------------------
create or replace function public.request_team_profile_change(
  p_name text,
  p_city text,
  p_region text,
  p_logo_url text
)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_team public.teams%rowtype;
  v_pending jsonb;
begin
  if auth.uid() is null then
    return json_build_object('success', false, 'message', 'Não autenticado.');
  end if;

  select t.*
  into v_team
  from public.teams t
  where t.owner_user_id = auth.uid()
    and t.approval_status = 'approved'
  order by t.created_at desc nulls last, t.id desc
  limit 1;

  if not found then
    return json_build_object('success', false, 'message', 'Só o líder de uma equipe aprovada pode solicitar alterações.');
  end if;

  v_pending := jsonb_build_object(
    'name', trim(coalesce(p_name, '')),
    'city', trim(coalesce(p_city, '')),
    'region', trim(coalesce(p_region, '')),
    'logo_url', nullif(trim(coalesce(p_logo_url, '')), '')
  );

  if coalesce(v_pending->>'name', '') = '' then
    return json_build_object('success', false, 'message', 'Informe o nome da equipe.');
  end if;

  update public.teams
  set pending_profile = v_pending
  where id = v_team.id;

  return json_build_object('success', true, 'message', 'Alterações enviadas para análise.');
end;
$$;

grant execute on function public.request_team_profile_change(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin: aprovar ou rejeitar alterações de perfil (não confundir com cadastro)
-- ---------------------------------------------------------------------------
create or replace function public.admin_resolve_team_profile_change(
  p_team_id uuid,
  p_decision text
)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_norm text;
  v_team public.teams%rowtype;
begin
  if not coalesce(public.is_current_user_admin(), false) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if p_team_id is null then
    return json_build_object('success', false, 'message', 'Equipe inválida.');
  end if;

  v_norm := lower(trim(coalesce(p_decision, '')));
  if v_norm not in ('approved', 'rejected') then
    return json_build_object('success', false, 'message', 'Decisão inválida.');
  end if;

  select * into v_team from public.teams t where t.id = p_team_id;
  if not found then
    return json_build_object('success', false, 'message', 'Equipe não encontrada.');
  end if;

  if v_team.pending_profile is null then
    return json_build_object('success', false, 'message', 'Não há alterações pendentes para esta equipe.');
  end if;

  if v_norm = 'approved' then
    update public.teams
    set
      name = coalesce(nullif(trim(v_team.pending_profile->>'name'), ''), name),
      city = nullif(trim(v_team.pending_profile->>'city'), ''),
      region = nullif(trim(v_team.pending_profile->>'region'), ''),
      logo_url = nullif(trim(v_team.pending_profile->>'logo_url'), ''),
      pending_profile = null
    where id = p_team_id;
  else
    update public.teams
    set pending_profile = null
    where id = p_team_id;
  end if;

  return json_build_object('success', true, 'message', 'Atualizado.');
end;
$$;

grant execute on function public.admin_resolve_team_profile_change(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- App perfil: dados da equipe + membros (substitui RPC homónimo em deploys antigos)
-- Nota: se já existir com outro tipo de retorno, CREATE OR REPLACE falha — DROP primeiro.
-- ---------------------------------------------------------------------------
drop function if exists public.get_my_team_management();

create or replace function public.get_my_team_management()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_role text;
  v_can_manage boolean;
  v_team public.teams%rowtype;
  v_pending json;
  v_members json;
begin
  if auth.uid() is null then
    return json_build_object('success', false, 'message', 'Não autenticado.');
  end if;

  select
    tm.team_id,
    tm.role
  into v_team_id, v_role
  from public.team_members tm
  join public.teams t on t.id = tm.team_id
  where tm.user_id = auth.uid()
    and tm.status = 'approved'
    and t.approval_status = 'approved'
  order by
    case tm.role when 'owner' then 0 when 'moderator' then 1 else 2 end,
    tm.created_at desc nulls last,
    tm.id desc
  limit 1;

  if v_team_id is null then
    return json_build_object('success', false, 'message', 'Sem equipe ativa.');
  end if;

  v_can_manage := v_role in ('owner', 'moderator');

  select *
  into v_team
  from public.teams t
  where t.id = v_team_id;

  select coalesce(json_agg(p order by p.sort_key), '[]'::json)
  into v_pending
  from (
    select
      tm.id as team_member_id,
      tm.user_id,
      nullif(trim(coalesce(
        u.raw_user_meta_data->>'full_name',
        u.raw_user_meta_data->>'name',
        u.raw_user_meta_data->>'given_name',
        u.raw_user_meta_data->>'nickname',
        split_part(u.email, '@', 1)
      )), '') as user_name,
      nullif(trim(coalesce(
        u.raw_user_meta_data->>'avatar_url',
        u.raw_user_meta_data->>'picture'
      )), '') as avatar_url,
      u.email::text as email,
      tm.role,
      tm.status,
      tm.created_at,
      lower(coalesce(
        u.raw_user_meta_data->>'full_name',
        u.raw_user_meta_data->>'name',
        u.email,
        tm.user_id::text
      )) as sort_key
    from public.team_members tm
    left join auth.users u on u.id = tm.user_id
    where tm.team_id = v_team_id
      and tm.status = 'pending'
  ) p;

  select public.team_members_monthly_scores_payload(v_team_id)
  into v_members;

  return json_build_object(
    'success', true,
    'state', v_role,
    'can_manage', v_can_manage,
    'team', json_build_object(
      'id', v_team.id,
      'name', v_team.name,
      'city', v_team.city,
      'region', v_team.region,
      'logo_url', v_team.logo_url,
      'role', v_role,
      'owner_user_id', v_team.owner_user_id,
      'approval_status', v_team.approval_status,
      'pending_profile', v_team.pending_profile
    ),
    'pending_requests', v_pending,
    'approved_members', v_members
  );
end;
$$;

grant execute on function public.get_my_team_management() to authenticated;

-- ---------------------------------------------------------------------------
-- Admin: contagens (cadastros pendentes + alterações de perfil pendentes)
-- ---------------------------------------------------------------------------
create or replace function public.admin_teams_dashboard_counts()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pending_reg bigint;
  v_pending_edit bigint;
  v_total bigint;
begin
  if not coalesce(public.is_current_user_admin(), false) then
    return json_build_object('is_admin', false, 'pending_teams', 0, 'pending_profile_edits', 0, 'total_teams', 0);
  end if;

  select count(*) into v_pending_reg
  from public.teams
  where approval_status = 'pending';

  select count(*) into v_pending_edit
  from public.teams
  where approval_status = 'approved'
    and pending_profile is not null;

  select count(*) into v_total
  from public.teams;

  return json_build_object(
    'is_admin', true,
    'pending_teams', v_pending_reg + v_pending_edit,
    'pending_registrations', v_pending_reg,
    'pending_profile_edits', v_pending_edit,
    'total_teams', v_total
  );
end;
$$;

grant execute on function public.admin_teams_dashboard_counts() to authenticated;

-- ---------------------------------------------------------------------------
-- Admin: lista resumo (inclui pending_profile + queue_kind)
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_teams_summary()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_current_user_admin(), false) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  return coalesce(
    (
      select json_agg(
        json_build_object(
          'team_id', t.id,
          'team_name', t.name,
          'approval_status', t.approval_status,
          'city', t.city,
          'region', t.region,
          'logo_url', t.logo_url,
          'owner_user_id', t.owner_user_id,
          'founder_name', t.founder_name,
          'founded_at', t.founded_at,
          'pending_profile', t.pending_profile,
          'queue_kind', case
            when t.approval_status = 'pending' then 'new_registration'
            when t.pending_profile is not null then 'profile_edit'
            else 'none'
          end,
          'member_count', (
            select count(*)::int
            from public.team_members tm
            where tm.team_id = t.id
              and tm.status = 'approved'
          ),
          'total_points', coalesce(rk.total_points, 0)
        )
        order by
          case
            when t.approval_status = 'pending' then 0
            when t.pending_profile is not null then 1
            else 2
          end,
          lower(coalesce(t.name, '')),
          t.id
      )
      from public.teams t
      left join lateral (
        select r.total_points
        from public.ranking_current_month r
        where r.team_id = t.id
        limit 1
      ) rk on true
    ),
    '[]'::json
  );
end;
$$;

grant execute on function public.admin_list_teams_summary() to authenticated;

-- ---------------------------------------------------------------------------
-- Admin: detalhe (team inclui pending_profile)
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_team_management_data(p_team_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_team record;
  v_pending json;
  v_members json;
  v_member_count int;
  v_ranking_pts numeric;
begin
  if not coalesce(public.is_current_user_admin(), false) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if p_team_id is null then
    return json_build_object('success', false, 'message', 'Equipe inválida.');
  end if;

  select
    t.id,
    t.name,
    t.city,
    t.region,
    t.logo_url,
    t.owner_user_id,
    t.founder_name,
    t.founded_at,
    t.approval_status,
    t.pending_profile
  into v_team
  from public.teams t
  where t.id = p_team_id;

  if not found then
    return json_build_object('success', false, 'message', 'Equipe não encontrada.');
  end if;

  select count(*)::int
  into v_member_count
  from public.team_members tm
  where tm.team_id = p_team_id
    and tm.status = 'approved';

  select coalesce(max(r.total_points), 0)
  into v_ranking_pts
  from public.ranking_current_month r
  where r.team_id = p_team_id;

  select coalesce(json_agg(p order by p.sort_key), '[]'::json)
  into v_pending
  from (
    select
      tm.id as team_member_id,
      tm.user_id,
      nullif(trim(coalesce(
        u.raw_user_meta_data->>'full_name',
        u.raw_user_meta_data->>'name',
        u.raw_user_meta_data->>'given_name',
        u.raw_user_meta_data->>'nickname',
        split_part(u.email, '@', 1)
      )), '') as user_name,
      nullif(trim(coalesce(
        u.raw_user_meta_data->>'avatar_url',
        u.raw_user_meta_data->>'picture'
      )), '') as avatar_url,
      u.email::text as email,
      tm.role,
      tm.status,
      tm.created_at,
      lower(coalesce(
        u.raw_user_meta_data->>'full_name',
        u.raw_user_meta_data->>'name',
        u.email,
        tm.user_id::text
      )) as sort_key
    from public.team_members tm
    left join auth.users u on u.id = tm.user_id
    where tm.team_id = p_team_id
      and tm.status = 'pending'
  ) p;

  select public.team_members_monthly_scores_payload(p_team_id)
  into v_members;

  return json_build_object(
    'success', true,
    'approved_member_count', v_member_count,
    'ranking_month_total', v_ranking_pts,
    'team', json_build_object(
      'id', v_team.id,
      'name', v_team.name,
      'city', v_team.city,
      'region', v_team.region,
      'logo_url', v_team.logo_url,
      'owner_user_id', v_team.owner_user_id,
      'founder_name', v_team.founder_name,
      'founded_at', v_team.founded_at,
      'approval_status', v_team.approval_status,
      'pending_profile', v_team.pending_profile
    ),
    'pending_requests', v_pending,
    'members', v_members
  );
end;
$$;

grant execute on function public.admin_get_team_management_data(uuid) to authenticated;
