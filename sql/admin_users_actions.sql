/*
  =============================================================================
  MODERAÇÃO DE USUÁRIOS NO PAINEL ADMIN (um único ficheiro)
  Substitui o antigo sql/admin_reset_camadas.sql — rode isto no Supabase.
  Requer: public.is_current_user_admin() = true.

  Se já tinhas funções antigas, no fim do ficheiro há DROPs opcionais — descomenta
  se quiseres remover overloads duplicados após aplicar.

  Funções:
    • admin_users_count — total de contas (auth.users)
    • admin_list_users — lista para a UI (sem depender de public.profiles)
    • admin_advertencia_usuario — só zera colunas de pontos (EV/INT/raw/penalidade)
    • admin_reset_teste_usuario — limpeza pontual por user (+ opcional sair dos times)
    • admin_reset_teste_todos_usuarios — limpeza em massa
    • admin_reset_teste_todos_usuarios — limpeza em massa
    • admin_ban_usuario_definitivo — transfere dono ao 1.º mod/membro, apaga tudo + auth.users

  Ban alternativo (só bloquear login sem apagar): ver comentário no rodapé.
  =============================================================================
*/

-- Opcional: remover overload antigo de reset (só 1 argumento), se existir:
-- drop function if exists public.admin_reset_teste_usuario(uuid);


-- -----------------------------------------------------------------------------
-- Contagem de utilizadores (auth — não usa public.profiles)
-- -----------------------------------------------------------------------------
create or replace function public.admin_users_count()
returns bigint
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not coalesce(public.is_current_user_admin(), false) then
    return null;
  end if;
  return (select count(*)::bigint from auth.users);
end;
$$;

revoke all on function public.admin_users_count() from public;
grant execute on function public.admin_users_count() to authenticated;


-- -----------------------------------------------------------------------------
-- Lista utilizadores (só auth.users + metadata — funciona sem tabela profiles)
-- -----------------------------------------------------------------------------
create or replace function public.admin_list_users(p_limit integer default 200)
returns json
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  lim int := least(greatest(coalesce(p_limit, 200), 1), 500);
begin
  if not coalesce(public.is_current_user_admin(), false) then
    raise exception 'Acesso negado: apenas administrador.' using errcode = '42501';
  end if;

  return coalesce((
    select json_agg(row_to_json(t))
    from (
      select
        u.id,
        u.email::text as email,
        coalesce(
          nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
          nullif(trim(u.raw_user_meta_data->>'name'), ''),
          nullif(trim(u.raw_user_meta_data->>'given_name'), ''),
          nullif(trim(u.raw_user_meta_data->>'nickname'), ''),
          nullif(trim(u.raw_user_meta_data->>'display_name'), ''),
          split_part(u.email::text, '@', 1)
        ) as nome,
        nullif(trim(coalesce(
          u.raw_user_meta_data->>'avatar_url',
          u.raw_user_meta_data->>'picture'
        )), '') as avatar_url,
        u.created_at
      from auth.users u
      order by u.created_at desc nulls last
      limit lim
    ) t
  ), '[]'::json);
end;
$$;

revoke all on function public.admin_list_users(integer) from public;
grant execute on function public.admin_list_users(integer) to authenticated;


-- -----------------------------------------------------------------------------
-- Advertência: zera pontos (equipe e eventos publicados ficam)
-- -----------------------------------------------------------------------------
create or replace function public.admin_advertencia_usuario(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_current_user_admin(), false) then
    raise exception 'Acesso negado: apenas administrador.' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'p_user_id obrigatório';
  end if;

  update public.user_monthly_scores ums
  set
    event_points = 0,
    interaction_points = 0,
    interaction_raw_balance = 0,
    penalty_points = 0,
    report_reward_points = 0,
    updated_at = now()
  where ums.user_id = p_user_id;

  -- , sponsorship_points = 0  -- descomenta se a coluna existir
end;
$$;

comment on function public.admin_advertencia_usuario(uuid) is
  'Zera EV/INT/raw/penalidade em user_monthly_scores. Mantém equipe e eventos.';

