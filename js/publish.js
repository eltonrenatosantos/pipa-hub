// /js/publish.js

import { supabase } from "./supabase.js";
import { getAuthRedirectUrl, storeAuthReturnUrl } from "./auth-redirect.js";
import { closePopup, showMessagePopup, showPopup as showAppPopup } from "./ui/popup.js";
import { beginPageLoad, finishPageLoad } from "./ui/page-loader.js?v=2";
import {
  buildLocation,
  buildLocationPreview,
  clearPublishDraft,
  countEventsForInstagramOnDate,
  fetchCep,
  findAwaitingPayment,
  formatCep,
  geocode,
  getPlanPrice,
  getMyPublishTeam,
  isCompleteAddress,
  insertEvent,
  loadEventsByDate,
  loadPublishDraft,
  mapPlanToEventType,
  markPublishNow,
  millisecondsSinceLastPublish,
  onlyDigits,
  savePublishDraft,
  similarEventName,
  uploadEventImage,
  validateImageFile
} from "./services/publish.js?v=3";
import {
  showAwaitingReviewPopup,
  showPixPaymentPopup,
  showPlanPickerPopup
} from "./publish-plan-payment.js?v=4";

beginPageLoad();

/** Nome do evento: maiúsculas, sem emoji, máx. 35 caracteres */
const EVENT_TITLE_MAX_LEN = 35;

function stripEmojisFromTitle(str){
  return String(str)
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\u2764\uFE0F?/gu, "")
    .replace(/\uFE0F/g, "")
    .replace(/\u200D/g, "");
}

function normalizeEventTitleValue(raw){
  return stripEmojisFromTitle(raw).toUpperCase().slice(0, EVENT_TITLE_MAX_LEN);
}

function showPopup(message){
  showMessagePopup({ message });
}

function formatPublishDisplayDate(value){
  const raw = String(value || "").trim();
  if(!raw) return "";
  const [year, month, day] = raw.split("-");
  if(!year || !month || !day) return raw;
  return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
}

function resetPublishForm(){
  if(document.getElementById("event-team")){
    document.getElementById("event-team").value = lockedTeamName || "";
  }

  if(document.getElementById("event-title")) document.getElementById("event-title").value = "";
  if(document.getElementById("event-cep")) document.getElementById("event-cep").value = "";
  if(document.getElementById("event-city")) document.getElementById("event-city").value = "";
  if(document.getElementById("event-number")) document.getElementById("event-number").value = "";
  if(document.getElementById("event-location")) document.getElementById("event-location").value = "";
  if(document.getElementById("event-date")) document.getElementById("event-date").value = "";
  if(document.getElementById("event-date-display")) document.getElementById("event-date-display").value = "";
  if(document.getElementById("event-instagram")) document.getElementById("event-instagram").value = "";
  if(document.getElementById("event-description")) document.getElementById("event-description").value = "";
  if(document.getElementById("event-image")) document.getElementById("event-image").value = "";
  if(document.getElementById("event-image-name")){
    document.getElementById("event-image-name").textContent = "Nenhum arquivo escolhido";
    document.getElementById("event-image-name").classList.remove("has-file");
  }

  cepData = null;
  cepDataCep = "";

  if(preview){
    preview.src = "";
    preview.style.display = "none";
  }

  clearPublishDraft();
}

function showFreePublishSuccessPopup(){
  const { overlay } = showAppPopup({
    compact: true,
    message: "Evento enviado para aprovação!",
    actions: `
      <button class="app-popup-button" type="button" data-role="close">Fechar</button>
    `
  });

  overlay.querySelector('[data-role="close"]')?.addEventListener("click", () => {
    closePopup(overlay);
  });

  return overlay;
}

/* -------- persist form data during login redirect -------- */

function saveDraft(){
  const eventDateValue = document.getElementById("event-date")?.value || "";
  const draft = {
    team: document.getElementById("event-team")?.value || "",
    title: document.getElementById("event-title")?.value || "",
    cep: document.getElementById("event-cep")?.value || "",
    city: document.getElementById("event-city")?.value || "",
    number: document.getElementById("event-number")?.value || "",
    location: document.getElementById("event-location")?.value || "",
    date: eventDateValue,
    instagram: document.getElementById("event-instagram")?.value || "",
    description: document.getElementById("event-description")?.value || ""
  };

  savePublishDraft(draft);
}

