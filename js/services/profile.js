import { supabase } from "../supabase.js";
import { isHighlightActiveEvent } from "./highlightLifecycle.js";

/** Lista “Eventos publicados”: antes cortava em 10 e eventos destacados podiam ficar de fora. */
const PROFILE_EVENT_LIMIT = 30;
/** Quantos eventos buscar antes de ordenar no cliente (destaque antigo + muitos grátis). */
const PROFILE_PUBLISHED_FETCH = 200;

function mergePublishedEventsById(rpcRows, directRows) {
  const map = new Map();
  for (const row of directRows || []) {
    if (row && row.id != null) map.set(row.id, row);
  }
  /** RPC (SECURITY DEFINER) costuma trazer linhas que RLS esconde no .from() — sobrescreve por id. */
  for (const row of rpcRows || []) {
    if (row && row.id != null) map.set(row.id, row);
  }
  return [...map.values()];
}

function mapMyTeamState(row) {
  if (!row) {
    return {
      state: "no_team",
      teamId: "",
      teamName: "",
      teamMemberId: "",
      role: "",
      status: "",
      city: "",
      region: "",
      logoUrl: "",
      ownerUserId: "",
    };
  }

  return {
    state: row.state?.toString() ?? "no_team",
    teamId: row.team_id?.toString() ?? "",
    teamName: row.team_name?.toString() ?? "",
    teamMemberId: row.team_member_id?.toString() ?? "",
    role: row.role?.toString() ?? "",
    status: row.status?.toString() ?? "",
    city: row.city?.toString() ?? "",
    region: row.region?.toString() ?? "",
    logoUrl: row.logo_url?.toString() ?? "",
    ownerUserId: row.owner_user_id?.toString() ?? "",
  };
}

function mapUser(user) {
  if (!user) return null;

  const metadata = user.user_metadata || {};

  return {
    id: user.id,
    email: user.email || "",
    fullName:
      metadata.full_name ||
      metadata.name ||
      user.email?.split("@")[0] ||
      "Usuário",
    avatarUrl: metadata.avatar_url || "",
    teamName: metadata.team_name || "",
  };
}

function sortProfileEvents(events) {
  return [...(events || [])].sort((a, b) => {
    const createdAtA = a?.created_at ? new Date(a.created_at).getTime() : 0;
    const createdAtB = b?.created_at ? new Date(b.created_at).getTime() : 0;

    if (createdAtA !== createdAtB) {
      return createdAtB - createdAtA;
    }

    const dateA = a?.date ? new Date(a.date).getTime() : 0;
    const dateB = b?.date ? new Date(b.date).getTime() : 0;
    return dateB - dateA;
  });
}

function isVisibleProfileEvent(event) {
  const rawDate = event?.date;
  if (!rawDate) return false;

  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) return false;

  const today = new Date();
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const eventOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return eventOnly >= todayOnly;
}

function publishedActivityTimeMs(event) {
  const t = (v) => (v ? new Date(v).getTime() : 0);
  const hs = t(event?.highlight_started_at);
  const ua = t(event?.updated_at);
  const ca = t(event?.created_at);
  return Math.max(hs, ua, ca);
}

function publishedTier(event) {
  const ps = String(event?.payment_status || "")
    .trim()
    .toLowerCase();
  if (!isHighlightActiveEvent(event)) return 1;
  if (ps === "awaiting_payment") return 2;
  return 3;
}

/** Lista “Eventos publicados”: destaque pago → aguardando PIX → grátis; dentro de cada grupo, o mais recente primeiro. */
function sortPublishedEventsForProfile(events) {
  return [...(events || [])].sort((a, b) => {
    const ta = publishedTier(a);
    const tb = publishedTier(b);
    if (tb !== ta) return tb - ta;
    return publishedActivityTimeMs(b) - publishedActivityTimeMs(a);
  });
}

