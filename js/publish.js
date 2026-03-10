// /js/publish.js

import { supabase } from "./supabase.js";

// PIX configuration (edit whenever needed)
const PIX_KEY = "webpipapaypal@gmail.com";
const PIX_QR_IMAGE = "/assets/pix/qrcode.png"; // replace with your QR image

// ---- PIX payload generator (Banco Central BR Code) ----
function crc16(str){
  let crc = 0xFFFF;
  for (let c = 0; c < str.length; c++){
    crc ^= str.charCodeAt(c) << 8;
    for (let i = 0; i < 8; i++){
      if ((crc & 0x8000) !== 0) crc = (crc << 1) ^ 0x1021;
      else crc <<= 1;
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4,"0");
}

function buildPixPayload(key,value,txid){

  const merchantName = "ELTON RENATO";
  const merchantCity = "SAO PAULO";

  const amount = value.toFixed(2);

  const gui = "BR.GOV.BCB.PIX";

  const keyField = "01" + key.length.toString().padStart(2,"0") + key;

  const merchantAccountInfo =
    "00" + gui.length.toString().padStart(2,"0") + gui +
    keyField;

  const merchantAccount =
    "26" + merchantAccountInfo.length.toString().padStart(2,"0") + merchantAccountInfo;

  const txidClean = txid.replace(/[^A-Za-z0-9]/g,"");
  const txidField = "05" + txidClean.length.toString().padStart(2,"0") + txidClean;

  const additionalData =
    "62" + txidField.length.toString().padStart(2,"0") + txidField;

  let payload =
    "000201" +
    "010211" +
    merchantAccount +
    "52040000" +
    "5303986" +
    "54" + amount.length.toString().padStart(2,"0") + amount +
    "5802BR" +
    "59" + merchantName.length.toString().padStart(2,"0") + merchantName +
    "60" + merchantCity.length.toString().padStart(2,"0") + merchantCity +
    additionalData +
    "6304";

  const crc = crc16(payload);

  return payload + crc;
}

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


/* -------- persist form data during login redirect -------- */

function saveDraft(){
  const draft = {
    team: document.getElementById("event-team")?.value || "",
    title: document.getElementById("event-title")?.value || "",
    city: document.getElementById("event-city")?.value || "",
    location: document.getElementById("event-location")?.value || "",
    date: document.getElementById("event-date")?.value || "",
    instagram: document.getElementById("event-instagram")?.value || ""
  };

  localStorage.setItem("eventDraft", JSON.stringify(draft));
}

function restoreDraft(){
  const saved = localStorage.getItem("eventDraft");
  if(!saved) return;

  try{
    const draft = JSON.parse(saved);

    if(document.getElementById("event-team")) document.getElementById("event-team").value = draft.team || "";
    if(document.getElementById("event-title")) document.getElementById("event-title").value = draft.title || "";
    if(document.getElementById("event-city")) document.getElementById("event-city").value = draft.city || "";
    if(document.getElementById("event-location")) document.getElementById("event-location").value = draft.location || "";
    if(document.getElementById("event-date")) document.getElementById("event-date").value = draft.date || "";
    if(document.getElementById("event-instagram")) document.getElementById("event-instagram").value = draft.instagram || "";

  }catch(e){
    console.error("Erro ao restaurar draft", e);
  }
}


/* restore draft only if returning from login redirect */
const loginRedirect = localStorage.getItem("loginRedirect");

if(loginRedirect === "1"){
  restoreDraft();
  localStorage.removeItem("loginRedirect");
}else{
  // normal navigation → ensure form starts clean
  localStorage.removeItem("eventDraft");
}


const imageInput = document.getElementById("event-image");
let preview = document.getElementById("preview");


// capitalizar primeira letra automaticamente
const textFields = [
  "event-title",
  "event-city",
  "event-location",
  "event-instagram"
];

textFields.forEach(id => {
  const field = document.getElementById(id);

  if(field){
    field.addEventListener("input", () => {
      if(field.value.length === 1){
        field.value = field.value.charAt(0).toUpperCase();
      }
      if(field.value.length > 1){
        field.value = field.value.charAt(0).toUpperCase() + field.value.slice(1);
      }
    });
  }
});

// cria preview automaticamente se não existir no HTML
if(imageInput && !preview){
  preview = document.createElement("img");
  preview.id = "preview";
  preview.style.width = "50%";
  preview.style.display = "none";
  preview.style.margin = "10px auto";
  preview.style.borderRadius = "12px";

  imageInput.parentElement.appendChild(preview);
}

if(imageInput && preview){
  imageInput.addEventListener("change", () => {
    const file = imageInput.files[0];
    if(!file) return;

    const reader = new FileReader();

    reader.onload = e => {
      preview.src = e.target.result;
      preview.style.display = "block";
    };

    reader.readAsDataURL(file);
  });
}

// compressão da imagem antes do upload
async function compressImage(file){
  return new Promise((resolve) => {

    const img = new Image();
    const reader = new FileReader();

    reader.onload = e => {
      img.src = e.target.result;
    };

    img.onload = () => {

      const canvas = document.createElement("canvas");

      const maxWidth = 1200; // limite de largura
      const scale = Math.min(maxWidth / img.width, 1);

      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        blob => resolve(blob),
        "image/jpeg",
        0.7 // qualidade 70%
      );

    };

    reader.readAsDataURL(file);
  });
}

