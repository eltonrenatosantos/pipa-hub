-- =============================================================================
-- Denúncias: "lixeira" só esconde no perfil — o registo mantém-se (streak, admin).
-- Rode no SQL Editor do Supabase após public.event_reports existir.
-- Se já aplicou event_reports_ttl_and_delete_own.sql, pode remover a política DELETE.
-- =============================================================================

alter table public.event_reports
  add column if not exists hidden_from_user_at timestamptz;

comment on column public.event_reports.hidden_from_user_at is
  'Preenchido quando o utilizador remove da lista "Minhas denúncias"; linha mantém-se para moderação e contagem de reincidência.';

-- Deixa de permitir DELETE pelo utilizador (opcional mas recomendado).
drop policy if exists "event_reports_delete_own" on public.event_reports;

create or replace function public.hide_my_event_report(p_report_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.event_reports
  set hidden_from_user_at = timezone('utc', now())
  where id = p_report_id
    and user_id = auth.uid()
    and hidden_from_user_at is null;

  return found;
end;
$$;

comment on function public.hide_my_event_report(uuid) is
  'Oculta a denúncia na lista do utilizador; não apaga a linha.';

grant execute on function public.hide_my_event_report(uuid) to authenticated;