revoke all on function public.admin_advertencia_usuario(uuid) from public;
grant execute on function public.admin_advertencia_usuario(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- Reset teste: apaga interações + denúncias dele + linhas de pontos.
-- p_remover_dos_times = true também remove team_members (antigo “punição com expulsão”).
-- -----------------------------------------------------------------------------
create or replace function public.admin_reset_teste_usuario(
  p_user_id uuid,
  p_remover_dos_times boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_current_user_admin(), false) then
    raise exception 'Acesso negado: apenas administrador.' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'p_user_id obrigatório';
  end if;

  delete from public.event_interactions where user_id = p_user_id;
  delete from public.event_reports where user_id = p_user_id;
  delete from public.user_monthly_scores where user_id = p_user_id;

  if p_remover_dos_times then
    delete from public.team_members where user_id = p_user_id;
  end if;
end;
$$;

comment on function public.admin_reset_teste_usuario(uuid, boolean) is
  'Remove interações, denúncias do user e user_monthly_scores. Opcional: expulsa dos times. Eventos criados permanecem.';

revoke all on function public.admin_reset_teste_usuario(uuid, boolean) from public;
grant execute on function public.admin_reset_teste_usuario(uuid, boolean) to authenticated;


-- -----------------------------------------------------------------------------
-- Alias opcional (mesmo comportamento do antigo admin_reset_punicao_usuario)
-- -----------------------------------------------------------------------------
create or replace function public.admin_reset_punicao_usuario(
  p_user_id uuid,
  p_remover_dos_times boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_reset_teste_usuario(p_user_id, p_remover_dos_times);
end;
$$;

revoke all on function public.admin_reset_punicao_usuario(uuid, boolean) from public;
grant execute on function public.admin_reset_punicao_usuario(uuid, boolean) to authenticated;


-- -----------------------------------------------------------------------------
-- Banimento: transfere dono → 1.º moderador (senão 1.º membro); apaga tudo + conta
-- -----------------------------------------------------------------------------
create or replace function public.admin_ban_usuario_definitivo(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  r_team record;
  v_new_owner uuid;
begin
  if not coalesce(public.is_current_user_admin(), false) then
    raise exception 'Acesso negado: apenas administrador.' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'p_user_id obrigatório';
  end if;

  for r_team in
    select team_id
    from public.team_members
    where user_id = p_user_id
      and role = 'owner'
      and coalesce(status, 'approved') = 'approved'
  loop
    select tm.user_id into v_new_owner
    from public.team_members tm
    where tm.team_id = r_team.team_id
      and tm.user_id <> p_user_id
      and coalesce(tm.status, 'approved') = 'approved'
      and tm.role in ('moderator', 'admin')
    order by tm.id asc nulls last
    limit 1;

    if v_new_owner is null then
      select tm.user_id into v_new_owner
      from public.team_members tm
      where tm.team_id = r_team.team_id
        and tm.user_id <> p_user_id
        and coalesce(tm.status, 'approved') = 'approved'
      order by tm.id asc nulls last
      limit 1;
    end if;

    if v_new_owner is not null then
      update public.team_members
      set role = 'owner'
      where team_id = r_team.team_id
        and user_id = v_new_owner;
    end if;

    delete from public.team_members
    where team_id = r_team.team_id
      and user_id = p_user_id;
  end loop;

  delete from public.team_members where user_id = p_user_id;

  delete from public.event_interactions where user_id = p_user_id;
  delete from public.user_monthly_scores where user_id = p_user_id;
  delete from public.event_reports where user_id = p_user_id;

  delete from public.event_interactions
  where event_id in (select id from public.events where user_id = p_user_id);

  delete from public.event_reports
  where event_id in (select id from public.events where user_id = p_user_id);

  delete from public.events where user_id = p_user_id;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'profiles'
  ) then
    delete from public.profiles where id = p_user_id;
  end if;

  delete from auth.users where id = p_user_id;
end;
$$;

comment on function public.admin_ban_usuario_definitivo(uuid) is
  'Transfere liderança, apaga dados do user, eventos, perfil e auth.users.';

revoke all on function public.admin_ban_usuario_definitivo(uuid) from public;
grant execute on function public.admin_ban_usuario_definitivo(uuid) to authenticated;


/*
  Chamadas no app (admin):
    supabase.rpc('admin_list_users', { p_limit: 400 })
    supabase.rpc('admin_advertencia_usuario', { p_user_id })
    supabase.rpc('admin_reset_teste_usuario', { p_user_id, p_remover_dos_times: false })
    supabase.rpc('admin_ban_usuario_definitivo', { p_user_id })

  Só bloquear login (sem apagar linhas): update auth.users set banned_until = '2099-01-01'::timestamptz where id = '...';

  Se DELETE em events ou auth.users falhar por FK, o Postgres indica a tabela.
*/
