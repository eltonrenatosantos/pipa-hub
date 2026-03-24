-- =============================================================================
-- Coloque SEU user_id (Auth → Users → copiar UUID) onde está YOUR_USER_ID
-- Rode no SQL Editor do Supabase.
-- =============================================================================

-- 1) Pontos do mês atual (servidor = UTC no extract da função add_interaction_raw)
SELECT
  ums.user_id,
  ums.team_id,
  ums.year,
  ums.month,
  ums.interaction_raw_balance,
  ums.interaction_points,
  ums.updated_at
FROM public.user_monthly_scores ums
WHERE ums.user_id = 'YOUR_USER_ID'::uuid
ORDER BY ums.year DESC, ums.month DESC
LIMIT 6;

-- 2) Últimas interações gravadas em eventos (se a tabela existir)
SELECT
  ei.id,
  ei.event_id,
  ei.type,
  ei.created_at
FROM public.event_interactions ei
WHERE ei.user_id = 'YOUR_USER_ID'::uuid
ORDER BY ei.created_at DESC
LIMIT 30;

-- 3) Time que a função usa (se for NULL, add_interaction_raw não grava nada)
SELECT public.resolve_user_ranking_team_id('YOUR_USER_ID'::uuid) AS team_id_para_ranking;

-- 4) Teste no painel (role postgres): força +0.1 — se subir interaction_raw_balance, o banco OK e o problema é app/RLS na RPC
-- SELECT public.add_interaction_raw('YOUR_USER_ID'::text, 0.1::numeric);
-- Depois rode de novo o SELECT do bloco (1) pro mês atual.
