import { supabase } from "../supabase.js";

/** Data YYYY-MM-DD no fuso America/Sao_Paulo (alinhado ao SQL do banner). */
export function todaySaoPauloString() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/**
 * Campanhas ativas para a home: is_active, período válido hoje (SP).
 * Ordem: `created_at` ascendente — a home faz rotação em loop nessa ordem.
 * Retorna array vazio se não houver ou em erro.
 */
export async function loadActiveHomeAdvertisingList() {
  const today = todaySaoPauloString();

  const { data, error } = await supabase
    .from("home_advertising")
    .select("id, company_name, image_url, start_date, end_date, is_active, link_url, created_at")
    .eq("is_active", true)
    .lte("start_date", today)
    .gte("end_date", today)
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("home_advertising:", error);
    return [];
  }

  return (data || []).filter((r) => r?.image_url && String(r.image_url).trim() !== "");
}
