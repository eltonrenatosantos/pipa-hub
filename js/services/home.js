import { supabase } from "../supabase.js";
import { highlightDisplayPriority } from "./highlightLifecycle.js";

function parseDate(raw) {
  if (!raw) return null;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function loadHomeEvents() {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("date", { ascending: true });

  if (error) throw error;

  let events = (data || []).filter((event) =>
    event?.payment_status === "paid" || event?.payment_status === "approved"
  );

  const today = new Date();
  const minDate = new Date(today);
  minDate.setDate(minDate.getDate() - 1);

  events = events.filter((event) => {
    const eventDate = parseDate(event?.date);
    return eventDate ? eventDate > minDate : false;
  });

  events.sort((left, right) => {
    const leftPriority = highlightDisplayPriority(left);
    const rightPriority = highlightDisplayPriority(right);

    if (rightPriority !== leftPriority) {
      return rightPriority - leftPriority;
    }

    const leftDate = parseDate(left?.date);
    const rightDate = parseDate(right?.date);

    if (!leftDate && !rightDate) return 0;
    if (!leftDate) return 1;
    if (!rightDate) return -1;

    return leftDate - rightDate;
  });

  return events;
}

/**
 * Lista completa para o painel admin (editar/excluir).
 * Inclui gratuitos pendentes, awaiting_payment, etc. — não usar a mesma regra da home.
 */
export async function loadAllEventsForAdmin() {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data || [];
}
