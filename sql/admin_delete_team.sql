/*
================================================================================
  Apagar equipe por completo (admin ou dono)
================================================================================
  Remove membros, pontos ligados ao time (se as colunas existirem) e a linha em teams.

  Se já aplicaste uma versão antiga e dá erro (coluna inexistente / FK), volta a
  executar este ficheiro inteiro no SQL Editor do Supabase.

  Rode no SQL Editor do Supabase (uma vez ou para atualizar).
================================================================================
*/

create or replace function public.delete_team_completely(p_team_id uuid)
returns json
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_has_ums_team boolean;
  v_has_tms_team boolean;
  v_has_events_team boolean;
begin
  if auth.uid() is null then
    return json_build_object('success', false, 'message', 'Não autenticado.');
  end if;

  if p_team_id is null then
    return json_build_object('success', false, 'message', 'Equipe inválida.');
  end if;

  if not exists (select 1 from public.teams t where t.id = p_team_id) then
    return json_build_object('success', false, 'message', 'Equipe não encontrada.');
  end if;

  if not (
    coalesce(public.is_current_user_admin(), false)
    or exists (
      select 1
      from public.teams t
      where t.id = p_team_id
        and t.owner_user_id = auth.uid()
    )
  ) then
    return json_build_object('success', false, 'message', 'Sem permissão para apagar esta equipe.');
  end if;

  select exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'user_monthly_scores'
      and c.column_name = 'team_id'
  ) into v_has_ums_team;

  select exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'team_monthly_scores'
      and c.column_name = 'team_id'
  ) into v_has_tms_team;

  select exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'events'
      and c.column_name = 'team_id'
  ) into v_has_events_team;

  if v_has_ums_team then
    delete from public.user_monthly_scores where team_id = p_team_id;
  end if;

  if v_has_tms_team then
    delete from public.team_monthly_scores where team_id = p_team_id;
  end if;

  /*
    Se existir events.team_id → teams: apagar primeiro interações/denúncias dos eventos
    dessa equipe, depois os eventos.
  */
  if v_has_events_team then
    if exists (select 1 from information_schema.tables t where t.table_schema = 'public' and t.table_name = 'event_interactions') then
      delete from public.event_interactions
      where event_id in (select id from public.events where team_id = p_team_id);
    end if;

    if exists (select 1 from information_schema.tables t where t.table_schema = 'public' and t.table_name = 'event_reports') then
      delete from public.event_reports
      where event_id in (select id from public.events where team_id = p_team_id);
    end if;

    delete from public.events where team_id = p_team_id;
  end if;

  delete from public.team_members where team_id = p_team_id;
  delete from public.teams where id = p_team_id;

  return json_build_object('success', true, 'message', 'Equipe removida.');
exception
  when foreign_key_violation then
    return json_build_object(
      'success', false,
      'message',
      'Não foi possível apagar: ainda há dados ligados a esta equipe (FK). Detalhe: ' || sqlerrm
    );
  when others then
    return json_build_object(
      'success', false,
      'message',
      'Erro ao apagar equipe: ' || sqlerrm
    );
end;
$$;

comment on function public.delete_team_completely(uuid) is
  'Apaga equipe e membros; permitido a administrador ou ao dono (owner_user_id).';

grant execute on function public.delete_team_completely(uuid) to authenticated;