function restoreDraft(){
  const draft = loadPublishDraft();
  if(!draft) return;

  if(document.getElementById("event-team")) document.getElementById("event-team").value = draft.team || "";
  if(document.getElementById("event-title")){
    document.getElementById("event-title").value = normalizeEventTitleValue(draft.title || "");
  }
  if(document.getElementById("event-cep")) document.getElementById("event-cep").value = draft.cep || "";
  if(document.getElementById("event-city")) document.getElementById("event-city").value = draft.city || "";
  if(document.getElementById("event-number")) document.getElementById("event-number").value = draft.number || "";
  if(document.getElementById("event-location")) document.getElementById("event-location").value = draft.location || "";
  if(document.getElementById("event-date")) document.getElementById("event-date").value = draft.date || "";
  if(document.getElementById("event-date-display")) document.getElementById("event-date-display").value = formatPublishDisplayDate(draft.date || "");
  if(document.getElementById("event-instagram")) document.getElementById("event-instagram").value = draft.instagram || "";
  if(document.getElementById("event-description")) document.getElementById("event-description").value = draft.description || "";
}


/* restore draft only if returning from login redirect */

const loginRedirect = localStorage.getItem("loginRedirect");

if(loginRedirect === "1"){
  restoreDraft();
  localStorage.removeItem("loginRedirect");
}else{
  // normal navigation → ensure form starts clean
  clearPublishDraft();
}

const teamField = document.getElementById("event-team");
let lockedTeamName = "";

async function syncPublishTeamField(){
  if(!teamField) return;

  teamField.readOnly = false;
  teamField.disabled = false;
  teamField.placeholder = "Nome da equipe";
  lockedTeamName = "";

  let myTeamData;
  try{
    myTeamData = await getMyPublishTeam();
  }catch(myTeamError){
    console.error("Erro ao carregar equipe do usuário no publish", myTeamError);
    return;
  }
  if(!myTeamData) return;

  if(myTeamData.state === "owner" || myTeamData.state === "member"){
    lockedTeamName = (myTeamData.team_name || "").trim();

    if(lockedTeamName){
      teamField.value = lockedTeamName;
      teamField.readOnly = true;
      teamField.setAttribute("aria-readonly", "true");
      teamField.style.opacity = "0.8";
      teamField.style.cursor = "not-allowed";
    }
  }
}

Promise.resolve(syncPublishTeamField())
  .catch((error) => {
    console.error("Erro ao sincronizar equipe no publish", error);
  })
  .finally(() => {
    finishPageLoad();
  });

const cepField = document.getElementById("event-cep");
const numberField = document.getElementById("event-number");
const cityField = document.getElementById("event-city");
const locationField = document.getElementById("event-location");

let cepData = null;
let cepDataCep = "";

function updateLocationFromCep(){
  if(!cepData) return;
  if(!locationField) return;

  const street = cepData.logradouro || "";
  const neighborhood = cepData.bairro || "";
  const number = numberField?.value || "";

  const fullLocation = buildLocation(street, number, neighborhood);
  const previewLocation = buildLocationPreview(street, neighborhood);

  locationField.value = fullLocation || previewLocation;
}

async function ensureCepDataForSubmit(rawCep){
  const cleanCep = onlyDigits(rawCep);
  if(cleanCep.length !== 8){
    return null;
  }

  if(cepData && cepDataCep === cleanCep){
    return cepData;
  }

  const data = await fetchCep(cleanCep);
  cepData = data;
  cepDataCep = cleanCep;

  if(cityField && data.localidade){
    cityField.value = data.localidade;
  }

  updateLocationFromCep();
  saveDraft();

  return data;
}

if(cepField){
  cepField.addEventListener("input", ()=>{
    cepField.value = formatCep(cepField.value);
  });

  cepField.addEventListener("blur", async ()=>{
    const cleanCep = onlyDigits(cepField.value);

    if(!cleanCep) return;

    try{
      const data = await fetchCep(cleanCep);
      cepData = data;
      cepDataCep = cleanCep;

      if(cityField && data.localidade){
        cityField.value = data.localidade;
      }

      updateLocationFromCep();
      saveDraft();

    }catch(e){
      console.error(e);
      showPopup(e.message || "Erro ao buscar CEP.");
    }
  });
}

if(numberField){
  numberField.addEventListener("input", ()=>{
    updateLocationFromCep();
    saveDraft();
  });
}


const imageInput = document.getElementById("event-image");
const imageTrigger = document.getElementById("event-image-trigger");
const imageName = document.getElementById("event-image-name");
let preview = document.getElementById("preview");
const eventDateInput = document.getElementById("event-date");
const eventDateDisplay = document.getElementById("event-date-display");

function syncPublishDateDisplay(){
  if(!eventDateDisplay) return;
  eventDateDisplay.value = formatPublishDisplayDate(eventDateInput?.value || "");
}

if(eventDateInput){
  eventDateInput.addEventListener("change", () => {
    syncPublishDateDisplay();
    saveDraft();
  });

  eventDateInput.addEventListener("input", () => {
    syncPublishDateDisplay();
  });
}

syncPublishDateDisplay();


