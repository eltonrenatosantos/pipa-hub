import { supabase } from "../supabase.js";

const DRAFT_STORAGE_KEY = "eventDraft";
const LAST_PUBLISH_STORAGE_KEY = "lastEventPublish";
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_SIZE_MB = 15;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
/** Valores de produção (PIX). */
const PLAN_PRICES = {
  "7": 89,
  "15": 139,
  "30": 199,
};

export function savePublishDraft(draft) {
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

export function loadPublishDraft() {
  const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
  if (!saved) return null;

  try {
    return JSON.parse(saved);
  } catch (error) {
    console.error("Erro ao restaurar draft", error);
    clearPublishDraft();
    return null;
  }
}

export function clearPublishDraft() {
  localStorage.removeItem(DRAFT_STORAGE_KEY);
}

export function millisecondsSinceLastPublish() {
  const lastPublish = localStorage.getItem(LAST_PUBLISH_STORAGE_KEY);
  if (!lastPublish) return null;

  const parsed = parseInt(lastPublish, 10);
  if (Number.isNaN(parsed)) return null;
  return Date.now() - parsed;
}

export function markPublishNow() {
  localStorage.setItem(LAST_PUBLISH_STORAGE_KEY, Date.now().toString());
}

export async function getMyPublishTeam() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase.rpc("get_my_team");
  if (error) throw error;
  return data || null;
}

export function validateImageFile(file) {
  if (!file) {
    return "Adicione a arte do evento.";
  }

  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return "Formato de imagem não suportado. Use JPG, PNG ou WEBP.";
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return `A imagem é muito grande. Envie um arquivo de até ${MAX_IMAGE_SIZE_MB}MB.`;
  }

  return null;
}

export async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error("Não foi possível ler a imagem selecionada."));
    };

    reader.onload = (event) => {
      img.src = event.target.result;
    };

    img.onerror = () => {
      reject(new Error("A imagem selecionada está corrompida ou em um formato não suportado."));
    };

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const maxWidth = 1200;
      const scale = Math.min(maxWidth / img.width, 1);

      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Não foi possível processar a imagem selecionada."));
        return;
      }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Não foi possível comprimir a imagem selecionada."));
            return;
          }

          resolve(blob);
        },
        "image/jpeg",
        0.68
      );
    };

    reader.readAsDataURL(file);
  });
}

export async function uploadEventImage(file) {
  const safeName = file.name
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]/g, "_");

  const fileName = `${Date.now()}_${safeName}`;
  const compressedImage = await compressImage(file);

  const { error: uploadError } = await supabase
    .storage
    .from("event-images")
    .upload(fileName, compressedImage);

  if (uploadError) throw uploadError;

  const { data } = supabase.storage
    .from("event-images")
    .getPublicUrl(fileName);

  return data.publicUrl;
}

export function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

