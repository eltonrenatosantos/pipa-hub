-- =============================================================================
-- RODE ISTO PRIMEIRO — só este bloco, no SQL Editor do painel Supabase
-- (Authentication → não; é em Project → SQL Editor)
-- =============================================================================
-- Mostra se existe a função e o código dela. Se vier vazio, a função não está
-- no schema public ou tem outro nome.
-- =============================================================================

SELECT p.oid::regprocedure AS assinatura,
       pg_get_functiondef(p.oid) AS codigo_da_funcao
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'add_interaction_raw';
