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

async function init() {

  /* navegação para página do mapa */
  const mapNav = document.querySelector('[data-page="map"]');

  if (mapNav) {
    mapNav.addEventListener("click", () => {
      window.location.href = "/pages/map.html";
    });
  }

  /* buscar eventos do banco */
  const { data: eventsRaw, error } = await supabase
    .from("events")
    .select("*")
    .order("date", { ascending: true });

  // apenas eventos aprovados aparecem na home
  let events = (eventsRaw || []).filter(ev => ev.payment_status === "paid");

  /* remover eventos que já passaram */
  const today = new Date();
  today.setHours(0,0,0,0);

  events = events.filter(ev => {
    if(!ev.date) return false;

    const eventDate = new Date(ev.date);
    eventDate.setHours(0,0,0,0);

    return eventDate >= today;
  });

  /* remover destaques expirados (7,15,30 dias) */
  events = events.filter(ev => {
    if(!ev.plan_type) return true;

    const days = parseInt(ev.plan_type);
    if(!days || !ev.created_at) return true;

    const created = new Date(ev.created_at);
    const now = new Date();
    const diffDays = (now - created) / (1000 * 60 * 60 * 24);

    return diffDays <= days;
  });

  /* ordenar prioridade: destaque primeiro (30,15,7) depois gratuitos, sempre por data mais próxima */

  const planPriority = {
    "30": 3,
    "15": 2,
    "7": 1,
    "highlight": 1,
    "free": 0
  };

  events.sort((a,b)=>{

    const pa = planPriority[a.plan_type] || 0;
    const pb = planPriority[b.plan_type] || 0;

    // primeiro prioridade do plano
    if(pb !== pa) return pb - pa;

    // depois ordenar pela data do evento
    return new Date(a.date) - new Date(b.date);

  });

  if (error) {
    console.error("Erro ao buscar eventos:", error);
    return;
  }

/* separar eventos para home */
const stories = events.slice(0, 10);

// eventos pagos (planos 7,15,30 dias) aparecem no destaque
const featuredEvents = events
  .filter(ev => ev.plan_type === "7" || ev.plan_type === "15" || ev.plan_type === "30" || ev.plan_type === "highlight")
  .slice(0, 5);

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
  // eventos pagos recebem borda dourada
  if(event.plan_type === "7" || event.plan_type === "15" || event.plan_type === "30" || event.plan_type === "highlight"){
    card.classList.add("premium");
  }

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
        ${event.city || ""}
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
        <p class="highlight-meta">${(event.location || "").split(',')[0]} • ${event.city || ""} • ${event.date ? (()=>{ const d = event.date.slice(0,10).split('-'); return d[2] + '/' + d[1] + '/' + d[0].slice(2); })() : ""}</p>

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