import { supabase } from "./supabase.js";

async function init() {

  /* navegação para página do mapa */
  const mapNav = document.querySelector('[data-page="map"]');

  if (mapNav) {
    mapNav.addEventListener("click", () => {
      window.location.href = "pages/map.html";
    });
  }

  /* buscar eventos do banco */
  const { data: events, error } = await supabase
    .from("events")
    .select("*")
    .order("date", { ascending: true });

  if (error) {
    console.error("Erro ao buscar eventos:", error);
    return;
  }

/* separar eventos para home */
const stories = events.slice(0, 10);
const featuredEvents = events.slice(0, 5);

/* -------------------------
   STORIES (abre Instagram)
--------------------------*/

const storiesContainer = document.querySelector(".stories-container");

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

/* permitir arrastar com mouse e touch */

stories.forEach(event => {

  const card = document.createElement("div");
  card.classList.add("story-card");

  if (event.image) {
    card.style.backgroundImage = `url(${event.image})`;
  } else {
    card.style.background = "linear-gradient(135deg,#2b2b2b,#111)";
  }

  card.innerHTML = `
    <div class="story-overlay">
      <div class="story-title">
        ${event.title}
      </div>
      <div class="story-location">
        ${event.location || ""}
      </div>
      <div class="story-button">
        Ver mais
      </div>
    </div>
  `;

  const btn = card.querySelector(".story-button");

  if (btn) {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();

      if (dragMoved) return;

      if (event.instagram) {
        window.open(event.instagram, "_blank");
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
let touchStartX = 0;
let touchEndX = 0;
let isSwiping = false;
let isDraggingHighlight = false;

function prevSlide() {
  currentSlide = (currentSlide - 1 + featuredEvents.length) % featuredEvents.length;
  renderFeatured();
}

function renderFeatured() {

  if (!featuredEvents.length) return;

  const event = featuredEvents[currentSlide];

  highlightCard.style.opacity = "0";

  setTimeout(() => {

    highlightCard.innerHTML = `
      <div class="highlight-overlay">
        <h2 class="highlight-title">${event.title}</h2>
        <p class="highlight-meta">${event.location} • ${event.date}</p>

        <div class="highlight-button">
          Ver mais
        </div>
      </div>
    `;

    const btn = highlightCard.querySelector(".highlight-button");
    if (btn) {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        window.location.href = `event.html?id=${event.id}`;
      });
    }

    if (event.image) {
      highlightCard.style.backgroundImage = `url(${event.image})`;
    } else {
      highlightCard.style.background = "linear-gradient(135deg,#2b2b2b,#111)";
      highlightCard.style.backgroundImage = "";
    }

    highlightCard.style.opacity = "1";

  }, 150);

}

/* troca automática de slide */
function nextSlide() {
  currentSlide = (currentSlide + 1) % featuredEvents.length;
  renderFeatured();
}

/* arrastar com mouse */
let dragStartX = 0;

highlightCard.addEventListener("mousedown", (e) => {
  dragStartX = e.clientX;
  highlightCard.style.cursor = "grabbing";
});

highlightCard.addEventListener("mouseup", (e) => {
  highlightCard.style.cursor = "grab";

  const diff = dragStartX - e.clientX;

  if (Math.abs(diff) < 40) return;

  if (diff > 0) nextSlide();
  else prevSlide();
});

/* swipe no celular */
highlightCard.addEventListener("touchstart", (e) => {
  dragStartX = e.touches[0].clientX;
});

highlightCard.addEventListener("touchend", (e) => {
  const diff = dragStartX - e.changedTouches[0].clientX;

  if (Math.abs(diff) < 40) return;

  if (diff > 0) nextSlide();
  else prevSlide();
});

/* iniciar slider */
renderFeatured();

setInterval(nextSlide, 5000);
}

init();