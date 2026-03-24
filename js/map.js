import { supabase } from "./supabase.js";
import { isHighlightActiveEvent } from "./services/highlightLifecycle.js?v=1";
import { loadMapEvents } from "./services/map.js";
import { showMessagePopup } from "./ui/popup.js";
import { beginPageLoad, finishPageLoad } from "./ui/page-loader.js?v=2";
import { initHomeAdBanner } from "./ui/homeAdBanner.js?v=2";

function showPopup(message){
  showMessagePopup({ message });
}

function formatShortEventDate(value){
  if(!value) return "";

  const raw = String(value).slice(0,10);
  const parts = raw.split("-");

  if(parts.length !== 3) return value;

  const [year, month, day] = parts;
  return `${day}/${month}/${year.slice(2)}`;
}

function formatMapCardAddress(location, city){
  const normalizedCity = String(city || "").trim();
  const parts = String(location || "")
    .split(",")
    .map((part) => part.trim())
    .map((part) => part.replace(/\b\d{5}-?\d{3}\b/g, "").trim())
    .map((part) => (part.includes(" - ") ? part.split(" - ")[0].trim() : part))
    .filter(Boolean)
    .filter((part) => {
      if (!normalizedCity) return true;
      return part.toLowerCase() !== normalizedCity.toLowerCase();
    })
    .slice(0, 3);

  if (normalizedCity) {
    parts.push(normalizedCity);
  }

  return parts.join(", ");
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

let map;
let markersGroup;
const markersById = {};
let lastInsertedEventId = null;
let mapEventCard;
let activeCardMarker = null;
/** Coordenadas do evento (endereço); com spiderfy o marker.getLatLng() fica offset até o cluster fechar. */
let activeCardLatLng = null;
let initialMapLoadComplete = false;
let userLocationMarker = null;

function getEventLatLng(event) {
  if (!event) return null;
  const lat = typeof event.lat === "number" ? event.lat : parseFloat(String(event.lat ?? event.latitude).replace(",", "."));
  const lng = typeof event.lng === "number" ? event.lng : parseFloat(String(event.lng ?? event.longitude).replace(",", "."));
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return L.latLng(lat, lng);
}

function focusMarker(marker, preferredZoom = 18, focusLatLng) {
  if (!map || !marker) return;

  const latlng = focusLatLng || marker.getLatLng();
  map.closePopup();
  const size = map.getSize();
  const targetScreenY = size.y * 0.72;
  const centerScreenY = size.y / 2;
  const projectedMarker = map.project(latlng, preferredZoom);
  const centerProjected = L.point(
    projectedMarker.x,
    projectedMarker.y - (targetScreenY - centerScreenY)
  );
  const targetCenter = map.unproject(centerProjected, preferredZoom);
  // Sem animação: o card usa latLngToContainerPoint na hora; com animate:true o mapa ainda
  // estava no frame anterior (pior com cluster/spiderfy e até pin único).
  map.setView(targetCenter, preferredZoom, { animate: false });
}

function hideMapEventCard() {
  if (!mapEventCard) return;
  mapEventCard.style.display = "none";
  activeCardMarker = null;
  activeCardLatLng = null;
}

function setUserLocationMarker(latlng) {
  if (!map) return;

  if (userLocationMarker) {
    map.removeLayer(userLocationMarker);
    userLocationMarker = null;
  }

  userLocationMarker = L.marker(latlng, {
    interactive: false
  })
    .addTo(map)
    .bindPopup("Você está aqui");
}

function centerMapOnUserLocation({ zoom = 13, showFeedback = false } = {}) {
  if (!navigator.geolocation) {
    if (showFeedback) {
      showPopup("Não foi possível obter sua localização agora.");
    }
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      map.setView([lat, lng], zoom);
      setUserLocationMarker([lat, lng]);
    },
    () => {
      if (showFeedback) {
        showPopup("Não foi possível obter sua localização agora.");
      }
    },
    {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 30000
    }
  );
}