async function geocode(city, location){
  try{

    // 🔑 coloque aqui seu token do Mapbox
    const MAPBOX_TOKEN = "pk.eyJ1IjoiZHVja2NyZWF0aXZlIiwiYSI6ImNtbWpzMW5yeTFoZnAycnBvY2Q1Y203NTUifQ.bm0hHqXLaxD9n7FNB7SIGQ";

    const query = encodeURIComponent(`${location}, ${city}, São Paulo, Brasil`);

    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${MAPBOX_TOKEN}&country=br&limit=5`;

    const res = await fetch(url);
    const data = await res.json();

    if(data && data.features && data.features.length){

      const feature = data.features[0];

      const [lng, lat] = feature.center;
const placeName = feature.place_name;

return {
  lat: parseFloat(lat),
  lng: parseFloat(lng),
  place: placeName
};
    }

    // se não encontrar
    return { lat:null, lng:null };

  }catch(e){
    console.error("Erro ao buscar coordenadas Mapbox", e);
  }

  return { lat:null, lng:null };
}

function normalizeText(text){
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"") // remove acentos
    .replace(/[^a-z0-9\s]/g,"")
    .trim();
}

function similarEventName(a,b){
  const t1 = normalizeText(a);
  const t2 = normalizeText(b);

  if(t1 === t2) return true;

  // evita spam com pequenas variações
  if(t1.includes(t2) || t2.includes(t1)) return true;

  return false;
}

const button = document.getElementById("publish-event");
if(button) button.addEventListener("click", async ()=>{

  // verificar usuário logado (Google / Supabase Auth)
  const { data: { user } } = await supabase.auth.getUser();

  if(!user){

    // salvar dados digitados antes do redirect
    saveDraft();

    // mark that we are going to login redirect
    localStorage.setItem("loginRedirect","1");

    // abre login Google automaticamente
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.href
      }
    });
    return;
  }

  const team = document.getElementById("event-team")?.value.trim();
  const title = document.getElementById("event-title").value.trim();
  const city = document.getElementById("event-city").value.trim();
  const normalizedTitle = title.toLowerCase();
  const normalizedCity = city.toLowerCase();
  const location = document.getElementById("event-location").value.trim();
  const date = document.getElementById("event-date").value;
  let instagram = document.getElementById("event-instagram").value.trim();
  const imageFile = document.getElementById("event-image").files[0];
  let image = "";

  // normalizar instagram para formato @usuario
  if(instagram){
    instagram = instagram
      .replace(/^https?:\/\/(www\.)?instagram\.com\//, "")
      .replace(/\/$/, "")
      .replace(/^@?/, "@");
  }

  if(!team || !title || !city || !date || !imageFile){
    showPopup("Preencha equipe, nome, cidade, data e adicione a arte do evento.");
    return;
  }

  // impedir criação de eventos em datas passadas
  const today = new Date();
  today.setHours(0,0,0,0);

  const eventDateCheck = new Date(date);
  eventDateCheck.setHours(0,0,0,0);

  if(eventDateCheck < today){
    showPopup("Não é possível publicar eventos em datas que já passaram.");
    return;
  }

  // proteção anti‑flood (30s entre publicações)
  const lastPublish = localStorage.getItem("lastEventPublish");
  if(lastPublish){
    const diff = Date.now() - parseInt(lastPublish);
    if(diff < 30000){
      showPopup("Aguarde alguns segundos antes de publicar outro evento.");
      return;
    }
  }

  // limite de 3 eventos por dia por organizador (usando instagram como identificador)
  if(instagram){
    const { data: userEventsToday, error: limitError } = await supabase
      .from("events")
      .select("id")
      .eq("instagram", instagram)
      .eq("date", date);

    if(limitError){
      console.error("Erro ao verificar limite diário", limitError);
    }

    if(userEventsToday && userEventsToday.length >= 3){
      showPopup("Você já publicou o limite de eventos para esta data.");
      return;
    }
  }

  // verificar evento duplicado (mesmo nome + cidade + data)
  const { data: existingEvents, error: duplicateError } = await supabase
    .from("events")
    .select("id,title,city")
    .eq("date", date);

  if(duplicateError){
    console.error("Erro ao verificar duplicidade", duplicateError);
  }

  if(existingEvents && existingEvents.length > 0){
    const duplicate = existingEvents.find(ev =>
      similarEventName(ev.title || "", title) &&
      ev.city?.toLowerCase() === normalizedCity
    );

    if(duplicate){
      showPopup("Já existe um evento com este nome nesta cidade nesta data.");
      return;
    }
  }

  /* -------- escolher plano de divulgação -------- */

  const plan = await new Promise(resolve => {

    const overlay = document.createElement("div");
    overlay.className = "app-popup-overlay";

    overlay.innerHTML = `
      <div class="app-popup">

        <div class="app-popup-text" style="font-weight:700;letter-spacing:0.5px;">
          ESCOLHA COMO DIVULGAR SEU EVENTO
        </div>

        <div style="display:flex;align-items:center;gap:6px;">
          <div id="plan-left" style="cursor:pointer;font-size:22px;padding:6px 8px;opacity:.8;">‹</div>
      <div id="plan-slider" class="plan-slider" style="flex:1;overflow-x:auto;scroll-behavior:smooth;">
        <div class="plan-card" data-plan="7" style="background:none;border:none;box-shadow:none;padding:0;">
          <img src="/assets/plans/plan-7.jpg" class="plan-image" style="width:92%;height:auto;display:block;margin:auto;box-shadow:0 10px 28px rgba(0,0,0,0.6);border-radius:16px;">
        </div>

        <div class="plan-card" data-plan="15" style="background:none;border:none;box-shadow:none;padding:0;">
          <img src="/assets/plans/plan-15.jpg" class="plan-image" style="width:92%;height:auto;display:block;margin:auto;box-shadow:0 10px 28px rgba(0,0,0,0.6);border-radius:16px;">
        </div>

        <div class="plan-card" data-plan="30" style="background:none;border:none;box-shadow:none;padding:0;">
          <img src="/assets/plans/plan-30.jpg" class="plan-image" style="width:92%;height:auto;display:block;margin:auto;box-shadow:0 10px 28px rgba(0,0,0,0.6);border-radius:16px;">
        </div>
      </div>
          <div id="plan-right" style="cursor:pointer;font-size:22px;padding:6px 8px;opacity:.8;">›</div>
        </div>

        <div style="display:flex;flex-direction:column;gap:10px;margin-top:14px">

          <button class="app-popup-button" id="plan-highlight">
            Destacar evento
          </button>

          <button class="app-popup-button" id="plan-free" style="background:#333;color:#fff">
            Publicar gratuitamente
          </button>

        </div>

      </div>
    `;

    document.body.appendChild(overlay);

    // fechar popup ao clicar fora dele
    const popupBox = overlay.querySelector(".app-popup");

    // impedir que clique dentro do popup feche ele
    popupBox.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    // clicar no fundo fecha o popup
    overlay.addEventListener("click", () => {
      overlay.remove();
      resolve("cancel");
    });

    // enable horizontal drag/swipe on plan slider
    const slider = overlay.querySelector("#plan-slider");

    // arrow navigation
    const leftArrow = overlay.querySelector("#plan-left");
    const rightArrow = overlay.querySelector("#plan-right");

    if(leftArrow){
      leftArrow.addEventListener("click", ()=>{
        slider.scrollBy({ left: -260, behavior: "smooth" });
      });
    }

    if(rightArrow){
      rightArrow.addEventListener("click", ()=>{
        slider.scrollBy({ left: 260, behavior: "smooth" });
      });
    }

    let isDraggingPlans = false;
    let startXPlans = 0;
    let startScrollPlans = 0;

    if(slider){
      slider.addEventListener("mousedown", (e)=>{
        isDraggingPlans = true;
        startXPlans = e.pageX;
        startScrollPlans = slider.scrollLeft;
        slider.style.cursor = "grabbing";
      });

      window.addEventListener("mouseup", ()=>{
        isDraggingPlans = false;
        slider.style.cursor = "grab";
      });

      slider.addEventListener("mousemove", (e)=>{
        if(!isDraggingPlans) return;
        const dx = e.pageX - startXPlans;
        slider.scrollLeft = startScrollPlans - dx;
      });
    }

    let selectedPlan = null;
    const highlightBtn = overlay.querySelector("#plan-highlight");
    if(highlightBtn){
      highlightBtn.disabled = true;
      highlightBtn.style.opacity = "0.5";
    }

    overlay.querySelectorAll(".plan-card").forEach(card=>{
      card.addEventListener("click",()=>{

        selectedPlan = card.dataset.plan;

        overlay.querySelectorAll(".plan-card").forEach(c=>{
          c.style.transform = "scale(0.95)";
        });

        // destaque visual
        card.style.transform = "scale(1)";

        // ativar botão destacar
        if(highlightBtn){
          highlightBtn.disabled = false;
          highlightBtn.style.opacity = "1";
        }

      });
    });

    overlay.querySelector("#plan-highlight").onclick = () => {

      if(!selectedPlan){
        return;
      }

      overlay.remove();
      resolve(selectedPlan);
    };

    overlay.querySelector("#plan-free").onclick = () => {
      overlay.remove();
      resolve("free");
    };
  });

  // se fechar popup apenas cancela
  if(plan === "cancel"){
    return;
  }

  // gerar referência única para identificar pagamento PIX
  const paymentReference = "EVT-" + Date.now();


  // modo teste: se escolher destaque continua normalmente
  // (simulando que o pagamento já foi feito)
  // ativar estado de carregamento para evitar múltiplos cliques
  const originalBtnText = button.textContent;
  button.disabled = true;
  button.textContent = "Publicando...";

  if(imageFile){

    const fileName = `${Date.now()}_${imageFile.name}`;

    const compressedImage = await compressImage(imageFile);

    const { error: uploadError } = await supabase
      .storage
      .from("event-images")
      .upload(fileName, compressedImage);

    if(uploadError){
      console.error(uploadError);
      showPopup("Erro ao enviar imagem");
      button.disabled = false;
      button.textContent = originalBtnText;
      return;
    }

    const { data } = supabase
      .storage
      .from("event-images")
      .getPublicUrl(fileName);

    image = data.publicUrl;

  }

  const coords = await geocode(city, location);
  let insertedEvent = null;
  let error = null;

  // create event immediately for paid plans (awaiting payment)
  if(plan !== "free"){

    // prevent multiple PIX generations for the same user (reuse pending payment)
    const { data: existingPending } = await supabase
      .from("events")
      .select("id,payment_reference,plan_type")
      .eq("user_id", user.id)
      .eq("payment_status", "awaiting_payment")
      .limit(1)
      .maybeSingle();

    if(existingPending){

      const planPrices = {
        "7": 89,
        "15": 139,
        "30": 199
      };

      const priceValue = planPrices[existingPending.plan_type] || 0;
      const price = `R$${priceValue}`;

      const pixPayload = buildPixPayload(PIX_KEY, priceValue, existingPending.payment_reference);

      const paymentOverlay = document.createElement("div");
      paymentOverlay.className = "app-popup-overlay";

      paymentOverlay.innerHTML = `
        <div class="app-popup">

          <div class="app-popup-text" style="font-weight:700">
            Você já possui um pagamento pendente.
          </div>

          <div style="margin-top:6px;font-size:13px;opacity:.9;">
            Conclua este pagamento antes de criar outro evento.
          </div>

          <div style="margin-top:10px;font-size:14px;">
            Plano selecionado: Destaque ${existingPending.plan_type} dias<br>
            Valor: ${price}
          </div>

          <div style="margin:16px 0;text-align:center;">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(pixPayload)}" style="width:220px;border-radius:12px;">
          </div>

          <div style="font-size:13px;margin-bottom:10px;">
            Chave PIX<br>
            <strong>${PIX_KEY}</strong><br><br>
            Referência do pagamento<br>
            <strong>${existingPending.payment_reference}</strong>
          </div>

          <div style="display:flex;flex-direction:column;gap:8px;">
            <button class="app-popup-button" id="copy-pix-btn">Copiar chave PIX</button>
            <button class="app-popup-button" id="paid-pix-btn">Já paguei o PIX</button>
            <button class="app-popup-button" id="close-pix-btn" style="background:#333;color:#fff">Fechar</button>
          </div>

          <div style="font-size:11px;opacity:.7;margin-top:10px;">
            Após pagar, aguarde a aprovação do evento.
          </div>

        </div>
      `;

      document.body.appendChild(paymentOverlay);

      const copyBtn = paymentOverlay.querySelector("#copy-pix-btn");
      if(copyBtn){
        copyBtn.onclick = () => {
          navigator.clipboard.writeText(PIX_KEY);
          copyBtn.innerText = "Chave copiada";
        };
      }

      const paidBtn = paymentOverlay.querySelector("#paid-pix-btn");
      if(paidBtn){
        paidBtn.onclick = () => {

          paymentOverlay.remove();

          const reviewOverlay = document.createElement("div");
          reviewOverlay.className = "app-popup-overlay";

          reviewOverlay.innerHTML = `
            <div class="app-popup">
              <div class="app-popup-text">
                Pagamento enviado!<br><br>
                Estamos verificando seu PIX e aprovando seu evento.
              </div>

              <div style="display:flex;flex-direction:column;gap:10px;margin-top:14px">
                <button class="app-popup-button" id="follow-webpipa-btn" style="background:#E1306C;color:#fff">Seguir @webpipa</button>
                <button class="app-popup-button" id="close-review-btn" style="background:#333;color:#fff">Fechar</button>
              </div>
            </div>
          `;

          document.body.appendChild(reviewOverlay);

          const followBtn = reviewOverlay.querySelector("#follow-webpipa-btn");
          if(followBtn){
            followBtn.onclick = () => {
              window.open("https://instagram.com/webpipa", "_blank");
            };
          }

          const closeReviewBtn = reviewOverlay.querySelector("#close-review-btn");
          if(closeReviewBtn){
            closeReviewBtn.onclick = () => {
              reviewOverlay.remove();
            };
          }

        };
      }

      const closeBtn = paymentOverlay.querySelector("#close-pix-btn");
      if(closeBtn){
        closeBtn.onclick = () => {
          paymentOverlay.remove();
        };
      }

      button.disabled = false;
      button.textContent = originalBtnText;
      return;
    }

    const result = await supabase
      .from("events")
      .insert([
        {
          team,
          title,
          city,
          location: coords.place || location,
          date,
          instagram,
          image,
          lat: coords.lat,
          lng: coords.lng,
          user_id: user.id,
          plan_type: plan,
          payment_reference: paymentReference,
          payment_amount: plan === "7" ? 89 : plan === "15" ? 139 : 199,
          payment_status: "awaiting_payment"
        }
      ])
      .select()
      .single();

    if(result.error){
      console.error("Erro ao criar evento", result.error);
      showPopup("Erro ao iniciar pagamento.");
      button.disabled = false;
      button.textContent = originalBtnText;
      return;
    }

    insertedEvent = result.data;
    // watch payment approval in realtime
    supabase
      .channel("payment-watch")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "events",
          filter: `id=eq.${insertedEvent.id}`
        },
        (payload) => {

          if(payload.new.payment_status === "paid"){
            showPopup("Pagamento confirmado! Seu evento foi aprovado e já está visível no aplicativo.");
          }

        }
      )
      .subscribe();
  }

  // validar se o endereço foi encontrado
  if(!coords.lat || !coords.lng){
    showPopup("Endereço não encontrado. Verifique a cidade e o local do evento.");
    button.disabled = false;
    button.textContent = originalBtnText;
    return;
  }


  if(plan === "free"){
    const result = await supabase
      .from("events")
      .insert([
        {
          team,
          title,
          city,
          location: coords.place || location,
          date,
          instagram,
          image,
          lat: coords.lat,
          lng: coords.lng,
          user_id: user.id,
          plan_type: plan,
          payment_reference: null,
          payment_amount: 0,
          payment_status: "pending"
        }
      ])
      .select()
      .single();

    insertedEvent = result.data;
    error = result.error;
  }

  if(error){
    console.error(error);
    showPopup("Erro ao publicar evento");
    button.disabled = false;
    button.textContent = originalBtnText;
    return;
  }

  // se plano for pago mostrar popup de pagamento PIX após criar evento
  if(plan !== "free"){

    const planPrices = {
      "7": 89,
      "15": 139,
      "30": 199
    };

    const priceValue = planPrices[plan] || 0;
    const price = `R$${priceValue}`;

    // criar payload PIX válido (Banco Central BR Code)
    const pixPayload = buildPixPayload(PIX_KEY, priceValue, paymentReference);

    const paymentOverlay = document.createElement("div");
    paymentOverlay.className = "app-popup-overlay";

    paymentOverlay.innerHTML = `
      <div class="app-popup">

        <div class="app-popup-text" style="font-weight:700">
          CONFIRME SEU PLANO E REALIZE O PAGAMENTO
        </div>

        <div style="margin-top:10px;font-size:14px;">
          Plano selecionado: Destaque ${plan} dias<br>
          Valor: ${price}
        </div>

        <div style="margin:16px 0;text-align:center;">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(pixPayload)}" style="width:220px;border-radius:12px;">
        </div>

        <div style="font-size:13px;margin-bottom:10px;">
          Chave PIX<br>
          <strong>${PIX_KEY}</strong><br><br>
          Referência do pagamento<br>
          <strong>${paymentReference}</strong>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px;">
          <button class="app-popup-button" id="copy-pix-btn">Copiar chave PIX</button>
          <button class="app-popup-button" id="paid-pix-btn">Já paguei o PIX</button>
          <button class="app-popup-button" style="background:#333;color:#fff" id="close-pix-btn">Fechar</button>
        </div>

        <div style="font-size:11px;opacity:.7;margin-top:10px;">
          Após pagar, aguarde a aprovação do evento.
        </div>

      </div>
    `;

    document.body.appendChild(paymentOverlay);

    const copyBtn = paymentOverlay.querySelector("#copy-pix-btn");
    if(copyBtn){
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(PIX_KEY);
        copyBtn.innerText = "Chave copiada";
      };
    }

    const paidBtn = paymentOverlay.querySelector("#paid-pix-btn");
    if(paidBtn){
      paidBtn.onclick = async () => {
        // prevent double click
        if(paidBtn.dataset.processing === "1") return;
        paidBtn.dataset.processing = "1";
        paidBtn.disabled = true;
        paidBtn.textContent = "Processando...";

        paymentOverlay.remove();

        const reviewOverlay = document.createElement("div");
        reviewOverlay.className = "app-popup-overlay";

        reviewOverlay.innerHTML = `
          <div class="app-popup">
            <div class="app-popup-text">
              Pagamento enviado!<br><br>
              Estamos verificando seu PIX e aprovando seu evento.
            </div>

            <div style="display:flex;flex-direction:column;gap:10px;margin-top:14px">
              <button class="app-popup-button" id="follow-webpipa-btn" style="background:#E1306C;color:#fff">Seguir @webpipa</button>
              <button class="app-popup-button" id="close-review-btn" style="background:#333;color:#fff">Fechar</button>
            </div>
          </div>
        `;

        document.body.appendChild(reviewOverlay);
        
        const followBtn = reviewOverlay.querySelector("#follow-webpipa-btn");
        if(followBtn){
          followBtn.onclick = () => {
            window.open("https://instagram.com/webpipa", "_blank");
          };
        }

        const closeReviewBtn = reviewOverlay.querySelector("#close-review-btn");
        if(closeReviewBtn){
          closeReviewBtn.onclick = () => {
            reviewOverlay.remove();

            const teamField = document.getElementById("event-team");
            if(teamField) teamField.value = "";

            const titleField = document.getElementById("event-title");
            if(titleField) titleField.value = "";

            const cityField = document.getElementById("event-city");
            if(cityField) cityField.value = "";

            const locationField = document.getElementById("event-location");
            if(locationField) locationField.value = "";

            const dateField = document.getElementById("event-date");
            if(dateField) dateField.value = "";

            const instaField = document.getElementById("event-instagram");
            if(instaField) instaField.value = "";

            const imageField = document.getElementById("event-image");
            if(imageField) imageField.value = "";

            if(preview){
              preview.src = "";
              preview.style.display = "none";
            }

            localStorage.removeItem("eventDraft");
          };
        }

      };
    }

    const closeBtn = paymentOverlay.querySelector("#close-pix-btn");
    if(closeBtn){
      closeBtn.onclick = () => {
        paymentOverlay.remove();
      };
    }
  }

  // se o plano for pago, não mostrar popup de sucesso agora
  // o evento ficará aguardando pagamento/aprovação
  if(plan !== "free"){
    button.disabled = false;
    button.textContent = originalBtnText;
    return;
  }
  const successOverlay = document.createElement("div");
  successOverlay.className = "app-popup-overlay";

  successOverlay.innerHTML = `
    <div class="app-popup">
      <div class="app-popup-text">
        Seu evento foi enviado para aprovação.<br><br>
        Assim que aprovado ele aparecerá no aplicativo.
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:14px">
        <button class="app-popup-button" id="follow-webpipa-btn" style="background:#E1306C;color:#fff">Seguir @webpipa</button>
        <button class="app-popup-button" id="close-popup-btn" style="background:#333;color:#fff">Fechar</button>
      </div>
    </div>
  `;

  document.body.appendChild(successOverlay);

  const followBtn = successOverlay.querySelector("#follow-webpipa-btn");
  if(followBtn){
    followBtn.onclick = () => {
      window.open("https://instagram.com/webpipa", "_blank");
    };
  }

  successOverlay.querySelector("#close-popup-btn").onclick = () => {
    successOverlay.remove();
  };
  button.disabled = false;
  button.textContent = originalBtnText;
  localStorage.removeItem("eventDraft");
  // registrar tempo da última publicação
  localStorage.setItem("lastEventPublish", Date.now().toString());

  if(document.getElementById("event-team")) document.getElementById("event-team").value="";
  document.getElementById("event-title").value="";
  document.getElementById("event-city").value="";
  document.getElementById("event-location").value="";
  document.getElementById("event-date").value="";
  document.getElementById("event-instagram").value="";
  document.getElementById("event-image").value="";
  if(preview){
    preview.src = "";
    // preview.style.display = "none";  // removed to avoid duplicated assignment
    preview.style.display = "none";
  }

});