export function formatCep(value) {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export async function fetchCep(cep) {
  const cleanCep = onlyDigits(cep);

  if (cleanCep.length !== 8) {
    throw new Error("Informe um CEP válido com 8 números.");
  }

  const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
  const data = await response.json();

  if (!response.ok || data.erro) {
    throw new Error("CEP não encontrado. Revise o número informado.");
  }

  return data;
}

export function buildLocation(street, number, neighborhood) {
  const safeStreet = String(street || "").trim();
  const safeNumber = String(number || "").trim();
  const safeNeighborhood = String(neighborhood || "").trim();

  if (!safeStreet || !safeNumber || !safeNeighborhood) {
    return "";
  }

  return `${safeStreet}, ${safeNumber}, ${safeNeighborhood}`;
}

export function buildLocationPreview(street, neighborhood) {
  const safeStreet = String(street || "").trim();
  const safeNeighborhood = String(neighborhood || "").trim();

  if (!safeStreet && !safeNeighborhood) {
    return "";
  }

  if (safeStreet && safeNeighborhood) {
    return `${safeStreet}, , ${safeNeighborhood}`;
  }

  return safeStreet || safeNeighborhood;
}

function getGeocodeEndpoint() {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/api/geocode`;
  }

  return "/api/geocode";
}

export function parseAddressParts(location) {
  const parts = (location || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    parts,
    street: parts[0] || "",
    number: parts[1] || "",
    neighborhood: parts[2] || "",
  };
}

export function isCompleteAddress(location) {
  const { parts, street, number, neighborhood } = parseAddressParts(location);

  if (parts.length < 3) return false;
  if (!street || !number || !neighborhood) return false;
  if (!/\d/.test(number)) return false;

  return true;
}

export async function geocode(city, location, cep = "", uf = "") {
  try {
    if (!isCompleteAddress(location)) {
      return { lat: null, lng: null, place: null };
    }

    const endpoint = getGeocodeEndpoint();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        city,
        location,
        cep,
        uf,
      }),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok || !data || data.ok === false) {
      throw new Error(
        String(data?.message || "Não foi possível localizar esse endereço. Revise rua, número e bairro.")
      );
    }

    const lat = Number(data.lat);
    const lng = Number(data.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return { lat: null, lng: null, place: null };
    }

    return {
      lat,
      lng,
      place: data.place || null,
    };
  } catch (error) {
    const message = String(error?.message || error || "");
    console.error("Erro ao buscar coordenadas Google", error);
    return { lat: null, lng: null, place: null };
  }
}

export function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

export function similarEventName(a, b) {
  const t1 = normalizeText(a);
  const t2 = normalizeText(b);

  if (t1 === t2) return true;
  if (t1.includes(t2) || t2.includes(t1)) return true;

  return false;
}

export function mapPlanToEventType(plan) {
  if (plan === "free") return "free";
  if (plan === "7") return "highlight_7";
  if (plan === "15") return "highlight_15";
  if (plan === "30") return "highlight_30";
  return null;
}

export function normalizePlanType(plan) {
  return String(plan || "").replace(/[^0-9]/g, "");
}

export function getPlanPrice(plan) {
  const normalizedPlan = normalizePlanType(plan);
  return PLAN_PRICES[normalizedPlan] || 0;
}

export async function countEventsForInstagramOnDate({ instagram, date }) {
  if (!instagram) return 0;

  const { data, error } = await supabase
    .from("events")
    .select("id")
    .eq("instagram", instagram)
    .eq("date", date);

  if (error) throw error;
  return (data || []).length;
}

export async function loadEventsByDate(date) {
  const { data, error } = await supabase
    .from("events")
    .select("id,title,city")
    .eq("date", date);

  if (error) throw error;
  return data || [];
}

export async function findAwaitingPayment({ userId, plan }) {
  const { data, error } = await supabase
    .from("events")
    .select("id,payment_reference,plan_type,payment_amount")
    .eq("user_id", userId)
    .eq("payment_status", "awaiting_payment")
    .eq("plan_type", plan)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

/** Pagamento PIX já gerado para este evento (reabrir QR). */
export async function findAwaitingPaymentForEvent({ userId, eventId }) {
  const { data, error } = await supabase
    .from("events")
    .select("id,payment_reference,plan_type,payment_amount")
    .eq("user_id", userId)
    .eq("id", eventId)
    .eq("payment_status", "awaiting_payment")
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

/**
 * Destacar evento gratuito existente: passa a plano pago e aguarda confirmação do PIX (admin).
 */
export async function upgradeFreeEventToAwaitingPayment({
  eventId,
  plan,
  paymentReference,
  paymentAmount,
}) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error("Faça login para continuar.");

  const { data: row, error: fetchError } = await supabase
    .from("events")
    .select("id,user_id,plan_type,payment_status")
    .eq("id", eventId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!row || row.user_id !== user.id) {
    throw new Error("Você não pode alterar este evento.");
  }

  const pt = String(row.plan_type || "").trim().toLowerCase();
  if (pt !== "free") {
    throw new Error("Só é possível usar este fluxo em eventos gratuitos.");
  }

  if (String(row.payment_status || "") === "awaiting_payment") {
    throw new Error("Este evento já está aguardando confirmação de pagamento.");
  }

  if (String(row.payment_status || "").trim().toLowerCase() === "rejected") {
    throw new Error("Este evento foi rejeitado e não pode ser destacado.");
  }

  // Same shape as paid insert in publish.js (string plan_type keys for PLAN_PRICES / home / admin).
  const planDigits = normalizePlanType(plan);
  const planTypeStored =
    planDigits === "7" || planDigits === "15" || planDigits === "30"
      ? planDigits
      : String(plan ?? "").trim();

  const { error: updateError } = await supabase
    .from("events")
    .update({
      plan_type: planTypeStored,
      payment_reference: paymentReference,
      payment_amount: paymentAmount,
      payment_status: "awaiting_payment",
    })
    .eq("id", eventId)
    .eq("user_id", user.id);

  if (updateError) throw updateError;
}

export async function insertEvent(eventPayload) {
  const { data, error } = await supabase
    .from("events")
    .insert([eventPayload])
    .select()
    .single();

  if (error) throw error;
  return data;
}
