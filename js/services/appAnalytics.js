import { supabase } from "../supabase.js";
import { getAdViewerKey } from "./homeAdAnalytics.js";

async function recordUsage(kind, targetEventId = null) {
  const viewerKey = await getAdViewerKey();
  const params = {
    p_kind: kind,
    p_viewer_key: viewerKey,
  };

  if (targetEventId) {
    params.p_target_event_id = targetEventId;
  }

  const { error } = await supabase.rpc("record_app_usage_event", params);
  if (error) {
    console.warn("record_app_usage_event:", error.message);
  }
}

export function recordAppOpen() {
  return recordUsage("app_open");
}

export function recordEventView(eventId) {
  const targetEventId = String(eventId || "").trim();
  if (!targetEventId) return Promise.resolve();
  return recordUsage("event_view", targetEventId);
}
