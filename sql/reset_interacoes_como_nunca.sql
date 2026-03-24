/*
  =============================================================================
  “Como se nunca tivessem usado” = apaga RASTRO DE INTERAÇÃO + PONTOS DO RANKING
  Não apaga conta (auth.users). Não apaga eventos publicados (tabela events), a menos
  que você rode o bloco opcional — aí some o evento do mapa também.
  Faça BACKUP ou use projeto de teste antes.
  =============================================================================
*/

-- ---------------------------------------------------------------------------
-- A) UM usuário só — troque YOUR_USER_ID
-- ---------------------------------------------------------------------------
BEGIN;

DELETE FROM public.event_interactions
WHERE user_id = 'YOUR_USER_ID'::uuid;

DELETE FROM public.user_monthly_scores
WHERE user_id = 'YOUR_USER_ID'::uuid;

-- Opcional: denúncias que ELE fez (não apaga denúncias contra o evento dele, se existir outra tabela)
-- DELETE FROM public.event_reports WHERE user_id = 'YOUR_USER_ID'::uuid;

-- Opcional: sai dos times (como se nunca tivesse entrado)
-- DELETE FROM public.team_members WHERE user_id = 'YOUR_USER_ID'::uuid;

-- Opcional: apaga EVENTOS que ELE criou (some da plataforma de verdade)
-- DELETE FROM public.events WHERE user_id = 'YOUR_USER_ID'::uuid;

COMMIT;
-- Se algo der errado antes do COMMIT: ROLLBACK;


-- ---------------------------------------------------------------------------
-- B) TODOS os usuários — CUIDADO: zera interação e pontos de TODO MUNDO
--    Rode só se tiver CERTEZA. Prefira staging.
-- ---------------------------------------------------------------------------
/*
BEGIN;

DELETE FROM public.event_interactions;
DELETE FROM public.user_monthly_scores;

-- Opcional:
-- DELETE FROM public.event_reports;

COMMIT;
*/


-- ---------------------------------------------------------------------------
-- C) Depois de apagar em massa, totais por TIME podem ficar errados no mês.
--    Se existir tabela team_monthly_scores e o ranking ficar estranho, no painel
--    você pode truncar só essa tabela (ou rodar funções de recalcular, se tiverem).
--    Exemplo SÓ se a tabela existir e você souber o que faz:
-- TRUNCATE public.team_monthly_scores RESTART IDENTITY CASCADE;
-- =============================================================================
