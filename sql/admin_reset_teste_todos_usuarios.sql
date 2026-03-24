/*
================================================================================
  RESET DE TESTE EM MASSA (só administrador)
================================================================================
  Limpa interações, denúncias e pontos de todos os usuários.
  Não apaga contas Auth, eventos nem equipes.

  Opcionalmente pode remover todos os membros de equipe também.
================================================================================
*/

create or replace function public.admin_reset_teste_todos_usuarios(
  p_remover_dos_times boolean default false
)
returns json
language plpgsql
volatile
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_deleted_interactions bigint := 0;
  v_deleted_reports bigint := 0;
  v_deleted_user_scores bigint := 0;
  v_deleted_team_scores bigint := 0;
  v_deleted_team_members bigint := 0;
begin
  if not coalesce(public.is_current_user_admin(), false) then
    return json_build_object('success', false, 'message', 'Acesso negado.');
  end if;

  delete from public.event_interactions;
  get diagnostics v_deleted_interactions = row_count;

  delete from public.event_reports;
  get diagnostics v_deleted_reports = row_count;

  delete from public.user_monthly_scores;
  get diagnostics v_deleted_user_scores = row_count;

  delete from public.team_monthly_scores;
  get diagnostics v_deleted_team_scores = row_count;

  if coalesce(p_remover_dos_times, false) then
    delete from public.team_members;
    get diagnostics v_deleted_team_members = row_count;
  end if;

  return json_build_object(
    'success', true,
    'message', 'Reset de teste em massa concluído.',
    'deleted_event_interactions', v_deleted_interactions,
    'deleted_event_reports', v_deleted_reports,
    'deleted_user_monthly_scores', v_deleted_user_scores,
    'deleted_team_monthly_scores', v_deleted_team_scores,
    'deleted_team_members', v_deleted_team_members
  );
exception
  when others then
    return json_build_object(
      'success', false,
      'message',
      'Erro ao limpar: ' || sqlerrm
    );
end;
$$;

comment on function public.admin_reset_teste_todos_usuarios(boolean) is
  'Limpa interações, denúncias e pontuações de todos os usuários. Opcionalmente remove todos de team_members.';

revoke all on function public.admin_reset_teste_todos_usuarios(boolean) from public;
grant execute on function public.admin_reset_teste_todos_usuarios(boolean) to authenticated;
