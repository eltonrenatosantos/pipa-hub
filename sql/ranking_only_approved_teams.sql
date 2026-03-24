/*
================================================================================
  Ranking público: só equipes com approval_status = 'approved'
================================================================================
  A view `ranking_current_month` costuma incluir todas as equipes com pontos;
  equipes em análise (pending) não devem aparecer no placar até serem aprovadas.

  Cria a função `get_ranking_public()` (SECURITY DEFINER) que devolve as mesmas
  linhas da view, filtradas por `teams.approval_status = 'approved'`.

  Requer coluna `team_id` em `ranking_current_month` (como no cliente JS).

  Rode UMA VEZ no SQL Editor do Supabase.
================================================================================
*/

drop function if exists public.get_ranking_public();

create or replace function public.get_ranking_public()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    json_agg(row_to_json(s) order by s.position asc nulls last),
    '[]'::json
  )
  from (
    select v.*
    from public.ranking_current_month v
    inner join public.teams t on t.id = v.team_id
    where coalesce(t.approval_status, 'approved') = 'approved'
  ) s;
$$;

comment on function public.get_ranking_public() is
  'Ranking do mês só com equipes aprovadas (exclui pending/rejected).';

revoke all on function public.get_ranking_public() from public;
grant execute on function public.get_ranking_public() to anon, authenticated;
