const root = document.documentElement;
const LOADER_ID = "app-page-loader-overlay";
const MIN_VISIBLE_MS = 320;
/** Banner + dados podem demorar em rede lenta; evita soltar o overlay antes da arte. */
const FALLBACK_TIMEOUT_MS = 15000;

let pendingLoads = 0;
let loaderShownAt = 0;
let hideTimer = null;
let fallbackTimer = null;

function ensureLoaderOverlay() {
  if (!document.body) return null;

  let overlay = document.getElementById(LOADER_ID);
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = LOADER_ID;
  overlay.className = "app-page-loader-overlay";
  overlay.innerHTML = `
    <div class="app-page-loader-shell" aria-hidden="true">
      <div class="app-page-loader-ring"></div>
      <div class="app-page-loader-kite">
        <span class="app-page-loader-kite-part part-red"></span>
        <span class="app-page-loader-kite-part part-blue"></span>
        <span class="app-page-loader-kite-part part-orange"></span>
        <span class="app-page-loader-kite-part part-yellow"></span>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  return overlay;
}

function activateLoader() {
  root.classList.add("app-preload");
  loaderShownAt = Date.now();
  ensureLoaderOverlay();

  window.clearTimeout(fallbackTimer);
  fallbackTimer = window.setTimeout(() => {
    forceFinishPageLoad();
  }, FALLBACK_TIMEOUT_MS);
}

function hideLoaderOverlay() {
  const overlay = ensureLoaderOverlay();
  if (!overlay) {
    root.classList.remove("app-preload");
    return;
  }

  overlay.classList.add("is-hiding");
  root.classList.remove("app-preload");

  window.setTimeout(() => {
    overlay.remove();
  }, 220);
}

export function beginPageLoad() {
  pendingLoads += 1;

  if (pendingLoads === 1) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", activateLoader, { once: true });
    } else {
      activateLoader();
    }
  }
}

export function finishPageLoad() {
  pendingLoads = Math.max(0, pendingLoads - 1);
  if (pendingLoads > 0) return;

  window.clearTimeout(hideTimer);
  window.clearTimeout(fallbackTimer);

  const elapsed = Date.now() - loaderShownAt;
  const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);

  hideTimer = window.setTimeout(() => {
    hideLoaderOverlay();
  }, wait);
}

export function forceFinishPageLoad() {
  pendingLoads = 0;
  window.clearTimeout(hideTimer);
  window.clearTimeout(fallbackTimer);
  hideLoaderOverlay();
}

if (root.classList.contains("app-preload")) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureLoaderOverlay, { once: true });
  } else {
    ensureLoaderOverlay();
  }

  fallbackTimer = window.setTimeout(() => {
    forceFinishPageLoad();
  }, FALLBACK_TIMEOUT_MS);
}
