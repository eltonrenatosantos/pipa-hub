import { supabase } from "../supabase.js";

const LS_VIEWER_KEY = "webpipa_ad_viewer_v1";
const LS_EVENT_TS_PREFIX = "webpipa_home_ad_event_ts_v2";
const IMPRESSION_COOLDOWN_MS = 30000;
const CLICK_DEBOUNCE_MS = 2000;

/**
 * Identificador estável por dispositivo/sessão: utilizador autenticado ou UUID anónimo.
 */
export async function getAdViewerKey() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user?.id) {
    return `u:${session.user.id}`;
  }
  try {
    let anon = localStorage.getItem(LS_VIEWER_KEY);
    if (!anon || anon.length < 10) {
      anon = crypto.randomUUID();
      localStorage.setItem(LS_VIEWER_KEY, anon);
    }
    return `a:${anon}`;
  } catch {
    return `a:${crypto.randomUUID()}`;
  }
}

function fireRpc(adId, kind) {
  if (!adId) return;
  getAdViewerKey()
    .then((viewerKey) => {
      const cooldownMs = kind === "click" ? CLICK_DEBOUNCE_MS : IMPRESSION_COOLDOWN_MS;
      const storageKey = `${LS_EVENT_TS_PREFIX}:${kind}:${viewerKey}:${adId}`;
      try {
        const last = Number(localStorage.getItem(storageKey) || "0");
        const now = Date.now();
        if (last && now - last < cooldownMs) return { skipped: true };
        localStorage.setItem(storageKey, String(now));
      } catch {
        // Sem storage local, seguimos para o RPC.
      }

      return supabase.rpc("record_home_ad_event", {
        p_ad_id: adId,
        p_kind: kind,
        p_viewer_key: viewerKey,
      });
    })
    .then((result) => {
      if (!result || result.skipped) return;
      const { error } = result;
      if (error) console.warn("record_home_ad_event:", error.message);
    })
    .catch(() => {});
}

/** Cada vez que o banner desta campanha é mostrado na home (inclui rotação). */
export function recordHomeAdImpression(adId) {
  fireRpc(adId, "impression");
}

/** Clique no cartão com link. */
export function recordHomeAdClick(adId) {
  fireRpc(adId, "click");
}
