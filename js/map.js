import { supabase } from "./supabase.js";

let map;
let markersGroup;

async function loadEvents(term = "") {

  let query = supabase.from("events").select("*");

  if (term) {
    query = query.or(`title.ilike.%${term}%,city.ilike.%${term}%,location.ilike.%${term}%`);
  }

  const { data: events, error } = await query;

  if (error) {
    console.error("Erro ao buscar eventos:", error);
    return;
  }

  if (markersGroup && markersGroup.clearLayers) {
    markersGroup.clearLayers();
  }

  const bounds = [];
  let lastMarker = null;

  events.forEach((event) => {

    if (!event.lat || !event.lng) return;

    const marker = L.marker([event.lat, event.lng]);

    bounds.push([event.lat, event.lng]);
    lastMarker = marker;

    marker.bindPopup(`
      <div style="width:200px">
        ${event.image ? `<img src="${event.image}" style="width:100%;border-radius:8px;margin-bottom:6px;">` : ""}
        <strong>${event.title}</strong><br>
        <small>${event.location} • ${event.date}</small>
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

    markersGroup.addLayer(marker);

  });

  if (bounds.length === 1) {
    map.setView(bounds[0], 14);
    if (lastMarker) lastMarker.openPopup();
  } else if (bounds.length > 1) {
    map.fitBounds(bounds, { padding: [50, 50] });
  }

}

document.addEventListener("DOMContentLoaded", () => {

  map = L.map("map", { zoomControl: false }).setView([-23.5505, -46.6333], 11);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap"
  }).addTo(map);

  if (L.markerClusterGroup) {
    markersGroup = L.markerClusterGroup();
  } else {
    markersGroup = L.layerGroup();
  }

  map.addLayer(markersGroup);

  if (navigator.geolocation) {
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

});