function updateMapEventCardPosition() {
  if (!mapEventCard || !map || !activeCardMarker) return;

  const latlng = activeCardLatLng || activeCardMarker.getLatLng();
  const point = map.latLngToContainerPoint(latlng);
  const cardWidth = mapEventCard.offsetWidth;
  const cardHeight = mapEventCard.offsetHeight;
  const mapSize = map.getSize();
  const gap = typeof window !== "undefined" && window.innerWidth <= 768 ? 20 : 28;
  const minMargin = 10;
  const iconOptions = activeCardMarker.options?.icon?.options || {};
  const iconSize = Array.isArray(iconOptions.iconSize) ? iconOptions.iconSize : [0, 0];
  const iconAnchor = Array.isArray(iconOptions.iconAnchor) ? iconOptions.iconAnchor : [0, iconSize[1] || 0];
  const topOffset = Math.max(0, iconAnchor[1] || 0);

  let left = point.x - (cardWidth / 2);
  let top = point.y - topOffset - gap - cardHeight;

  left = Math.max(minMargin, Math.min(left, mapSize.x - cardWidth - minMargin));
  top = Math.max(minMargin, top);

  mapEventCard.style.left = `${left}px`;
  mapEventCard.style.top = `${top}px`;
}

/** Card acima, pin/estrela abaixo (~72% da altura), rua visível — mesmo efeito do clique no marcador. */
function openMapEventWithFocus(event, marker) {
  if (!event || !marker) return;
  const focusLL = getEventLatLng(event) || marker.getLatLng();
  focusMarker(marker, 18, focusLL);
  showMapEventCard(event, marker);
  requestAnimationFrame(() => updateMapEventCardPosition());
}

