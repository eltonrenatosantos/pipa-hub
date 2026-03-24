import { supabase } from "../supabase.js";

function parseDate(raw) {
  if (!raw) return null;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mapRankingTeam(row) {
  return {
    teamId: row?.team_id?.toString() ?? "",
    teamName: row?.team_name?.toString() ?? "Equipe",
    position: Number(row?.position ?? 0) || 0,
    mb: Number(row?.mb ?? 0) || 0,
    ev: Number(row?.ev ?? 0) || 0,
    pt: Number(row?.pt ?? 0) || 0,
    intPoints: Number(row?.int ?? 0) || 0,
    total:
      Number(row?.total_points ?? row?.totalpoint ?? row?.totalpoints ?? row?.total ?? 0) || 0,
  };
}

function mapMonthlyPrize(row) {
  if (!row) return null;

  const createdAt = parseDate(row.created_at);
  if (!createdAt) return null;

  const now = new Date();
  const isCurrentMonth =
    createdAt.getFullYear() === now.getFullYear() &&
    createdAt.getMonth() === now.getMonth();

  if (!isCurrentMonth) return null;

  return {
    title: row.title?.toString() ?? "",
    description: row.description?.toString() ?? "",
    imageUrl: row.image?.toString() ?? "",
    createdAt,
  };
}

function mapTeamEntryDetails(row) {
  if (!row) return null;

  return {
    id: row.id?.toString() ?? "",
    name: row.name?.toString() ?? "Equipe",
    city: row.city?.toString() ?? "",
    region: row.region?.toString() ?? "",
    founderName: row.founder_name?.toString() ?? "",
    foundedAt: row.founded_at?.toString() ?? "",
    logoUrl: row.logo_url?.toString() ?? "",
  };
}

function mapMyTeamState(row) {
  if (!row) return null;

  return {
    state: row.state?.toString() ?? "no_team",
    teamId: row.team_id?.toString() ?? "",
    teamName: row.team_name?.toString() ?? "",
  };
}

function filterRankingRowsBySearch(rows, trimmed) {
  if (!trimmed) return rows || [];
  const q = trimmed.toLowerCase();
  return (rows || []).filter((r) =>
    String(r.team_name ?? "")
      .toLowerCase()
      .includes(q)
  );
}

async function fetchRankingSourceRows() {
  const { data: rpcData, error: rpcError } = await supabase.rpc("get_ranking_public");

  if (!rpcError && rpcData != null) {
    return Array.isArray(rpcData) ? rpcData : [];
  }

  const { data, error } = await supabase
    .from("ranking_current_month")
    .select("*")
    .order("position", { ascending: true });

  if (error) throw error;
  return data || [];
}

/** Lista completa do mês atual (1ª chamada à API); use no hero e filtre no cliente. */
export async function loadRankingPageData(term = "") {
  const source = await fetchRankingSourceRows();
  const trimmed = term.trim();
  const listRows = filterRankingRowsBySearch(source, trimmed).map(mapRankingTeam);
  const allRows = source.map(mapRankingTeam);
  return { allRows, listRows };
}

export async function loadRanking(term = "") {
  const { listRows } = await loadRankingPageData(term);
  return listRows;
}

/**
 * Vencedor do ranking no mês calendário (ano/mês). Requer RPC get_ranking_month_champion no Supabase.
 */
export async function loadRankingMonthChampion(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;

  const { data, error } = await supabase.rpc("get_ranking_month_champion", {
    p_year: y,
    p_month: m,
  });

  if (error) {
    console.warn("get_ranking_month_champion:", error);
    return null;
  }

  if (data == null || typeof data !== "object") return null;

  const teamName = String(data.team_name ?? "").trim();
  const total = Number(data.total_points ?? 0) || 0;
  if (!teamName || total <= 0) return null;

  return {
    year: Number(data.year) || y,
    month: Number(data.month) || m,
    teamId: data.team_id?.toString() ?? "",
    teamName,
    totalPoints: total,
  };
}

export async function loadMonthlyPrize() {
  const { data, error } = await supabase
    .from("monthly_prize")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return mapMonthlyPrize(data);
}

export async function loadTeam(teamId) {
  const { data, error } = await supabase
    .from("teams")
    .select("id,name,city,region,founder_name,founded_at,logo_url")
    .eq("id", teamId)
    .maybeSingle();

  if (error) throw error;
  return mapTeamEntryDetails(data);
}

export async function getMyTeam() {
  const { data, error } = await supabase.rpc("get_my_team");
  if (error) throw error;
  return mapMyTeamState(data);
}

export async function requestTeamJoin(teamId) {
  const { data, error } = await supabase.rpc("request_team_join", {
    p_team_id: teamId,
  });

  if (error) throw error;
  return data?.message?.toString() ?? "Pedido enviado com sucesso.";
}
