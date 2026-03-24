import { supabase } from "./supabase.js";
import { initHomeAdBanner } from "./ui/homeAdBanner.js?v=3";
import { loadHomeEvents } from "./services/home.js?v=3";
import { isHighlightActiveEvent } from "./services/highlightLifecycle.js?v=2";
import { beginPageLoad, finishPageLoad } from "./ui/page-loader.js?v=3";

function showPopup(message){

  const overlay = document.createElement("div");
  overlay.className = "app-popup-overlay";

  overlay.innerHTML = `
    <div class="app-popup">
      <div class="app-popup-text">${message}</div>
      <button class="app-popup-button">OK</button>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector(".app-popup-button").onclick = () => {
    overlay.remove();
  };
}

let deferredPrompt = null;
let installPopupShown = false;
let highlightTimer = null;
let storyPointerStart = null;
let initialHomeLoadComplete = false;
const highlightSection = document.querySelector(".home-highlight");

function formatShortEventDate(rawDate) {
  if (!rawDate || !String(rawDate).trim()) return "";
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

const HERO_CAL_MONTHS_PT = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

/** Mini-calendário: dia em cima, mês abreviado em baixo (sem adornos). */
function getHeroCalendarParts(rawDate) {
  if (!rawDate || !String(rawDate).trim()) return null;
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) return null;
  const d = date.getDate();
  return {
    day: String(d).padStart(2, "0"),
    monthShort: HERO_CAL_MONTHS_PT[date.getMonth()] || "",
  };
}

function buildHeroDateBadgeHtml(parts) {
  const safeDay = escapeHtml(parts.day);
  const safeMonth = escapeHtml(parts.monthShort);
  const label = `Data do evento: ${parts.day} ${parts.monthShort}`;
  return `<div class="home-hero-date-badge" role="img" aria-label="${escapeAttr(label)}">
    <div class="home-hero-date-badge__top">${safeDay}</div>
    <div class="home-hero-date-badge__divider" aria-hidden="true"></div>
    <div class="home-hero-date-badge__bottom">${safeMonth}</div>
  </div>`;
}

function shortLocation(location) {
  const trimmed = String(location || "").trim();
  if (!trimmed) return "";
  return trimmed.split(",")[0].trim();
}

function getHeroChipLabel(event) {
  const team = String(event.team || "").trim();
  const city = String(event.city || "").trim();
  return [team, city].filter(Boolean).join(" • ");
}

function getPlanChipLabel(event) {
  const label = getHeroChipLabel(event);
  if (label) return label;

  const normalized = String(event.plan_type || "").trim().toLowerCase();
  if (normalized === "7") return "7 DIAS";
  if (normalized === "15") return "15 DIAS";
  if (normalized === "30") return "30 DIAS";
  if (normalized === "highlight") return "DESTAQUE";
  return "PRÓXIMO";
}

function openEventDetail(event) {
  window.location.href = `event.html?id=${event.id}`;
}

function escapeAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/'/g, "&#39;");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ensureInstallPopup(){
  let popup = document.getElementById("install-popup");
  if (popup) return popup;

  popup = document.createElement("div");
  popup.id = "install-popup";
  popup.style.display = "none";
  popup.style.position = "fixed";
  popup.style.inset = "0";
  popup.style.background = "rgba(0,0,0,.65)";
  popup.style.zIndex = "9999";
  popup.style.alignItems = "center";
  popup.style.justifyContent = "center";
  popup.style.padding = "20px";

  popup.innerHTML = `
    <div style="width:100%;max-width:360px;background:#111;border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:20px;color:#fff;box-shadow:0 20px 60px rgba(0,0,0,.4);">
      <div style="font-size:18px;font-weight:700;margin-bottom:8px;">Instalar WebPipa</div>
      <div style="font-size:14px;line-height:1.45;opacity:.88;margin-bottom:16px;">
        Acesse mais rapido e sem a barra do navegador.
      </div>
      <div style="display:flex;gap:10px;">
        <button id="install-popup-close" style="flex:1;height:44px;border:none;border-radius:12px;background:#2a2a2a;color:#fff;cursor:pointer;">
          Agora não
        </button>
        <button id="install-popup-confirm" style="flex:1;height:44px;border:none;border-radius:12px;background:#19c37d;color:#000;font-weight:700;cursor:pointer;">
          Instalar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(popup);

  popup.querySelector("#install-popup-close")?.addEventListener("click", () => {
    popup.style.display = "none";
  });

  popup.querySelector("#install-popup-confirm")?.addEventListener("click", async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    popup.style.display = "none";
  });

  return popup;
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  console.log("✅ Evento beforeinstallprompt capturado e pronto.");

  setTimeout(() => {
    if (!deferredPrompt || installPopupShown) return;

    const popup = ensureInstallPopup();
    popup.style.display = "flex";
    installPopupShown = true;
  }, 1000);
});

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;

  const popup = document.getElementById("install-popup");
  if (popup) popup.style.display = "none";
});

