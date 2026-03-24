import { supabase } from "../supabase.js";

function parseCoordinate(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseFloat(value.replace(",", "."));
  return null;
}

function isValidCoordinatePair(lat, lng) {
  if (lat === null || lng === null) return false;
  if (Number.isNaN(lat) || Number.isNaN(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}

function matchesSearch(event, normalizedTerm) {
  const searchableFields = [
    event.title,
    event.team,
    event.location,
    event.city,
    event.bairro,
    event.neighborhood,
    event.cep,
    event.zip_code,
    event.zipcode,
    event.postal_code,
  ];

  return searchableFields.some((value) => {
    if (value == null) return false;
    return value.toString().toLowerCase().includes(normalizedTerm);
  });
}

function filterEventsWithCoordinates(events) {
  return (events || []).filter((event) => {
    const date = event?.date ? new Date(event.date) : null;
    if (!date || Number.isNaN(date.getTime())) return false;
    const today = new Date();
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const eventOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (eventOnly < todayOnly) return false;
    const lat = parseCoordinate(event.lat ?? event.latitude);
    const lng = parseCoordinate(event.lng ?? event.longitude);
    return isValidCoordinatePair(lat, lng);
  });
}

export async function loadMapEvents({ term = "", eventId = "" } = {}) {
  let query = supabase
    .from("events")
    .select("*")
    .in("payment_status", ["paid", "approved"])
    .order("date", { ascending: true });

  if (eventId) {
    query = supabase
      .from("events")
      .select("*")
      .eq("id", eventId)
      .in("payment_status", ["paid", "approved"]);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = data || [];
  const normalizedTerm = term.trim().toLowerCase();
  const filteredRows = normalizedTerm
    ? rows.filter((event) => matchesSearch(event, normalizedTerm))
    : rows;

  return filterEventsWithCoordinates(filteredRows);
}
