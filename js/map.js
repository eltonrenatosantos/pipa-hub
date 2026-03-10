import { supabase } from "./supabase.js";

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

let map;
let markersGroup;
const markersById = {};
let lastInsertedEventId = null;

async function loadEvents(term = "") {
  const params = new URLSearchParams(window.location.search);
  const eventIdFromURL = params.get("event");

  let query = supabase
    .from("events")
    .select("*")
    .in("payment_status", ["paid", "approved"]);

  // quando abrimos via "Ver meu evento", buscar somente esse evento
  if (eventIdFromURL) {
    // quando abrimos um evento específico, também garantir que esteja aprovado
    query = supabase
      .from("events")
      .select("*")
      .eq("id", eventIdFromURL)
      .in("payment_status", ["paid", "approved"]);
  }

  if (term) {
    query = query.or(`title.ilike.%${term}%,city.ilike.%${term}%,location.ilike.%${term}%`);
  }

  const { data: events, error } = await query;

  if (error) {
    console.error("Erro ao buscar eventos:", error);
    return;
  }

  // se foi busca e não encontrou nada, manter eventos atuais no mapa
  if (term && (!events || events.length === 0)) {
    return;
  }

  if (markersGroup && markersGroup.clearLayers) {
    markersGroup.clearLayers();
  }

  const bounds = [];
  let lastMarker = null;
  let targetMarker = null;

  events.forEach((event) => {

    const lat = event.lat;
    const lng = event.lng ?? event.lng;

    if (!lat || !lng) return;

    const isPremiumEvent = (event.plan_type && event.plan_type !== "free");

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
    const isPremium = isPremiumEvent;

    bounds.push([lat, lng]);
    lastMarker = marker;

    marker.bindPopup(`
      <div style="width:200px;position:relative;${isPremium ? 'background:#1a1a1a;border:2px solid #d4af37;padding:8px;border-radius:10px;color:#ffffff;' : ''}">
        ${isPremium ? `<div style="position:absolute;top:6px;left:6px;background:#d4af37;color:#000;font-size:10px;font-weight:700;padding:3px 6px;border-radius:6px;">DESTAQUE</div>` : ""}
        ${event.image ? `<img src="${event.image}" style="width:100%;border-radius:8px;margin-bottom:6px;">` : ""}
        <div style="font-size:12px;font-weight:600;opacity:0.9;${isPremium ? 'color:#ffffff;' : ''}">${event.team || ''}</div>
        <strong style="${isPremium ? 'color:#ffffff;' : ''}">${event.title}</strong><br>
        <small style="${isPremium ? 'color:#e5e5e5;' : ''}">${(event.location || '').split(',')[0]}${event.city ? ', ' + event.city : ''} • ${event.date}</small>
        <div style="margin-top:8px;text-align:right;">
          <button style="
            background:#d4af37;
            border:none;
            padding:8px 12px;
            border-radius:8px;
            font-size:13px;
            cursor:pointer;
          " onclick="window.location.href='event.html?id=${event.id}'">
            Ver mais
          </button>
        </div>
      </div>
    `);
    // when clicking a marker, center it on the screen so popup is not cut
    marker.on("click", () => {

  const latlng = marker.getLatLng();

  // centraliza no marcador
  map.setView([latlng.lat, latlng.lng], map.getZoom(), { animate: true });

  // move o mapa um pouco para cima para o card aparecer no meio
  setTimeout(() => {
    map.panBy([0, -180], { animate: true });
  }, 200);

});
    if (eventIdFromURL && event.id == eventIdFromURL) {
      targetMarker = marker;
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

  if (targetMarker) {
  const latlng = targetMarker.getLatLng();

  // center event on map
  map.setView([latlng.lat, latlng.lng], 18);

  setTimeout(() => {
    targetMarker.openPopup();

    // shift map upward so popup is centered
    map.panBy([0, -8], { animate: true });
  }, 200);

} else if (bounds.length === 1) {
  map.setView(bounds[0], 14);

  if (lastMarker) {
    lastMarker.openPopup();

    // shift map upward so popup is centered like marker click behavior
    setTimeout(() => {
      map.panBy([0, -260], { animate: true });
    }, 200);
  }
} else if (bounds.length > 1) {
  map.fitBounds(bounds, { padding: [50, 50] });
}

}

document.addEventListener("DOMContentLoaded", () => {

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

  map = L.map("map", { zoomControl: false }).setView([-23.5505, -46.6333], 11);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap"
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

  // geolocalização só roda quando NÃO estamos abrindo um evento específico
  if (!eventIdFromURL && navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((pos) => {

      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      map.setView([lat, lng], 13);

      L.marker([lat, lng])
        .addTo(map)
        .bindPopup("Você está aqui");

    });
  }

  loadEvents();

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

  if (searchInput) {
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        runSearch();
      }
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

    // mostrar ou esconder X conforme texto
    searchInput.addEventListener("input", () => {

      const value = searchInput.value.trim();

      if (value === "") {
        clearBtn.style.display = "none";
        loadEvents();
      } else {
        clearBtn.style.display = "flex";
      }

    });

    // clicar no X limpa busca
    clearBtn.onclick = () => {
      searchInput.value = "";
      clearBtn.style.display = "none";
      loadEvents();
    };

  }

});