function showMapEventCard(event, marker) {
  if (!mapEventCard || !event || !marker) return;

  const title = event.title || "Evento";
  const image = (event.image || "").trim();
  const location = event.location || event.address || "";
  const city = event.city || "";
  const formattedDate = formatShortEventDate(event.date);
  const addressText = formatMapCardAddress(location, city);
  const isPremium = isHighlightActiveEvent(event);

  let eventLink = null;

  if (isPremium) {
    eventLink = `event.html?id=${event.id}`;
  }

  mapEventCard.className = `map-event-card${isPremium ? " is-premium" : " is-free"}`;
  mapEventCard.innerHTML = `
    <div class="map-event-card-shell">
      <div class="map-event-card-media">
        <div class="map-event-card-image"${image ? ` style="background-image:url('${escapeHTML(image)}')"` : ""}>
          ${!image ? `<div class="map-event-card-image-placeholder" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="31" height="31" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="4" y="5" width="16" height="14" rx="3" stroke="currentColor" stroke-width="1.8"/>
              <path d="M8 14l2.5-2.5L13 14l2.5-2.5L18 14.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              <circle cx="9" cy="9" r="1.4" fill="currentColor"/>
            </svg>
          </div>` : ""}
          ${isPremium ? `<div class="map-event-card-badge">Destaque</div>` : ""}
          ${eventLink ? `<a class="map-event-card-open" href="${escapeHTML(eventLink)}" aria-label="Abrir evento">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="11" cy="11" r="5.5" stroke="currentColor" stroke-width="2"/>
              <path d="m16 16 3.5 3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </a>` : ""}
        </div>
      </div>
      <div class="map-event-card-body">
        <div class="map-event-card-title">${escapeHTML(title)}</div>
        ${formattedDate ? `<div class="map-event-card-date">${escapeHTML(formattedDate)}</div>` : ""}
        ${addressText ? `<div class="map-event-card-meta">${escapeHTML(addressText)}</div>` : ""}
      </div>
    </div>
  `;

  activeCardMarker = marker;
  activeCardLatLng = getEventLatLng(event);
  mapEventCard.style.display = "block";
  updateMapEventCardPosition();
}

async function loadEvents(term = "", options = {}) {
  const { initial = false } = options;
  const params = new URLSearchParams(window.location.search);
  const eventIdFromURL = params.get("event");

  let events = [];

  try {
    events = await loadMapEvents({
      term,
      eventId: eventIdFromURL || ""
    });
  } catch (error) {
    console.error("Erro ao buscar eventos:", error);
    return;
  } finally {
    if (initial && !initialMapLoadComplete) {
      initialMapLoadComplete = true;
      finishPageLoad();
    }
  }

  // se foi busca e não encontrou nada, manter eventos atuais no mapa
  if (term && (!events || events.length === 0)) {
    return;
  }

  const searchTermActive = Boolean(term && String(term).trim());

  if (markersGroup && markersGroup.clearLayers) {
    markersGroup.clearLayers();
  }

  Object.keys(markersById).forEach((id) => {
    delete markersById[id];
  });

  const bounds = [];
  let lastMarker = null;
  let targetMarker = null;
  let targetEvent = null;

  events.forEach((event) => {
    const ll = getEventLatLng(event);
    if (!ll) return;
    const lat = ll.lat;
    const lng = ll.lng;

    const isPremiumEvent = isHighlightActiveEvent(event);

    let marker;

    if (isPremiumEvent) {
      marker = L.marker([lat, lng], {
        isPremium: true,
        icon: L.divIcon({
          className: "premium-star-marker",
          html: `
            <div class="premium-star-inner" style="
              width:36px;
              height:36px;
              background:linear-gradient(145deg,#ffd66b,#ff9f1c,#d97706);
              clip-path:polygon(
                50% 0%, 61% 35%, 98% 35%, 
                68% 57%, 79% 91%, 
                50% 70%, 21% 91%, 
                32% 57%, 2% 35%, 
                39% 35%
              );
              box-shadow:
                0 4px 10px rgba(0,0,0,0.45),
                inset 0 2px 3px rgba(255,255,255,0.45),
                inset 0 -2px 4px rgba(0,0,0,0.25);
            "></div>
          `,
          iconSize: [36,36],
          iconAnchor: [18,18]
        })
      });
    } else {
      marker = L.marker([lat, lng], { isPremium: false });
    }

    // identificar se evento é premium
    bounds.push([lat, lng]);
    lastMarker = marker;

    marker.on("click", () => {
      openMapEventWithFocus(event, marker);
    });
    if (eventIdFromURL && event.id == eventIdFromURL) {
      targetMarker = marker;
      targetEvent = event;
    }

    markersById[event.id] = marker;
    // animate marker if it was just inserted in realtime
    if (event.id === lastInsertedEventId) {
      setTimeout(() => {
        const el = marker.getElement && marker.getElement();
        if (el) {
          el.style.animation = "markerPop 0.4s ease";
        }
      }, 50);
    }
    markersGroup.addLayer(marker);

  });

  if (targetMarker && targetEvent) {
    openMapEventWithFocus(targetEvent, targetMarker);
  } else if (bounds.length === 1) {
    if (searchTermActive && events.length === 1) {
      const only = events[0];
      const marker = markersById[only.id];
      if (marker) {
        openMapEventWithFocus(only, marker);
      }
    } else {
      map.setView(bounds[0], 16.5);
    }
  } else if (bounds.length > 1) {
    map.fitBounds(bounds, { padding: [50, 50] });
  }

}

document.addEventListener("DOMContentLoaded", async () => {
  beginPageLoad();

  try {
    await initHomeAdBanner();
  } catch (bannerErr) {
    console.warn("Banner publicitário:", bannerErr);
  }

  const style = document.createElement("style");
  style.innerHTML = `
@keyframes pipaFloat{
  0%{ transform:rotate(45deg) translateY(0px); }
  50%{ transform:rotate(45deg) translateY(-3px); }
  100%{ transform:rotate(45deg) translateY(0px); }
}
@keyframes markerPop{
  0%{ transform:scale(0.4); opacity:0; }
  60%{ transform:scale(1.2); opacity:1; }
  100%{ transform:scale(1); }
}
@keyframes premiumGlow{
  0%{ box-shadow:0 0 0px rgba(255,190,40,0.0); transform:scale(1); }
  50%{ box-shadow:0 0 36px rgba(255,190,40,1); transform:scale(1.18); }
  100%{ box-shadow:0 0 0px rgba(255,190,40,0.0); transform:scale(1); }
}
.premium-star-inner{
  animation:premiumGlow 0.9s ease-in-out infinite;
  will-change: box-shadow;
}
`;
  document.head.appendChild(style);

  const params = new URLSearchParams(window.location.search);
  const eventIdFromURL = params.get("event");
  mapEventCard = document.getElementById("mapEventCard");
  hideMapEventCard();

  map = L.map("map", { zoomControl: false }).setView([-23.5505, -46.6333], 11);

  L.tileLayer("https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd",
    attribution: "© OpenStreetMap contributors © CARTO"
  }).addTo(map);

  if (L.markerClusterGroup) {
    markersGroup = L.markerClusterGroup({
      iconCreateFunction: function(cluster){

        const count = cluster.getChildCount();
        const markers = cluster.getAllChildMarkers();
        const hasPremium = markers.some(m => m.options && m.options.isPremium);
        const bgColor = hasPremium ? "#d4af37" : "#6cc04a";

        return L.divIcon({
          html: `
            <div style="
              width:42px;
              height:42px;
              background:${bgColor};
              transform:rotate(45deg);
              border-radius:6px;
              display:flex;
              align-items:center;
              justify-content:center;
              box-shadow:0 4px 14px rgba(0,0,0,0.45);
              position:relative;
              animation:pipaFloat 2.6s ease-in-out infinite;
            ">
              <div style="
                transform:rotate(-45deg);
                color:#fff;
                font-weight:700;
                font-size:14px;
              ">${count}</div>
            </div>
          `,
          className: "cluster-pipa",
          iconSize: [40,40]
        });

      }
    });
  } else {
    markersGroup = L.layerGroup();
  }

  map.addLayer(markersGroup);

  requestAnimationFrame(() => {
    if (map) map.invalidateSize();
  });

  map.on("move zoom resize moveend zoomend", updateMapEventCardPosition);
  map.on("click", () => {
    hideMapEventCard();
    const si = document.getElementById("map-search");
    if (si && document.activeElement === si) {
      si.blur();
    }
  });

  // geolocalização só roda quando NÃO estamos abrindo um evento específico
  if (!eventIdFromURL) {
    centerMapOnUserLocation({ zoom: 13 });
  }

  loadEvents("", { initial: true });

  /* smarter realtime updates for events on map */
  supabase
    .channel('events-realtime-map')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'events'
      },
      (payload) => {

        const event = payload.new || payload.old;

        if (!event) return;

        // INSERT → add new marker
        if (payload.eventType === 'INSERT') {
          lastInsertedEventId = event.id;
          loadEvents();
        }

        // UPDATE → refresh that marker
        if (payload.eventType === 'UPDATE') {

          const existing = markersById[event.id];

          if (existing) {
            markersGroup.removeLayer(existing);
            delete markersById[event.id];
          }

          loadEvents();
        }

        // DELETE → remove marker
        if (payload.eventType === 'DELETE') {

          const existing = markersById[event.id];

          if (existing) {
            markersGroup.removeLayer(existing);
            delete markersById[event.id];
          }

        }

      }
    )
    .subscribe();

  const searchInput = document.getElementById("map-search");
  const searchButton = document.getElementById("map-search-btn");
  const locateButton = document.getElementById("map-locate-btn");

  function runSearch() {

    if (!searchInput) return;

    const term = searchInput.value.trim();

    if (!term) {
      loadEvents();
      return;
    }

    loadEvents(term);

  }

  if (searchButton) {
    searchButton.addEventListener("click", runSearch);
  }

  if (locateButton) {
    locateButton.addEventListener("click", () => {
      centerMapOnUserLocation({ zoom: 14.5, showFeedback: true });
    });
  }

  if (searchInput) {
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        runSearch();
      }
    });

    searchInput.addEventListener("focus", () => {
      hideMapEventCard();
    });
  }

  // quando apagar ou digitar na busca, controlar eventos e botão X
  if (searchInput) {

    // botão X rápido para limpar busca (iOS style)
    const clearBtn = document.createElement("div");
    clearBtn.innerHTML = "✕";
    clearBtn.className = "map-search-clear";
    clearBtn.style.display = "none"; // começa escondido

    const parent = searchInput.parentElement;
    if (parent) {
      parent.appendChild(clearBtn);
    }

    // Só atualiza o X: não chama loadEvents ao apagar/digitar — senão o mapa recentraliza
    // a cada backspace e a tela “pula” até você sair do campo ou buscar de novo.
    searchInput.addEventListener("input", () => {
      const value = searchInput.value.trim();
      clearBtn.style.display = value === "" ? "none" : "flex";
    });

    // clicar no X limpa busca
    clearBtn.onclick = () => {
      searchInput.value = "";
      clearBtn.style.display = "none";
      loadEvents();
    };

  }

});