export async function loadProfileSummary() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.warn("Perfil: getUser falhou, tratando como visitante", userError);
    return { user: null, team: mapMyTeamState(null), counts: {}, isAdmin: false };
  }
  if (!user) return { user: null, team: mapMyTeamState(null), counts: {}, isAdmin: false };

  const [myTeamResult, publishedRpc, publishedHead, likedResult, savedResult, isAdminResult] =
    await Promise.all([
      supabase.rpc("get_my_team"),
      supabase.rpc("count_my_published_events"),
      supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
      supabase
        .from("event_interactions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("type", "like"),
      supabase
        .from("event_interactions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("type", "save"),
      supabase.rpc("is_current_user_admin"),
    ]);

  if (myTeamResult.error) throw myTeamResult.error;

  let publishedCount = null;
  if (!publishedRpc.error && publishedRpc.data != null) {
    const n = Number(publishedRpc.data);
    if (!Number.isNaN(n)) publishedCount = n;
  }
  if (publishedCount === null) {
    if (publishedHead.error) throw publishedHead.error;
    publishedCount = publishedHead.count || 0;
  }
  if (likedResult.error) throw likedResult.error;
  if (savedResult.error) throw savedResult.error;
  if (isAdminResult.error) {
    console.warn("Não foi possível verificar acesso admin no perfil", isAdminResult.error);
  }

  return {
    user: mapUser(user),
    team: mapMyTeamState(myTeamResult.data),
    isAdmin: Boolean(isAdminResult.data),
    counts: {
      published: publishedCount || 0,
      liked: likedResult.count || 0,
      saved: savedResult.count || 0,
    },
  };
}

export async function loadProfileActivityEvents(type) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) return null;

  const normalizedType = type === "like" ? "like" : "save";

  const { data: interactions, error: interactionsError } = await supabase
    .from("event_interactions")
    .select("event_id,created_at")
    .eq("user_id", user.id)
    .eq("type", normalizedType)
    .order("created_at", { ascending: false })
    .limit(PROFILE_EVENT_LIMIT * 3);

  if (interactionsError) throw interactionsError;

  const orderedIds = [...new Set((interactions || []).map((item) => item.event_id).filter(Boolean))]
    .slice(0, PROFILE_EVENT_LIMIT);
  if (!orderedIds.length) return [];

  const { data: relatedEvents, error: eventsError } = await supabase
    .from("events")
    .select("id,title,team,city,location,date,image,payment_status,plan_type")
    .in("id", orderedIds);

  if (eventsError) throw eventsError;

  const eventsById = Object.fromEntries((relatedEvents || []).map((event) => [event.id, event]));
  const merged = orderedIds
    .map((id) => eventsById[id])
    .filter((event) => event && isVisibleProfileEvent(event))
    .slice(0, PROFILE_EVENT_LIMIT);
  return sortProfileEvents(merged);
}

export async function loadPublishedProfileEvents() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) return null;

  const publishedSelectFull =
    "id,title,team,city,location,date,image,payment_status,plan_type,created_at,updated_at,highlight_started_at";
  const publishedSelectMinimal =
    "id,title,team,city,location,date,image,payment_status,plan_type,created_at";

  const [rpcList, directFirst] = await Promise.all([
    supabase.rpc("get_my_published_events", {
      p_limit: PROFILE_PUBLISHED_FETCH,
    }),
    supabase
      .from("events")
      .select(publishedSelectFull)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PROFILE_PUBLISHED_FETCH),
  ]);

  let directData = directFirst.data;
  let directError = directFirst.error;

  if (directError) {
    const retry = await supabase
      .from("events")
      .select(publishedSelectMinimal)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PROFILE_PUBLISHED_FETCH);
    directData = retry.data;
    directError = retry.error;
  }

  const rpcRows = !rpcList.error && Array.isArray(rpcList.data) ? rpcList.data : [];
  if (rpcList.error) {
    console.warn("get_my_published_events:", rpcList.error);
  }

  let combined = mergePublishedEventsById(rpcRows, directData || []).filter(isVisibleProfileEvent);

  if (!combined.length && (directError || rpcList.error)) {
    console.warn("Fallback ao carregar eventos publicados (lista vazia após merge)", {
      directError,
      rpcError: rpcList.error,
    });
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("events")
      .select(publishedSelectFull)
      .eq("user_id", user.id)
      .limit(PROFILE_PUBLISHED_FETCH);

    if (fallbackError) {
      const retry2 = await supabase
        .from("events")
        .select(publishedSelectMinimal)
        .eq("user_id", user.id)
        .limit(PROFILE_PUBLISHED_FETCH);
      if (retry2.error) throw retry2.error;
      combined = (retry2.data || []).filter(isVisibleProfileEvent);
    } else {
      combined = (fallbackData || []).filter(isVisibleProfileEvent);
    }
  }

  return sortPublishedEventsForProfile(combined).slice(0, PROFILE_EVENT_LIMIT);
}
