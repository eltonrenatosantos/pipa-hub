import { events } from "./events.js";

function init() {

/* Separar tipos de evento */
const stories = events.filter(e => e.plan === "story");
const featuredEvents = events.filter(e => e.plan === "featured");

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

storiesContainer.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return; // apenas botão esquerdo
  isDragging = true;
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

  card.onclick = () => {
    if (event.instagram_url) {
      window.open(event.instagram_url, "_blank");
    }
  };

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

let currentSlide = 0;

function renderFeatured() {

  if (!featuredEvents.length) return;

  const event = featuredEvents[currentSlide];

  highlightCard.style.opacity = "0";

  setTimeout(() => {

    highlightCard.innerHTML = `
      <div class="highlight-overlay">
        <h2 class="highlight-title">${event.title}</h2>
        <p class="highlight-meta">${event.location} • ${event.date}</p>
      </div>
    `;

    highlightCard.onclick = () => {
      window.location.href = `event.html?id=${event.id}`;
    };

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

/* iniciar slider */
renderFeatured();

setInterval(nextSlide, 5000);
}

init();