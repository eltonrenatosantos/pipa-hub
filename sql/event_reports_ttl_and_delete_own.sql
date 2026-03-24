-- =============================================================================
-- Denúncias: TTL 3 dias (aceitas / não recebidas) no backend
-- NOTA: A "lixeira" no perfil passou a soft-delete — ver event_reports_soft_hide_from_user.sql
-- =============================================================================

-- (A política DELETE foi substituída por hide_my_event_report; mantemos drop idempotente.)
drop policy if exists "event_reports_delete_own" on public.event_reports;

-- Limpeza: apaga definitivamente denúncias já analisadas há mais de 3 dias.
-- Agendar no Supabase: Database → Cron (ou extensão pg_cron), ex. diário:
--   select public.cleanup_expired_event_reports();
create or replace function public.cleanup_expired_event_reports()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.event_reports
  where status in ('accepted', 'rejected')
    and reviewed_at is not null
    and reviewed_at < (timezone('utc', now()) - interval '3 days');

  get diagnostics deleted_count = row_count;
  return coalesce(deleted_count, 0);
end;
$$;

comment on function public.cleanup_expired_event_reports() is
  'Remove denúncias aceitas ou não recebidas com reviewed_at há mais de 3 dias. Pendências não são apagadas.';

grant execute on function public.cleanup_expired_event_reports() to service_role;
-- Opcional: permitir chamada por cron como postgres; em muitos projetos só service_role agenda jobs.
