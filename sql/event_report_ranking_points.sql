-- =============================================================================
-- Denúncia aceita → ranking
--   • Denunciante (membro de equipe com time resolvido): +15 em report_reward_points
--   • Autor do evento, se motivo indica duplicado/fake/fraude: +30 em penalty_points
--
-- Requer UNIQUE (user_id, team_id, year, month) em public.user_monthly_scores
-- (comum no projeto). Requer public.resolve_user_ranking_team_id(uuid).
--
-- Depois de aplicar: atualize a view public.ranking_current_month para somar
-- coalesce(report_reward_points,0) no total da equipe (ver bloco NOTA no final).
-- =============================================================================

do $mig$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_monthly_scores'
      and column_name = 'report_reward_points'
  ) then
    alter table public.user_monthly_scores
      add column report_reward_points bigint not null default 0;
  end if;
end
$mig$;

comment on column public.user_monthly_scores.report_reward_points is
  'Pontos por denúncia procedente (+15 por aceite admin). Entram no total do ranking junto com EV e INT.';

-- -----------------------------------------------------------------------------
-- Aceitar denúncia: marca accepted + aplica bônus/penalidade no mês (America/Sao_Paulo)
-- Idempotente: se já estava accepted, retorna ok sem aplicar pontos de novo.
-- -----------------------------------------------------------------------------
create or replace function public.admin_accept_event_report(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_updated int;
  v_owner uuid;
  v_team_r uuid;
  v_team_o uuid;
  v_y int;
  v_m int;
  v_norm text;
  v_penalty_apply boolean;
  c_reporter_reward constant bigint := 15;
  c_owner_penalty constant bigint := 30;
begin
  if not coalesce(public.is_current_user_admin(), false) then
    raise exception 'Acesso negado: apenas administrador.' using errcode = '42501';
  end if;

  if p_report_id is null then
    return jsonb_build_object('ok', false, 'error', 'report_id_obrigatorio');
  end if;

  select er.id, er.status, er.user_id as reporter_id, er.event_id, er.reason
  into r
  from public.event_reports er
  where er.id = p_report_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'denuncia_nao_encontrada');
  end if;

  if r.status is distinct from 'pending' then
    if r.status = 'accepted' then
      return jsonb_build_object('ok', true, 'already_accepted', true);
    elsif r.status = 'rejected' then
      return jsonb_build_object('ok', false, 'error', 'denuncia_ja_rejeitada');
    else
      return jsonb_build_object('ok', false, 'error', 'status_invalido');
    end if;
  end if;

  update public.event_reports er
  set
    status = 'accepted',
    admin_response =
      'Sua denúncia foi recebida e confirmada. Obrigado por ajudar a manter a plataforma segura.',
    reviewed_at = timezone('utc', now()),
    reviewed_by = auth.uid()
  where er.id = p_report_id
    and er.status = 'pending';

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    return jsonb_build_object('ok', false, 'error', 'conflito_atualizacao');
  end if;

  v_y := extract(year from timezone('America/Sao_Paulo', now()))::integer;
  v_m := extract(month from timezone('America/Sao_Paulo', now()))::integer;

  if r.reporter_id is not null then
    v_team_r := public.resolve_user_ranking_team_id(r.reporter_id);
    if v_team_r is not null then
      insert into public.user_monthly_scores (
        user_id,
        team_id,
        year,
        month,
        event_points,
        interaction_points,
        penalty_points,
        interaction_raw_balance,
        report_reward_points,
        updated_at
      )
      values (
        r.reporter_id,
        v_team_r,
        v_y,
        v_m,
        0,
        0,
        0,
        0,
        c_reporter_reward,
        timezone('utc', now())
      )
      on conflict (user_id, team_id, year, month) do update set
        report_reward_points =
          coalesce(public.user_monthly_scores.report_reward_points, 0) + excluded.report_reward_points,
        updated_at = excluded.updated_at;
    end if;
  end if;

  select e.user_id
  into v_owner
  from public.events e
  where e.id = r.event_id
  limit 1;

  v_norm := lower(coalesce(r.reason, ''));
  v_norm := translate(
    v_norm,
    'áàâãäåāăąéèêëēĕėęěíìîïīĭįıóòôõöōŏőúùûüūŭůűñç',
    'aaaaaaaeaaaaeeeeeiiiiiiioooooooouuuuuuuunc'
  );

  v_penalty_apply :=
    trim(v_norm) = 'duplicado'
    or v_norm like '%duplicado%'
    or v_norm like '%duplicada%'
    or v_norm like '%fake%'
    or v_norm like '%falso%'
    or v_norm like '%fraude%';

  if v_penalty_apply and v_owner is not null then
    v_team_o := public.resolve_user_ranking_team_id(v_owner);
    if v_team_o is not null then
      insert into public.user_monthly_scores (
        user_id,
        team_id,
        year,
        month,
        event_points,
        interaction_points,
        penalty_points,
        interaction_raw_balance,
        report_reward_points,
        updated_at
      )
      values (
        v_owner,
        v_team_o,
        v_y,
        v_m,
        0,
        0,
        c_owner_penalty,
        0,
        0,
        timezone('utc', now())
      )
      on conflict (user_id, team_id, year, month) do update set
        penalty_points =
          coalesce(public.user_monthly_scores.penalty_points, 0) + excluded.penalty_points,
        updated_at = excluded.updated_at;
    end if;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.admin_accept_event_report(uuid) is
  'Admin: aceita denúncia pendente; +15 report_reward ao denunciante; +30 penalty ao autor se motivo duplicado/fake/fraude.';

