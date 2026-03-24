/*
  =============================================================================
  DIAGNÓSTICO — interações fracionadas (add_interaction_raw)
  =============================================================================
  IMPORTANTE — por que dá erro ao “colar tudo”:
  • O Supabase executa o script inteiro; vários SELECT seguidos às vezes falham
    ou confundem. Rode UM bloco por vez (copie só da linha SELECT até o ;).
  • Os blocos 4 e 5 estão comentados com / * ... * /. Se você descomentar e
    deixar YOUR_USER_ID sem trocar por um UUID real, dá: invalid input syntax
    for type uuid.

  Atalho: use diagnose_interaction_fractions_SIMPLE.sql (uma query só).

  O app chama add_interaction_raw após inserir em event_interactions (8s + clique).
  =============================================================================
*/

-- -----------------------------------------------------------------------------
-- 1) Função add_interaction_raw — copie SÓ este SELECT e rode
-- -----------------------------------------------------------------------------
SELECT pg_get_functiondef(p.oid) AS definicao
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'add_interaction_raw';

-- Se não retornar linha, a função não existe no schema public.


-- -----------------------------------------------------------------------------
-- 2) Outras funções com "interaction" no nome (para achar agregação / conversão)
-- -----------------------------------------------------------------------------
SELECT p.proname AS nome,
       pg_get_function_identity_arguments(p.oid) AS argumentos
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (
    p.proname ILIKE '%interaction%'
    OR p.proname ILIKE '%interaction_raw%'
    OR p.proname ILIKE '%monthly_score%'
  )
ORDER BY p.proname;


-- -----------------------------------------------------------------------------
-- 3) Colunas da tabela user_monthly_scores (ajuste o nome se for outro)
-- -----------------------------------------------------------------------------
SELECT column_name,
       data_type,
       is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_monthly_scores'
ORDER BY ordinal_position;


-- -----------------------------------------------------------------------------
-- 4) Sua linha no mês atual (troque o UUID pelo seu user_id do auth)
-- -----------------------------------------------------------------------------
-- Descomente e troque YOUR_USER_ID:

/*
SELECT ums.*
FROM public.user_monthly_scores ums
WHERE ums.user_id = 'YOUR_USER_ID'::uuid
  AND ums.year = EXTRACT(YEAR FROM timezone('America/Sao_Paulo', now()))::integer
  AND ums.month = EXTRACT(MONTH FROM timezone('America/Sao_Paulo', now()))::integer
ORDER BY ums.team_id;
*/


-- -----------------------------------------------------------------------------
-- 5) Últimas linhas inseridas em event_interactions (confere se o PWA gravou)
-- -----------------------------------------------------------------------------
-- Troque YOUR_USER_ID:

/*
SELECT ei.id, ei.event_id, ei.type, ei.created_at
FROM public.event_interactions ei
WHERE ei.user_id = 'YOUR_USER_ID'::uuid
ORDER BY ei.created_at DESC
LIMIT 20;
*/


-- -----------------------------------------------------------------------------
-- 6) Triggers em event_interactions (se existir, pode somar pontos automaticamente)
-- -----------------------------------------------------------------------------
SELECT tg.tgname AS trigger_name,
       p.proname AS function_name
FROM pg_trigger tg
JOIN pg_class c ON c.oid = tg.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_proc p ON p.oid = tg.tgfoid
WHERE n.nspname = 'public'
  AND c.relname = 'event_interactions'
  AND NOT tg.tgisinternal;


-- -----------------------------------------------------------------------------
-- O que conferir na leitura
-- -----------------------------------------------------------------------------
-- • add_interaction_raw: incrementa interaction_raw_balance? em qual tabela?
-- • Há conversão de "soma fracionada >= 1" → interaction_points +1?
-- • year/month usados batem com America/Sao_Paulo (ou o mesmo da view de ranking)?
-- • user_monthly_scores exige team_id — a função recebe team_id ou descobre pelo usuário?
