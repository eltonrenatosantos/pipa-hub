-- =============================================================================
-- Após INSERT em event_reports: remove interações do denunciante nesse evento e
-- reverte até 0,1 de interaction_raw_balance no mês corrente (mesma lógica do
-- farm por evento no cliente: no máximo +0,1 raw por usuário/evento).
--
-- Rode no SQL Editor do Supabase (uma vez). Requer:
--   public.resolve_user_ranking_team_id(uuid)
--   public.user_monthly_scores (user_id, team_id, year, month, interaction_raw_balance, …)
--
-- Se o CREATE TRIGGER falhar com "syntax error", troque a última linha por:
--   EXECUTE PROCEDURE public.trg_revert_interactions_on_report();
--
-- Ajuste também a RPC submit_event_report (se existir CHECK em motivo) para aceitar
-- só duplicado | outro, alinhado à página do evento.
-- =============================================================================

create or replace function public.trg_revert_interactions_on_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_had boolean;
  v_team uuid;
  v_y integer;
  v_m integer;
begin
  select exists(
    select 1
    from public.event_interactions ei
    where ei.event_id = new.event_id
      and ei.user_id = new.user_id
  ) into v_had;

  delete from public.event_interactions ei
  where ei.event_id = new.event_id
    and ei.user_id = new.user_id;

  if not v_had then
    return new;
  end if;

  v_team := public.resolve_user_ranking_team_id(new.user_id);
  if v_team is null then
    return new;
  end if;

  v_y := extract(year from timezone('America/Sao_Paulo', now()))::integer;
  v_m := extract(month from timezone('America/Sao_Paulo', now()))::integer;

  update public.user_monthly_scores ums
  set
    interaction_raw_balance = greatest(
      0::numeric,
      coalesce(ums.interaction_raw_balance, 0)::numeric - 0.1::numeric
    ),
    updated_at = now()
  where ums.user_id = new.user_id
    and ums.team_id = v_team
    and ums.year = v_y
    and ums.month = v_m;

  return new;
end;
$$;

drop trigger if exists event_reports_revert_interactions on public.event_reports;

create trigger event_reports_revert_interactions
after insert on public.event_reports
for each row
execute function public.trg_revert_interactions_on_report();

comment on function public.trg_revert_interactions_on_report() is
  'Após denúncia: apaga event_interactions do usuário no evento e subtrai 0,1 raw no mês se havia interação gravada.';
