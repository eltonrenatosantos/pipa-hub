/*
  Payload de membros da equipe com pontos do MÊS ATUAL, alinhado ao core:
  - public.user_monthly_scores (event_points, interaction_points, penalty_points, …)
  - public.team_monthly_scores (members_count → team_mb na linha de cada membro, igual ao ranking)

  Período: mesmo critério da view ranking_current_month (ano/mês de now()).

  Segurança: só admin (is_current_user_admin) ou membro aprovado da equipe.

  Rode no SQL Editor do Supabase (uma vez), antes ou depois de teams_approval.sql.
*/

create or replace function public.team_members_monthly_scores_payload(p_team_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result json;
begin
  if p_team_id is null then
    return '[]'::json;
  end if;

  if auth.uid() is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;

  if not coalesce(public.is_current_user_admin(), false) then
    if not exists (
      select 1
      from public.team_members tm
      where tm.team_id = p_team_id
        and tm.user_id = auth.uid()
        and tm.status = 'approved'
    ) then
      raise exception 'Acesso negado' using errcode = '42501';
    end if;
  end if;

  /* Mesmo “mês corrente” do app (Brasil); alinhar com team_monthly_scores / user_monthly_scores */
  with period as (
    select
      extract(year from timezone('America/Sao_Paulo', now()))::integer as y,
      extract(month from timezone('America/Sao_Paulo', now()))::integer as m
  ),
  member_rows as (
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
      coalesce(ums.event_points, 0)::bigint as event_points,
      /* PT no ranking da view ainda vem 0; se existir coluna em user_monthly_scores, troque por coalesce(ums.sponsorship_points,0) */
      0::bigint as sponsorship_points,
      coalesce(ums.interaction_points, 0)::bigint as interaction_points,
      coalesce(ums.report_reward_points, 0)::bigint as report_reward_points,
      (
        coalesce(ums.event_points, 0)::numeric
        + coalesce(ums.interaction_points, 0)::numeric
        + coalesce(ums.report_reward_points, 0)::numeric
        - coalesce(ums.penalty_points, 0)::numeric
      )::bigint as total_points,
      coalesce(ums.penalty_points, 0)::bigint as penalty_points,
      coalesce(tms.members_count, 0)::bigint as team_mb,
      case tm.role
        when 'owner' then 0
        when 'moderator' then 1
        else 2
      end as sort_rank,
      lower(coalesce(
        u.raw_user_meta_data->>'full_name',
        u.raw_user_meta_data->>'name',
        u.email,
        tm.user_id::text
      )) as sort_key
    from public.team_members tm
    left join auth.users u on u.id = tm.user_id
    cross join period p
    left join public.user_monthly_scores ums
      on ums.user_id = tm.user_id
      and ums.team_id = tm.team_id
      and ums.year = p.y
      and ums.month = p.m
    left join public.team_monthly_scores tms
      on tms.team_id = p_team_id
      and tms.year = p.y
      and tms.month = p.m
    where tm.team_id = p_team_id
      and tm.status = 'approved'
  )
  select coalesce(json_agg(r order by r.sort_rank, r.sort_key), '[]'::json)
  into v_result
  from member_rows r;

  return v_result;
end;
$$;

comment on function public.team_members_monthly_scores_payload(uuid) is
  'Membros aprovados + pontos do mês (user_monthly_scores / team_monthly_scores), mesmo período do ranking.';

grant execute on function public.team_members_monthly_scores_payload(uuid) to authenticated;

/*
  Diagnóstico (se continuar tudo 0 mas você espera pontos):

  1) Confirme que esta função foi aplicada no Supabase (versão com America/Sao_Paulo).
  2) Rode no SQL Editor (troque o UUID da equipe):

     select * from public.user_monthly_scores
     where team_id = 'UUID_DA_EQUIPE'
     order by year desc, month desc
     limit 20;

     select * from public.team_monthly_scores
     where team_id = 'UUID_DA_EQUIPE'
     order by year desc, month desc
     limit 20;

  3) Se as linhas existem mas year/month não batem com o mês “atual” em São Paulo,
     ou os pontos estão só em outra tabela, ajuste o join (ou nos envie o schema).

  4) Se ranking_current_month também mostra 0 para a equipe, o problema é dado/agregação
     no banco neste ambiente — não só o modal do admin.
*/
