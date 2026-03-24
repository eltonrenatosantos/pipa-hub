-- =============================================================================
-- Trigger de notificações automáticas de eventos
-- Política atual:
--   • criação de evento grátis não gera notificação
--   • aprovação/reprovação já são emitidas por admin_review_event
--   • este trigger existe só como camada de segurança/compatibilidade e não gera duplicados
-- =============================================================================

create or replace function public.sync_event_notices()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A automação de notificações de evento é feita por public.admin_review_event.
  -- Este gatilho permanece como placeholder para evitar duplicidade caso o SQL
  -- antigo tenha sido aplicado em algum ambiente.
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_event_notices on public.events;
create trigger trg_sync_event_notices
after insert or update of payment_status, renewal_payment_status
on public.events
for each row
execute function public.sync_event_notices();

comment on function public.sync_event_notices() is
  'Placeholder sem efeito para compatibilidade. A geração de user_notices acontece em admin_review_event.';
