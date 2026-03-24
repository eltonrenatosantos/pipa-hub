/*
================================================================================
  Aprovação de equipes (cadastro → pending → admin aprova/reprova)
================================================================================

  1) Rode este ficheiro no SQL Editor do Supabase (uma vez).
  2) Se já existir get_my_team() com outro tipo de retorno, pode ser preciso:
     DROP FUNCTION public.get_my_team() CASCADE;
     e voltar a criar dependências — neste projeto o cliente espera um objeto JSON
     com chaves: state, team_id, team_name, team_member_id, role, status,
     city, region, logo_url, owner_user_id.

  Requer: public.is_current_user_admin() (como no resto do painel admin).

  PRÉ-REQUISITO (pontos por membro no core):
  Rode antes sql/team_members_monthly_scores_payload.sql — cria
  public.team_members_monthly_scores_payload(uuid), usada por admin_get_team_management_data.

  ---------------------------------------------------------------------------
  Ranking / pontos
  ---------------------------------------------------------------------------
  Membros aprovados + EV/INT/penalidade + MB do time vêm de user_monthly_scores
  e team_monthly_scores (mês atual), alinhado à view de ranking.
================================================================================
*/

--- COPIE DAQUI ---

alter table public.teams
  add column if not exists approval_status text not null default 'approved';

alter table public.teams
  drop constraint if exists teams_approval_status_check;

alter table public.teams
  add constraint teams_approval_status_check
  check (approval_status in ('pending', 'approved', 'rejected'));

update public.teams
set approval_status = 'approved'
where approval_status is null
   or trim(approval_status) = '';

create index if not exists teams_approval_status_idx
  on public.teams (approval_status);

-- ---------------------------------------------------------------------------
-- get_my_team — JSON (substitui versões anteriores sem este retorno)
-- ---------------------------------------------------------------------------
drop function if exists public.get_my_team();

create or replace function public.get_my_team()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_join record;
  v_owned record;
  v_member record;
  st text;
begin
  if auth.uid() is null then
    return json_build_object(
      'state', 'no_team',
      'team_id', null,
      'team_name', null,
      'team_member_id', null,
      'role', null,
      'status', null,
      'city', null,
      'region', null,
      'logo_url', null,
      'owner_user_id', null
    );
  end if;

  -- 1) Pedido para entrar numa equipe (membro pendente)
  select
    tm.id as team_member_id,
    tm.role,
    tm.status,
    t.id as team_id,
    t.name as team_name,
    t.city,
    t.region,
    t.logo_url,
    t.owner_user_id
  into v_join
  from public.team_members tm
  join public.teams t on t.id = tm.team_id
  where tm.user_id = auth.uid()
    and tm.status = 'pending'
  limit 1;

  if found then
    return json_build_object(
      'state', 'pending',
      'team_id', v_join.team_id,
      'team_name', v_join.team_name,
      'team_member_id', v_join.team_member_id,
      'role', v_join.role,
      'status', v_join.status,
      'city', v_join.city,
      'region', v_join.region,
      'logo_url', v_join.logo_url,
      'owner_user_id', v_join.owner_user_id
    );
  end if;

  -- 2) Dono com equipe ainda não aprovada / reprovada no registo
  select
    t.id,
    t.name,
    t.city,
    t.region,
    t.logo_url,
    t.owner_user_id,
    t.approval_status
  into v_owned
  from public.teams t
  where t.owner_user_id = auth.uid()
    and t.approval_status in ('pending', 'rejected')
  order by t.created_at desc nulls last, t.id desc
  limit 1;

  if found then
    if v_owned.approval_status = 'pending' then
      return json_build_object(
        'state', 'team_pending_approval',
        'team_id', v_owned.id,
        'team_name', v_owned.name,
        'team_member_id', null,
        'role', 'owner',
        'status', 'approved',
        'city', v_owned.city,
        'region', v_owned.region,
        'logo_url', v_owned.logo_url,
        'owner_user_id', v_owned.owner_user_id
      );
    end if;

    return json_build_object(
      'state', 'team_rejected',
      'team_id', v_owned.id,
      'team_name', v_owned.name,
      'team_member_id', null,
      'role', 'owner',
      'status', 'approved',
      'city', v_owned.city,
      'region', v_owned.region,
      'logo_url', v_owned.logo_url,
      'owner_user_id', v_owned.owner_user_id
    );
  end if;

  -- 3) Membro aprovado numa equipe aprovada
  select
    tm.id as team_member_id,
    tm.role,
    tm.status,
    t.id as team_id,
    t.name as team_name,
    t.city,
    t.region,
    t.logo_url,
    t.owner_user_id
  into v_member
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

  if found then
    st := case v_member.role
      when 'owner' then 'owner'
      when 'moderator' then 'moderator'
      else 'member'
    end;

    return json_build_object(
      'state', st,
      'team_id', v_member.team_id,
      'team_name', v_member.team_name,
      'team_member_id', v_member.team_member_id,
      'role', v_member.role,
      'status', v_member.status,
      'city', v_member.city,
      'region', v_member.region,
      'logo_url', v_member.logo_url,
      'owner_user_id', v_member.owner_user_id
    );
  end if;

  return json_build_object(
    'state', 'no_team',
    'team_id', null,
    'team_name', null,
    'team_member_id', null,
    'role', null,
    'status', null,
    'city', null,
    'region', null,
    'logo_url', null,
    'owner_user_id', null
  );