async function init() {

  /* navegação para página do mapa */
  const mapNav = document.querySelector('[data-page="map"]');

  if (mapNav) {
    mapNav.addEventListener("click", () => {
      window.location.href = "/pages/map.html";
    });
  }

  let events = [];

  try {
    await initHomeAdBanner();
  } catch (bannerErr) {
    console.warn("Banner publicitário:", bannerErr);
  }

  try {
    events = await loadHomeEvents();
  } catch (error) {
    console.error("Erro ao buscar eventos:", error);
    return;
  } finally {
    if (!initialHomeLoadComplete) {
      initialHomeLoadComplete = true;
      finishPageLoad();
    }
  }

/* separar eventos para home — cards horizontais sem limite */
const stories = events;

// eventos pagos (planos 7,15,30 dias) no destaque grande — sem limite artificial
const featuredEvents = events.filter((ev) => isHighlightActiveEvent(ev));

/* -------------------------
   STORIES
--------------------------*/
  
const storiesContainer = document.querySelector(".stories-container");
const heroDots = document.querySelector(".home-hero-dots");

if (!storiesContainer) {
  console.error("Elemento .stories-container não encontrado no HTML");
  return;
}

/* drag horizontal com mouse */
let isDragging = false;
let startX = 0;
let startScroll = 0;
let dragMoved = false;

storiesContainer.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return; // apenas botão esquerdo
  isDragging = true;
  dragMoved = false;
  startX = e.pageX;
  startScroll = storiesContainer.scrollLeft;
  document.body.style.userSelect = "none"; // evita seleção de texto
});

window.addEventListener("mouseup", () => {
  isDragging = false;
  document.body.style.userSelect = "";
});

storiesContainer.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  const dx = e.pageX - startX;

  if (Math.abs(dx) > 5) {
    dragMoved = true;
  }

  storiesContainer.scrollLeft = startScroll - dx;
});

storiesContainer.addEventListener("touchstart", (e) => {
  const touch = e.touches[0];
  storyPointerStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
});

storiesContainer.addEventListener("touchend", () => {
  storyPointerStart = null;
});

stories.forEach(event => {
  const card = document.createElement("div");
  card.classList.add("story-card");
  const isPremium = isHighlightActiveEvent(event);

  if (isPremium) {
    card.classList.add("premium");
  } else {
    card.classList.add("free");
  }

  if (event.image) {
    card.style.backgroundImage = `url(${event.image})`;
  } else {
    card.style.background = "linear-gradient(135deg,#2b2b2b,#111)";
  }

  card.innerHTML = `
    ${isPremium ? `<div class="story-premium-badge">★</div>` : ``}
    ${event.city ? `<div class="story-city-pill">${event.city}</div>` : ``}
    <div class="story-overlay">
      <div class="story-title">${event.title}</div>
      <div class="story-location">${formatShortEventDate(event.date)}</div>
    </div>
  `;

  if (isPremium) {
    card.addEventListener("click", () => {
      if (dragMoved) return;
      openEventDetail(event);
    });

    card.addEventListener("touchend", (e) => {
      const touch = e.changedTouches[0];
      if (!touch || !storyPointerStart) {
        openEventDetail(event);
        return;
      }

      const dx = Math.abs(touch.clientX - storyPointerStart.x);
      const dy = Math.abs(touch.clientY - storyPointerStart.y);

      if (dx < 12 && dy < 12) {
        openEventDetail(event);
      }
    });
  }

  storiesContainer.appendChild(card);

});

/* -------------------------
   EVENTOS DESTAQUE (slider)
--------------------------*/

const highlightCard = document.querySelector(".highlight-card");

if (!highlightCard) {
  console.error("Elemento .highlight-card não encontrado no HTML");
  return;
}

/* mostrar cursor de arrastar igual aos stories */
highlightCard.style.cursor = "grab";

