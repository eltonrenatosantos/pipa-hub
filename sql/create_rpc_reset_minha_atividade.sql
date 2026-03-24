/*
  =============================================================================
  RPC: o próprio usuário logado zera interações + pontos mensais (como “nunca usou”).
  Conta Auth continua (mesmo e-mail). Para apagar a conta inteira: painel Supabase.
  Rode UMA VEZ no SQL Editor (produção só depois de revisar).
  =============================================================================
*/

create or replace function public.reset_minha_atividade()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  delete from public.event_interactions where user_id = uid;
  delete from public.user_monthly_scores where user_id = uid;
  delete from public.event_reports where user_id = uid;
  delete from public.team_members where user_id = uid;
end;
$$;

comment on function public.reset_minha_atividade() is
  'Apaga interações em eventos, pontos mensais, denúncias feitas pelo user e vínculo em team_members. Não apaga eventos criados nem auth.users.';

revoke all on function public.reset_minha_atividade() from public;
grant execute on function public.reset_minha_atividade() to authenticated;

/*
  No app (usuário logado):
    const { error } = await supabase.rpc('reset_minha_atividade');

  Opcional: não apagar time — comente o DELETE team_members na função e rode de novo o CREATE OR REPLACE.
  Opcional: também apagar eventos criados pelo user — descomente:
    delete from public.events where user_id = uid;
  (pode falhar se houver FK de outras tabelas para events; ajuste ordem ou use CASCADE no seu schema.)
*/
