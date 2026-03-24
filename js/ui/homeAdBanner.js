import { loadActiveHomeAdvertisingList } from "../services/advertising.js";
import { recordHomeAdImpression, recordHomeAdClick } from "../services/homeAdAnalytics.js";

const HOME_AD_ROTATION_MS = 7000;

let rotationCleanup = null;

function stopHomeAdRotation() {
  if (typeof rotationCleanup === "function") {
    rotationCleanup();
    rotationCleanup = null;
  }
}

function startHomeAdRotation(ads, slot) {
  stopHomeAdRotation();
  if (!slot || !ads || ads.length <= 1) return;

  let index = 0;
  let timer = null;

  const tick = () => {
    if (document.hidden) return;
    index = (index + 1) % ads.length;
    renderHomeAdvertising(slot, ads[index]);
  };

  const schedule = () => {
    if (timer != null) {
      clearInterval(timer);
      timer = null;
    }
    timer = setInterval(tick, HOME_AD_ROTATION_MS);
  };

  const onVisibility = () => {
    if (document.hidden) {
      if (timer != null) {
        clearInterval(timer);
        timer = null;
      }
    } else {
      schedule();
    }
  };

  document.addEventListener("visibilitychange", onVisibility);
  schedule();

  rotationCleanup = () => {
    document.removeEventListener("visibilitychange", onVisibility);
    if (timer != null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function escapeAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/'/g, "&#39;");
}

function normalizeAdLink(raw) {
  const s = String(raw ?? "").trim();
  if (!s || s === "https://" || s === "http://") return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s.replace(/^\/+/, "")}`;
}

/**
 * Espera a primeira imagem do slot (decode/load) para alinhar com o page loader.
 * @param {HTMLElement | null} slot
 * @param {number} [timeoutMs]
 * @returns {Promise<void>}
 */
export function waitForHomeAdImage(slot, timeoutMs = 15000) {
  return new Promise((resolve) => {
    if (!slot || slot.hidden) {
      resolve();
      return;
    }
    const img = slot.querySelector(".home-ad-card__media img");
    if (!img) {
      resolve();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve();
    };

    const timer = window.setTimeout(finish, timeoutMs);

    const afterReady = () => {
      if (typeof img.decode === "function") {
        img.decode().then(finish).catch(finish);
      } else {
        finish();
      }
    };

    if (img.complete && img.naturalWidth > 0) {
      afterReady();
      return;
    }

    img.addEventListener("load", afterReady, { once: true });
    img.addEventListener("error", finish, { once: true });
  });
}

function renderHomeAdvertising(slot, ad, renderOpts = {}) {
  if (!slot) return;

  const eager = Boolean(renderOpts.eagerFirstImage);
  const imgAttrs = eager
    ? 'loading="eager" decoding="async"'
    : 'loading="lazy" decoding="async"';

  if (!ad) {
    stopHomeAdRotation();
    slot.hidden = true;
    slot.innerHTML = "";
    return;
  }

  const imageUrl = String(ad.image_url || "").trim();
  if (!imageUrl) {
    stopHomeAdRotation();
    slot.hidden = true;
    slot.innerHTML = "";
    return;
  }

  const company = String(ad.company_name || "").trim();
  const link = normalizeAdLink(String(ad.link_url || "").trim());

  const body = `
    <div class="home-ad-card__media">
      <img src="${escapeAttr(imageUrl)}" alt="" ${imgAttrs} />
    </div>
    <div class="home-ad-card__gradient" aria-hidden="true"></div>
  `;

  const adIdAttr = ad.id ? ` data-ad-id="${escapeAttr(ad.id)}"` : "";

  const cardHtml = link
    ? `<a class="home-ad-card" href="${escapeAttr(link)}"${adIdAttr} target="_blank" rel="noopener noreferrer" aria-label="${escapeAttr(company || "Publicidade")}">
        ${body}
      </a>`
    : `<div class="home-ad-card home-ad-card--static" role="img" aria-label="${escapeAttr(company || "Publicidade")}">
        ${body}
      </div>`;

  slot.innerHTML = `<div class="home-ad-rotator">${cardHtml}</div>`;

  const img = slot.querySelector("img");
  if (img) {
    img.addEventListener(
      "error",
      () => {
        stopHomeAdRotation();
        slot.hidden = true;
        slot.innerHTML = "";
      },
      { once: true }
    );
  }

  slot.hidden = false;

  if (ad.id) {
    recordHomeAdImpression(ad.id);
  }
}

function ensureHomeAdClickTracking(slot) {
  if (!slot || slot.dataset.adClickWired === "1") return;
  slot.dataset.adClickWired = "1";
  slot.addEventListener("click", (e) => {
    const a = e.target.closest("a.home-ad-card[data-ad-id]");
    if (!a) return;
    const id = a.getAttribute("data-ad-id");
    if (!id) return;
    e.preventDefault();
    const href = a.getAttribute("href") || "";
    recordHomeAdClick(id);
    if (href) window.open(href, "_blank", "noopener,noreferrer");
  });
}

/**
 * Banner publicitário (mesma lógica da home): rotação, impressões e cliques.
 * @param {{ slotSelector?: string, waitForFirstImage?: boolean }} [options]
 */
export async function initHomeAdBanner(options = {}) {
  const sel = options.slotSelector || "#home-ad-slot";
  const waitForFirstImage = options.waitForFirstImage !== false;
  const slot = document.querySelector(sel);
  if (!slot) return;

  ensureHomeAdClickTracking(slot);

  let homeAds = [];
  try {
    homeAds = await loadActiveHomeAdvertisingList();
  } catch {
    homeAds = [];
  }

  if (!homeAds || homeAds.length === 0) {
    stopHomeAdRotation();
    renderHomeAdvertising(slot, null);
    return;
  }

  renderHomeAdvertising(slot, homeAds[0], { eagerFirstImage: true });
  if (waitForFirstImage) {
    await waitForHomeAdImage(slot);
  }
  startHomeAdRotation(homeAds, slot);
}
