-- =============================================================================
-- Campeão de um mês fechado (calendário) — mesma ideia de pontos do ranking:
-- soma por equipe de user_monthly_scores (EV + INT + denúncia − penalidade), só equipes
-- approval_status = approved. Usa ano/mês explícitos (ex.: março encerrado).
--
-- Desempate (empate no total): maior soma de interaction_raw_balance (RAW
-- fracionado por interação) no mês; por último nome da equipe.
--
-- Rode no SQL Editor do Supabase (mesmo projeto do app).
-- Depois: Settings → API → Reload schema (ou aguarde ~1 min).
-- =============================================================================

create or replace function public.get_ranking_month_champion(p_year integer, p_month integer)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
begin
  if p_year is null or p_month is null or p_month < 1 or p_month > 12 then
    return json_build_object(
      'year', p_year,
      'month', p_month,
      'team_id', null,
      'team_name', null,
      'total_points', null
    );
  end if;

  select
    t.id as team_id,
    t.name as team_name,
    tt.total_points as total_points
  into r
  from (
    select
      tm.team_id,
      sum(
        coalesce(ums.event_points, 0)::numeric
        + coalesce(ums.interaction_points, 0)::numeric
        + coalesce(ums.report_reward_points, 0)::numeric
        - coalesce(ums.penalty_points, 0)::numeric
      )::bigint as total_points,
      sum(coalesce(ums.interaction_raw_balance, 0)::numeric) as int_raw_sum
    from public.team_members tm
    left join public.user_monthly_scores ums
      on ums.user_id = tm.user_id
      and ums.team_id = tm.team_id
      and ums.year = p_year
      and ums.month = p_month
    where tm.status = 'approved'
    group by tm.team_id
  ) tt
  inner join public.teams t on t.id = tt.team_id
  where coalesce(t.approval_status, 'approved') = 'approved'
    and tt.total_points > 0
  order by
    tt.total_points desc,
    tt.int_raw_sum desc,
    t.name asc
  limit 1;

  if not found then
    return json_build_object(
      'year', p_year,
      'month', p_month,
      'team_id', null,
      'team_name', null,
      'total_points', null
    );
  end if;

  return json_build_object(
    'year', p_year,
    'month', p_month,
    'team_id', r.team_id,
    'team_name', r.team_name,
    'total_points', r.total_points
  );
end;
$$;

comment on function public.get_ranking_month_champion(integer, integer) is
  '1º lugar no mês: total EV+INT+denúncias(procedentes)−penalidade por equipe; desempate: soma interaction_raw_balance, depois nome.';

revoke all on function public.get_ranking_month_champion(integer, integer) from public;
grant execute on function public.get_ranking_month_champion(integer, integer) to anon, authenticated;
