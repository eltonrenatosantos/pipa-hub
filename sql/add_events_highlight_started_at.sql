/*
  Coluna usada quando o admin confirma o PIX: inicia a janela de destaque (7/15/30 dias)
  na home. Sem ela, o UPDATE em admin.html pode falhar.
  Rode uma vez no SQL Editor do Supabase.
*/

--- COPIE DAQUI ---
alter table public.events
  add column if not exists highlight_started_at timestamptz;

comment on column public.events.highlight_started_at is 'Início do período de destaque pago (definido ao aprovar pagamento no admin).';

create index if not exists idx_events_highlight_started_at
  on public.events (highlight_started_at desc)
  where highlight_started_at is not null;
--- ATÉ AQUI ---