revoke all on function public.admin_accept_event_report(uuid) from public;
grant execute on function public.admin_accept_event_report(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Compatível com chamadas antigas do painel: aplica só penalidade (sem mudar denúncia).
-- -----------------------------------------------------------------------------
create or replace function public.add_penalty_points(p_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team uuid;
  v_y int;
  v_m int;
  c_owner_penalty constant bigint := 30;
  v_norm text;
  v_apply boolean;
begin
  if not coalesce(public.is_current_user_admin(), false) then
    raise exception 'Acesso negado: apenas administrador.' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'p_user_id obrigatório';
  end if;

  v_norm := lower(coalesce(p_reason, ''));
  v_norm := translate(
    v_norm,
    'áàâãäåāăąéèêëēĕėęěíìîïīĭįıóòôõöōŏőúùûüūŭůűñç',
    'aaaaaaaeaaaaeeeeeiiiiiiioooooooouuuuuuuunc'
  );

  v_apply :=
    trim(v_norm) = 'duplicado'
    or v_norm like '%duplicado%'
    or v_norm like '%duplicada%'
    or v_norm like '%fake%'
    or v_norm like '%falso%'
    or v_norm like '%fraude%'
    or v_norm like '%duplicate_event%'
    or v_norm like '%fake_event%';

  if not v_apply then
    return;
  end if;

  v_team := public.resolve_user_ranking_team_id(p_user_id);
  if v_team is null then
    return;
  end if;

  v_y := extract(year from timezone('America/Sao_Paulo', now()))::integer;
  v_m := extract(month from timezone('America/Sao_Paulo', now()))::integer;

  insert into public.user_monthly_scores (
    user_id,
    team_id,
    year,
    month,
    event_points,
    interaction_points,
    penalty_points,
    interaction_raw_balance,
    report_reward_points,
    updated_at
  )
  values (
    p_user_id,
    v_team,
    v_y,
    v_m,
    0,
    0,
    c_owner_penalty,
    0,
    0,
    timezone('utc', now())
  )
  on conflict (user_id, team_id, year, month) do update set
    penalty_points =
      coalesce(public.user_monthly_scores.penalty_points, 0) + excluded.penalty_points,
    updated_at = excluded.updated_at;
end;
$$;

comment on function public.add_penalty_points(uuid, text) is
  'Admin: +30 penalty_points no mês (BR) se motivo indica duplicado/fake; usuário precisa de equipe no ranking.';

revoke all on function public.add_penalty_points(uuid, text) from public;
grant execute on function public.add_penalty_points(uuid, text) to authenticated;

/*
  NOTA — view ranking_current_month (Supabase)

  Inclua coalesce(ums.report_reward_points,0) na soma por membro, no mesmo
  período (ano/mês) que já usa EV, INT e penalidade. Exemplo de parcela do total:

    sum(
      coalesce(ums.event_points, 0)::numeric
      + coalesce(ums.interaction_points, 0)::numeric
      + coalesce(ums.report_reward_points, 0)::numeric
      - coalesce(ums.penalty_points, 0)::numeric
    )

  Se a view agrega só a partir de team_monthly_scores, atualize o trigger/job
  que mantém essa tabela para incluir report_reward_points.
*/