end;
$$;

grant execute on function public.get_my_team() to authenticated;

-- ---------------------------------------------------------------------------
-- Admin: contagens rápidas
-- ---------------------------------------------------------------------------
create or replace function public.admin_teams_dashboard_counts()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pending bigint;
  v_total bigint;
begin
  if not coalesce(public.is_current_user_admin(), false) then
    return json_build_object('is_admin', false, 'pending_teams', 0, 'total_teams', 0);
  end if;

  select count(*) into v_pending
  from public.teams
  where approval_status = 'pending';

  select count(*) into v_total
  from public.teams;

  return json_build_object(
    'is_admin', true,
    'pending_teams', v_pending,
    'total_teams', v_total
  );
end;
$$;

grant execute on function public.admin_teams_dashboard_counts() to authenticated;

-- ---------------------------------------------------------------------------
-- Admin: lista resumo (todas as equipes)
-- total_points: vem de ranking_current_month se existir e tiver team_id + total_points
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
          'member_count', (
            select count(*)::int
            from public.team_members tm
            where tm.team_id = t.id
              and tm.status = 'approved'
          ),
          'total_points', coalesce(rk.total_points, 0)
        )
        order by lower(coalesce(t.name, '')), t.id
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
-- Admin: detalhe da equipe (membros + pedidos pendentes)
-- Membros aprovados: public.team_members_monthly_scores_payload (core).
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
    t.approval_status
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
      'approval_status', v_team.approval_status
    ),
    'pending_requests', v_pending,
    'members', v_members
  );
end;
$$;

grant execute on function public.admin_get_team_management_data(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin: aprovar / reprovar registo da equipe
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_team_approval_status(
  p_team_id uuid,
  p_next_status text
)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_norm text;
begin
  if not coalesce(public.is_current_user_admin(), false) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if p_team_id is null then
    return json_build_object('success', false, 'message', 'Equipe inválida.');
  end if;

  v_norm := lower(trim(coalesce(p_next_status, '')));
  if v_norm not in ('approved', 'rejected') then
    return json_build_object('success', false, 'message', 'Status deve ser approved ou rejected.');
  end if;

  update public.teams
  set approval_status = v_norm
  where id = p_team_id;

  if not found then
    return json_build_object('success', false, 'message', 'Equipe não encontrada.');
  end if;

  return json_build_object('success', true, 'message', 'Atualizado.');
end;
$$;

grant execute on function public.admin_set_team_approval_status(uuid, text) to authenticated;

/*
  RLS (teams): garanta que utilizadores autenticados podem inserir a própria linha
  com approval_status = 'pending' (e que o dono pode ler a equipe em aprovação).
  Se existir política que fixa approval_status = 'approved', ajuste-a.
*/

--- ATÉ AQUI ---
