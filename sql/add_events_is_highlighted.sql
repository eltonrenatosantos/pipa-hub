/*
================================================================================
  ATENÇÃO — LEIA ANTES DE COLAR NO SUPABASE
================================================================================

  O QUE ISTO FAZ
  ---------------
  Cria a coluna `is_highlighted` na tabela `public.events`. Sem ela, o botão
  "Destacar" / "Remover destaque" no perfil NÃO grava no banco e pode dar erro.

  O QUE VOCÊ PRECISA FAZER (obrigatório, uma vez)
  ------------------------------------------------
  1. Abra o painel do Supabase do SEU projeto.
  2. Menu lateral: SQL Editor.
  3. New query (nova consulta).
  4. Apague o conteúdo do editor.
  5. Copie SÓ o bloco entre as linhas "--- COPIE DAQUI ---" e "--- ATÉ AQUI ---".
  6. Cole no SQL Editor e clique em RUN (Executar).
  7. Deve aparecer "Success". Se der erro, leia a mensagem (nome da tabela,
     permissões, etc.).

  DEPOIS DE RODAR O SQL
  ----------------------
  - Teste o botão Destacar no app (perfil → eventos publicados).
  - Se ainda falhar com erro de permissão: no Supabase, Authentication → Policies
    (ou Table editor → events → RLS), confira se o usuário logado pode dar
    UPDATE nas próprias linhas de `events` (normalmente user_id = auth.uid()).

  NÃO ALTERE
  ----------
  - Fluxo de criação/publicação de eventos (outros INSERTs) — este script só
    adiciona coluna + índice.

================================================================================
*/

--- COPIE DAQUI ---
alter table public.events
  add column if not exists is_highlighted boolean not null default false;

comment on column public.events.is_highlighted is 'Destaque escolhido pelo autor (UI Destacar). Apenas um true por user_id; independente de plan_type pago.';

create index if not exists idx_events_user_is_highlighted
  on public.events (user_id)
  where is_highlighted = true;
--- ATÉ AQUI ---
