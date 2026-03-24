/**
 * Mescla a lista de membros com o payload do core (user_monthly_scores / team_monthly_scores).
 * RPC: public.team_members_monthly_scores_payload(p_team_id).
 */
export async function mergeTeamMembersMonthlyScores(supabase, teamId, members) {
  if (!teamId || !Array.isArray(members) || members.length === 0) {
    return members;
  }

  const { data, error } = await supabase.rpc("team_members_monthly_scores_payload", {
    p_team_id: teamId,
  });

  if (error) {
    console.warn("team_members_monthly_scores_payload:", error);
    return members;
  }

  const rows = Array.isArray(data) ? data : [];
  const byUser = new Map(rows.map((r) => [r.user_id, r]));

  return members.map((m) => {
    const s = byUser.get(m.user_id);
    if (!s) return m;
    return { ...m, ...s };
  });
}
