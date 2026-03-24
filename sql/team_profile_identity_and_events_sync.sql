/*
================================================================================
  Perfil da equipe: 1 alteração de identidade (nome + região + data de fundação)
  e sincronização do nome em eventos já publicados ao aprovar.

  Rode no SQL Editor do Supabase DEPOIS de team_profile_pending.sql.

  - identity_profile_changes_remaining: 1 = ainda pode pedir mudança nesse trio;
    ao aprovar um pedido que altere nome OU região OU founded_at, passa a 0.
  - Cidade e logo: pedidos normais, não consomem essa ficha.
  - Ao aprovar nome novo: atualiza events.team para todos os eventos da equipe
    (team_id se existir; senão por user_id membro + texto antigo).
================================================================================
*/

alter table public.teams
  add column if not exists identity_profile_changes_remaining int not null default 1;

comment on column public.teams.identity_profile_changes_remaining is
  'Quantas vezes ainda pode alterar nome/região/data de fundação (após aprovação). Cidade e logo não consomem.';

update public.teams
set identity_profile_changes_remaining = 1
where identity_profile_changes_remaining is null;

-- ---------------------------------------------------------------------------
-- Pedido de alteração (5º parâmetro opcional: data de fundação ISO YYYY-MM-DD)
-- ---------------------------------------------------------------------------
create or replace function public.request_team_profile_change(
  p_name text,
  p_city text,
  p_region text,
  p_logo_url text,
  p_founded_at text default null
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
  v_fa text;
  v_identity_changed boolean;
  v_rem int;
  v_new_name text;
  v_new_region text;
  v_new_fa date;
  v_old_fa date;
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

  v_new_name := trim(coalesce(p_name, ''));
  if v_new_name = '' then
    return json_build_object('success', false, 'message', 'Informe o nome da equipe.');
  end if;

  v_fa := nullif(trim(coalesce(p_founded_at, '')), '');

  v_pending := jsonb_build_object(
    'name', v_new_name,
    'city', trim(coalesce(p_city, '')),
    'region', trim(coalesce(p_region, '')),
    'logo_url', nullif(trim(coalesce(p_logo_url, '')), ''),
    'founded_at', coalesce(v_fa, '')
  );

  v_old_fa := v_team.founded_at::date;
  v_new_region := nullif(trim(coalesce(p_region, '')), '');

  v_identity_changed :=
    (trim(coalesce(v_team.name, '')) is distinct from v_new_name)
    or (nullif(trim(coalesce(v_team.region, '')), '') is distinct from v_new_region);

  if v_fa is not null then
    begin
      v_new_fa := v_fa::date;
    exception
      when others then
        return json_build_object('success', false, 'message', 'Data de fundação inválida. Use AAAA-MM-DD.');
    end;
    v_identity_changed := v_identity_changed or (v_old_fa is distinct from v_new_fa);
  end if;

  v_rem := coalesce(v_team.identity_profile_changes_remaining, 1);

  if v_identity_changed and v_rem <= 0 then
    return json_build_object(
      'success', false,
      'message',
      'Você já usou a alteração permitida de nome, região e data de fundação. Ainda pode alterar cidade e logo enviando um novo pedido.'
    );
  end if;

  update public.teams
  set pending_profile = v_pending
  where id = v_team.id;

  return json_build_object(
    'success', true,
    'message', 'Alterações enviadas para análise.',
    'identity_profile_changes_remaining', v_rem
  );
end;
$$;

grant execute on function public.request_team_profile_change(text, text, text, text, text) to authenticated;

-- Clientes antigos (4 argumentos) — repassa data de fundação como null
drop function if exists public.request_team_profile_change(text, text, text, text);

create or replace function public.request_team_profile_change(
  p_name text,
  p_city text,
  p_region text,
  p_logo_url text
)
returns json
language sql
security definer
set search_path = public
as $$
  select public.request_team_profile_change(p_name, p_city, p_region, p_logo_url, null::text);
$$;

grant execute on function public.request_team_profile_change(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin: aprovar / rejeitar + sync nome em events + decremento da ficha
-- ---------------------------------------------------------------------------
create or replace function public.admin_resolve_team_profile_change(
  p_team_id uuid,
  p_decision text
)
returns json
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_norm text;
  v_team public.teams%rowtype;
  v_old_name text;
  v_new_name text;
  v_old_region text;
  v_new_region text;
  v_old_fa date;
  v_new_fa date;
  v_fa_raw text;
  v_identity_changed boolean;
  v_has_events_team_id boolean;
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

  select exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'events'
      and c.column_name = 'team_id'
  ) into v_has_events_team_id;

  if v_norm = 'approved' then
    v_old_name := trim(coalesce(v_team.name, ''));
    v_new_name := trim(coalesce(v_team.pending_profile->>'name', ''));
    if v_new_name = '' then
      v_new_name := v_old_name;
    end if;

    v_old_region := nullif(trim(coalesce(v_team.region, '')), '');
    v_new_region := nullif(trim(coalesce(v_team.pending_profile->>'region', '')), '');

    v_old_fa := v_team.founded_at::date;
    v_fa_raw := nullif(trim(coalesce(v_team.pending_profile->>'founded_at', '')), '');
    if v_fa_raw is not null and v_fa_raw <> '' then
      begin
        v_new_fa := v_fa_raw::date;
      exception
        when others then
          v_new_fa := v_old_fa;
      end;
    else
      v_new_fa := v_old_fa;
    end if;

    v_identity_changed :=
      (v_old_name is distinct from v_new_name)
      or (v_old_region is distinct from v_new_region)
      or (v_old_fa is distinct from v_new_fa);

    if v_identity_changed and coalesce(v_team.identity_profile_changes_remaining, 1) <= 0 then
      return json_build_object(
        'success', false,
        'message',
        'Esta equipe já consumiu a alteração de identidade; rejeite ou peça novo pedido só com cidade/logo.'
      );
    end if;

    update public.teams
    set
      name = v_new_name,
      city = nullif(trim(v_team.pending_profile->>'city'), ''),
      region = v_new_region,
      logo_url = nullif(trim(v_team.pending_profile->>'logo_url'), ''),
      founded_at = coalesce(v_new_fa, v_team.founded_at),
      pending_profile = null,
      identity_profile_changes_remaining = case
        when v_identity_changed then greatest(coalesce(v_team.identity_profile_changes_remaining, 1) - 1, 0)
        else coalesce(v_team.identity_profile_changes_remaining, 1)
      end
    where id = p_team_id;

    if v_new_name is not null and v_new_name <> '' and v_old_name is distinct from v_new_name then
      if v_has_events_team_id then
        update public.events e
        set team = v_new_name
        where e.team_id = p_team_id;
      end if;

      update public.events e
      set team = v_new_name
      where v_old_name <> ''
        and e.team = v_old_name
        and e.user_id in (
          select tm.user_id
          from public.team_members tm
          where tm.team_id = p_team_id
            and tm.status = 'approved'
        );
    end if;
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
-- get_my_team_management — founded_at + identity_profile_changes_remaining
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
      'founded_at', v_team.founded_at,
      'identity_profile_changes_remaining', coalesce(v_team.identity_profile_changes_remaining, 1),
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
