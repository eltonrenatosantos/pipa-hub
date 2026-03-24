/*
================================================================================
  RLS em `public.events` — dono vê o próprio evento após upgrade; admin vê fila
================================================================================

  Sintomas sem estas políticas:
  - Após “Destacar” (plan_type 7/15/30 + awaiting_payment), o evento SOME da
    lista “Eventos publicados” no perfil.
  - No painel Admin → Aprovações, a fila fica vazia ou o contador não sobe,
    porque o SELECT não enxerga linhas de outros usuários.

  O QUE FAZER
  -----------
  1. Supabase → SQL Editor → cole e rode o bloco entre --- COPIE --- e --- FIM ---.
  2. Ajuste nomes de políticas se já existirem (erro “policy already exists”):
     use DROP POLICY ... ou outro nome.

  A função `is_current_user_admin()` já é usada no app (RPC). Ela precisa
  existir e retornar true para contas administrativas.

  Alternativa mais robusta: rode também `sql/rpc_events_security_definer.sql`
  (funções SECURITY DEFINER usadas pelo app para lista do perfil e fila admin).
*/

--- COPIE DAQUI ---

-- Dono sempre lê os próprios eventos (qualquer plan_type / payment_status)
drop policy if exists "events_select_owner_own_rows" on public.events;
create policy "events_select_owner_own_rows"
  on public.events
  for select
  to authenticated
  using (user_id = auth.uid());

-- Admin lê todas as linhas (fila de aprovação / moderação)
drop policy if exists "events_select_admin_all" on public.events;
create policy "events_select_admin_all"
  on public.events
  for select
  to authenticated
  using (coalesce(is_current_user_admin(), false));

-- UPDATE: dono altera o próprio evento (ex.: free → awaiting_payment)
drop policy if exists "events_update_owner_own_rows" on public.events;
create policy "events_update_owner_own_rows"
  on public.events
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- UPDATE/DELETE: admin modera qualquer evento (aprovar PIX, reprovar, etc.)
drop policy if exists "events_update_admin_all" on public.events;
create policy "events_update_admin_all"
  on public.events
  for update
  to authenticated
  using (coalesce(is_current_user_admin(), false))
  with check (coalesce(is_current_user_admin(), false));

drop policy if exists "events_delete_admin_all" on public.events;
create policy "events_delete_admin_all"
  on public.events
  for delete
  to authenticated
  using (coalesce(is_current_user_admin(), false));

--- ATÉ AQUI ---
