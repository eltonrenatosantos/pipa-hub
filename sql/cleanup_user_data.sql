/*
  =============================================================================
  LIMPEZA DE DADOS POR USUÁRIO — use só em dev/staging ou com backup.
  Troque YOUR_USER_ID pelo UUID (Auth → Users).
  Rode em ORDEM (de cima pra baixo). Comente o que NÃO quiser apagar.
  =============================================================================
  Ordem geral: tabelas que referenciam o user (filhas) antes de mexer em perfil.
  Se der erro de FK, o Supabase vai dizer qual tabela ainda referencia o user —
  apague/ajuste lá também (ex.: eventos criados por ele, etc.).
  =============================================================================
*/

-- 0) Ver o que esse user tem (só leitura)
SELECT 'event_interactions' AS t, COUNT(*)::bigint AS n
FROM public.event_interactions WHERE user_id = 'YOUR_USER_ID'::uuid
UNION ALL
SELECT 'event_reports', COUNT(*)::bigint
FROM public.event_reports WHERE user_id = 'YOUR_USER_ID'::uuid
UNION ALL
SELECT 'user_monthly_scores', COUNT(*)::bigint
FROM public.user_monthly_scores WHERE user_id = 'YOUR_USER_ID'::uuid
UNION ALL
SELECT 'team_members', COUNT(*)::bigint
FROM public.team_members WHERE user_id = 'YOUR_USER_ID'::uuid;


-- -----------------------------------------------------------------------------
-- 1) Só “zerar bagunça” de interação / ranking do user (mantém conta e perfil)
-- -----------------------------------------------------------------------------
BEGIN;

-- DELETE FROM public.event_interactions WHERE user_id = 'YOUR_USER_ID'::uuid;
-- DELETE FROM public.event_reports WHERE user_id = 'YOUR_USER_ID'::uuid;
-- DELETE FROM public.user_monthly_scores WHERE user_id = 'YOUR_USER_ID'::uuid;

-- COMMIT;
-- ROLLBACK;  -- use se estiver só testando


-- -----------------------------------------------------------------------------
-- 2) Tirar o user de times (se existir linha e você quiser “desvincular”)
-- -----------------------------------------------------------------------------
-- DELETE FROM public.team_members WHERE user_id = 'YOUR_USER_ID'::uuid;


-- -----------------------------------------------------------------------------
-- 3) Eventos criados por esse user (no app a coluna costuma ser user_id)
-- -----------------------------------------------------------------------------
-- Cuidado: apaga evento de verdade. Liste antes:
-- SELECT id, title FROM public.events WHERE user_id = 'YOUR_USER_ID'::uuid;
-- DELETE FROM public.events WHERE user_id = 'YOUR_USER_ID'::uuid;


-- -----------------------------------------------------------------------------
-- 4) Perfil público (tabela profiles, se usar)
-- -----------------------------------------------------------------------------
-- DELETE FROM public.profiles WHERE id = 'YOUR_USER_ID'::uuid;


-- -----------------------------------------------------------------------------
-- 5) Conta Auth — normalmente pelo painel: Authentication → Users → delete user
--     (apagar só no SQL em auth.users exige cuidado com cascata e políticas.)
-- =============================================================================