// Nome do evento: só maiúsculas, sem emoji, máx. 35 (regras em normalizeEventTitleValue)
const titleField = document.getElementById("event-title");
if(titleField){
  const syncTitle = ()=>{
    const next = normalizeEventTitleValue(titleField.value);
    if(next !== titleField.value) titleField.value = next;
  };
  titleField.addEventListener("input", syncTitle);
  titleField.addEventListener("blur", syncTitle);
}

// capitalizar primeira letra automaticamente (exceto título, que é tudo maiúsculo)
const textFields = [
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
  preview.className = "publish-image-preview";

  imageInput.parentElement.appendChild(preview);
}

if(imageInput && preview){
  imageTrigger?.addEventListener("click", () => {
    imageInput.click();
  });

  imageInput.addEventListener("change", () => {
    const file = imageInput.files[0];
    if(!file){
      if(imageName){
        imageName.textContent = "Nenhum arquivo escolhido";
        imageName.classList.remove("has-file");
      }
      return;
    }

    if(imageName){
      imageName.textContent = file.name;
      imageName.classList.add("has-file");
    }

    const reader = new FileReader();

    reader.onload = e => {
      preview.src = e.target.result;
      preview.style.display = "block";
    };

    reader.readAsDataURL(file);
  });
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
    storeAuthReturnUrl("/pages/publish.html");

    // abre login Google automaticamente
    const loginRedirectUrl = getAuthRedirectUrl("/pages/publish.html");

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: loginRedirectUrl
      }
    });
    return;
  }

  let publishTeamState = null;
  const { data: publishMyTeamData, error: publishMyTeamError } = await supabase.rpc("get_my_team");

  if(publishMyTeamError){
    console.error("Erro ao validar equipe do usuário", publishMyTeamError);
  }else{
    publishTeamState = publishMyTeamData;
  }

  const team = document.getElementById("event-team")?.value.trim();
  const title = normalizeEventTitleValue(document.getElementById("event-title")?.value || "").trim();
  const cep = document.getElementById("event-cep")?.value.trim() || "";
  const number = document.getElementById("event-number")?.value.trim() || "";
  const location = document.getElementById("event-location").value.trim();
  const date = document.getElementById("event-date").value;
  let instagram = document.getElementById("event-instagram").value.trim();
  const description = document.getElementById("event-description")?.value.trim() || null;
  const imageFile = document.getElementById("event-image").files[0];
  let image = "";

  // normalizar instagram para formato @usuario
  if(instagram){
    instagram = instagram
      .replace(/^https?:\/\/(www\.)?instagram\.com\//, "")
      .replace(/\/$/, "")
      .replace(/^@?/, "@");
  }

    if(!team || !title || !date || !imageFile){
    showPopup("Preencha equipe, nome, data e adicione a arte do evento.");
    return;
  }

  if(!cep){
    showPopup("Informe o CEP do evento.");
    return;
  }

  let submitCepData = null;
  try{
    submitCepData = await ensureCepDataForSubmit(cep);
  }catch(cepError){
    console.error("Erro ao validar CEP no envio", cepError);
    showPopup(cepError.message || "CEP não encontrado. Revise o número informado.");
    return;
  }

  if(!submitCepData){
    showPopup("Informe um CEP válido com 8 números.");
    return;
  }

  const submitCity = String(submitCepData.localidade || "").trim();
  const submitUf = String(submitCepData.uf || "").trim();
  if(!submitCity){
    showPopup("Não foi possível identificar a cidade do CEP informado.");
    button.disabled = false;
    button.textContent = originalBtnText;
    return;
  }
  const normalizedTitle = title.toLowerCase();
  const normalizedCity = submitCity.toLowerCase();

  if(!number){
    showPopup("Informe o número do endereço do evento.");
    return;
  }

  const imageValidationError = validateImageFile(imageFile);
  if(imageValidationError){
    showPopup(imageValidationError);
    return;
  }

  if(!isCompleteAddress(location)){
    showPopup("Informe o endereço completo com rua, número e bairro.");
    return;
  }

  if(
    publishTeamState &&
    (publishTeamState.state === "team_pending_approval" || publishTeamState.state === "team_rejected")
  ){
    showPopup(
      publishTeamState.state === "team_pending_approval"
        ? "Sua equipe ainda está em aprovação. Você poderá publicar eventos com o nome da equipe após a aprovação do administrador."
        : "O registro da sua equipe não foi aprovado. Não é possível publicar eventos vinculados a ela no momento."
    );
    return;
  }

  if(publishTeamState && (publishTeamState.state === "owner" || publishTeamState.state === "member")){
    const allowedTeamName = (publishTeamState.team_name || "").trim();

    if(!allowedTeamName){
      showPopup("Não foi possível identificar a equipe do seu usuário.");
      return;
    }

    if(team !== allowedTeamName){
      showPopup("Este usuário não pertence a essa equipe.");
      return;
    }
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
  const lastPublishDiff = millisecondsSinceLastPublish();
  if(lastPublishDiff !== null && lastPublishDiff < 30000){
    showPopup("Aguarde alguns segundos antes de publicar outro evento.");
    return;
  }

  // limite de 3 eventos por dia por organizador (usando instagram como identificador)
  if(instagram){
    try{
      const userEventsToday = await countEventsForInstagramOnDate({ instagram, date });

      if(userEventsToday >= 3){
        showPopup("Você já publicou o limite de eventos para esta data.");
        return;
      }
    }catch(limitError){
      console.error("Erro ao verificar limite diário", limitError);
    }
  }

  // verificar evento duplicado (mesmo nome + cidade + data)
  let existingEvents = [];
  try{
    existingEvents = await loadEventsByDate(date);
  }catch(duplicateError){
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

  const plan = await showPlanPickerPopup();

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

    try{
      image = await uploadEventImage(imageFile);
    }catch(uploadProcessError){
      console.error(uploadProcessError);
      const uploadMessage = uploadProcessError.message && uploadProcessError.message.toLowerCase().includes("invalid key")
        ? "O nome da imagem contém caracteres inválidos. Renomeie a imagem e tente novamente."
        : (uploadProcessError.message || "Não foi possível processar a imagem. Tente outra imagem.");
      showPopup(uploadMessage);
      button.disabled = false;
      button.textContent = originalBtnText;
      return;
    }

  }

  const coords = await geocode(submitCity, location, cep, submitUf);
  let insertedEvent = null;
  let error = null;

  // validar se o endereço foi encontrado antes de qualquer criação de evento
  if(!coords.lat || !coords.lng){
    showPopup("Não foi possível localizar esse endereço. Revise rua, número e bairro.");
    button.disabled = false;
    button.textContent = originalBtnText;
    return;
  }

  // para planos pagos, só reutiliza pagamento pendente do mesmo plano já enviado para análise
  if(plan !== "free"){

    // prevent multiple PIX generations for the same user (reuse pending payment)
    let existingPending = null;
    try{
      existingPending = await findAwaitingPayment({ userId: user.id, plan });
    }catch(existingPendingError){
      console.error("Erro ao buscar pagamento pendente", existingPendingError);
    }

    if(existingPending){
      const priceValue = getPlanPrice(existingPending.plan_type);

      showPixPaymentPopup({
        plan: existingPending.plan_type,
        paymentReference: existingPending.payment_reference,
        paymentAmount: priceValue,
        onPaid: async () => {
          showAwaitingReviewPopup();
        }
      }).catch((err) => console.error(err));

      button.disabled = false;
      button.textContent = originalBtnText;
      return;
    }

  }



  if(plan === "free"){
    try{
      insertedEvent = await insertEvent({
        team,
        title,
        city: submitCity,
        location,
        date,
        instagram,
        description,
        image,
        lat: coords.lat,
        lng: coords.lng,
        user_id: user.id,
        plan_type: plan,
        payment_reference: null,
        payment_amount: 0,
        payment_status: "pending"
      });

      const eventType = mapPlanToEventType(plan);

      if(eventType){
        const { error: scoreError } = await supabase.rpc("add_event_points", {
          p_user_id: user.id,
          p_event_type: eventType
        });

        if(scoreError){
          console.error("Erro ao registrar pontuação do evento gratuito", scoreError);
        }
      }

    }catch(insertError){
      error = insertError;
    }
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
    const priceValue = getPlanPrice(plan);
    showPixPaymentPopup({
      plan,
      paymentReference,
      paymentAmount: priceValue,
      onPaid: async () => {
        try{
          insertedEvent = await insertEvent({
            team,
            title,
            city: submitCity,
            location,
            date,
            instagram,
            description,
            image,
            lat: coords.lat,
            lng: coords.lng,
            user_id: user.id,
            plan_type: plan,
            payment_reference: paymentReference,
            payment_amount: priceValue,
            payment_status: "awaiting_payment"
          });
        }catch(resultError){
          console.error("Erro ao criar evento", resultError);
          showPopup("Erro ao iniciar pagamento.");
          throw resultError;
        }

        supabase
          .channel(`payment-watch-${insertedEvent.id}`)
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

        markPublishNow();
        clearPublishDraft();
        resetPublishForm();
        showAwaitingReviewPopup();
      }
    }).catch((err) => console.error(err));
  }

  // se o plano for pago, não mostrar popup de sucesso agora
  // o evento ficará aguardando pagamento/aprovação
  if(plan !== "free"){
    button.disabled = false;
    button.textContent = originalBtnText;
    return;
  }
  showFreePublishSuccessPopup();
  button.disabled = false;
  button.textContent = originalBtnText;
  clearPublishDraft();
  markPublishNow();
  resetPublishForm();

});