let currentSlide = 0;
let dragDistance = 0;

function renderHeroDots() {
  if (!heroDots) return;
  if (featuredEvents.length <= 1) {
    heroDots.innerHTML = "";
    return;
  }

  heroDots.innerHTML = featuredEvents
    .map((_, index) => `<span class="home-hero-dot${index === currentSlide ? " active" : ""}"></span>`)
    .join("");
}

function prevSlide() {
  currentSlide = (currentSlide - 1 + featuredEvents.length) % featuredEvents.length;
  renderFeatured();
}

function renderFeatured() {

  if (!featuredEvents.length) {
    if (highlightSection) {
      highlightSection.hidden = true;
    }
    return;
  }

  if (highlightSection) {
    highlightSection.hidden = false;
  }

  const event = featuredEvents[currentSlide];
  const location = shortLocation(event.location);
  const calParts = getHeroCalendarParts(event.date);
  const chipLabel = getPlanChipLabel(event);
  const safeTitle = escapeHtml(event.title);
  const safeChip = escapeHtml(chipLabel);
  const safeLoc = location ? escapeHtml(location) : "";

  highlightCard.style.opacity = "0";
  highlightCard.classList.remove("is-ready");

  setTimeout(() => {

    highlightCard.innerHTML = `
      <div class="home-hero-border-sweep"></div>
      <div class="highlight-overlay">
        <div class="home-hero-top-row">
          <span class="home-plan-chip">${safeChip}</span>
          ${calParts ? buildHeroDateBadgeHtml(calParts) : ""}
        </div>
        <div class="home-hero-copy">
          <h2 class="highlight-title">${safeTitle}</h2>
          ${safeLoc ? `<div class="home-hero-addr-chip"><span class="home-hero-addr-chip__text">${safeLoc}</span></div>` : ""}
        </div>
      </div>
    `;

    if (event.image) {
      highlightCard.innerHTML = `<div class="home-hero-image" style="background-image:url('${event.image.replace(/'/g, "\\'")}')"></div>${highlightCard.innerHTML}`;
    } else {
      highlightCard.innerHTML = `<div class="home-hero-image"></div>${highlightCard.innerHTML}`;
    }

    highlightCard.onclick = () => {
      if (Math.abs(dragDistance) > 30) return;
      openEventDetail(event);
    };

    highlightCard.style.opacity = "1";
    highlightCard.classList.add("is-ready");
    renderHeroDots();

  }, 150);

}

/* troca automática de slide */
function nextSlide() {
  currentSlide = (currentSlide + 1) % featuredEvents.length;
  renderFeatured();
}

function restartHighlightTimer() {
  if (highlightTimer) {
    clearInterval(highlightTimer);
    highlightTimer = null;
  }

  if (featuredEvents.length <= 1) return;
  highlightTimer = setInterval(nextSlide, 5000);
}

/* arrastar com mouse */
let dragStartX = 0;

highlightCard.addEventListener("mousedown", (e) => {
  dragStartX = e.clientX;
  dragDistance = 0;
  highlightCard.style.cursor = "grabbing";
  if (highlightTimer) {
    clearInterval(highlightTimer);
    highlightTimer = null;
  }
});

highlightCard.addEventListener("mouseup", (e) => {
  highlightCard.style.cursor = "grab";

  const diff = dragStartX - e.clientX;
  dragDistance = diff;

  if (Math.abs(diff) < 40) return;

  if (diff > 0) nextSlide();
  else prevSlide();

  restartHighlightTimer();
});

/* swipe no celular */
highlightCard.addEventListener("touchstart", (e) => {
  dragStartX = e.touches[0].clientX;
  dragDistance = 0;
  if (highlightTimer) {
    clearInterval(highlightTimer);
    highlightTimer = null;
  }
});

highlightCard.addEventListener("touchend", (e) => {
  const diff = dragStartX - e.changedTouches[0].clientX;
  dragDistance = diff;

  if (Math.abs(diff) < 40) return;

  if (diff > 0) nextSlide();
  else prevSlide();

  restartHighlightTimer();
});

/* iniciar slider */
renderFeatured();
restartHighlightTimer();
}

beginPageLoad();
init();

/* realtime updates for events */
supabase
  .channel('events-realtime-home')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'events'
    },
    () => {
      // reload home data when something changes in events
      init();
    }
  )
  .subscribe();
