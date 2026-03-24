import { supabase } from "../supabase.js?v=3";
import { closePopup, showPopup } from "./popup.js?v=5";
import { runHighlightUpgradeFlow } from "../profile-event-upgrade.js?v=8";

const CLICKABLE_EVENT_NOTICE_KINDS = new Set([
  "event_paid_approved",
  "highlight_renewal_approved",
  "report_accepted",
]);

const HIDDEN_EVENT_NOTICE_KINDS = new Set([
  "event_created",
  "report_penalty",
  "report_abusive_penalty",
  "report_warning",
  "report_abusive",
]);

const TEAM_NOTICE_KINDS = new Set([
  "team_join_approved",
  "team_join_rejected",
  "team_role_promoted",
  "team_role_updated",
]);

function escapeHtml(value){
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toMap(value){
  if(!value || typeof value !== "object") return {};
  return { ...value };
}

function getNoticeMetadata(notice){
  const raw = notice?.metadata;
  if(!raw) return {};
  if(typeof raw === "object") return toMap(raw);
  if(typeof raw === "string"){
    try{
      const parsed = JSON.parse(raw);
      return toMap(parsed);
    }catch(_e){
      return {};
    }
  }
  return {};
}

function getNoticeKind(notice){
  return String(notice?.kind || "").trim();
}

function getNoticeTitle(notice){
  const kind = getNoticeKind(notice);
  if(kind === "highlight_expiring_soon"){
    return "Seu destaque está terminando";
  }
  return String(notice?.title || "Aviso").trim() || "Aviso";
}

function getNoticeMessage(notice){
  const kind = getNoticeKind(notice);
  if(kind === "highlight_expiring_soon"){
    return "Clique aqui para renovar.";
  }
  return String(notice?.message || "").trim();
}

function isPositiveNotice(kind){
  return new Set([
    "event_approved",
    "event_paid_approved",
    "highlight_renewal_approved",
    "team_join_approved",
    "team_role_promoted",
    "report_accepted",
  ]).has(kind);
}

function resolveNoticeAction(notice){
  const kind = getNoticeKind(notice);
  const metadata = getNoticeMetadata(notice);
  const eventId = String(metadata.event_id || metadata.eventId || "").trim();
  const teamId = String(metadata.team_id || metadata.teamId || "").trim();

  if(kind === "highlight_expiring_soon" && eventId){
    return { type: "renewal", eventId };
  }

  if(teamId || TEAM_NOTICE_KINDS.has(kind)){
    return { type: "team", teamId };
  }

  if(eventId && CLICKABLE_EVENT_NOTICE_KINDS.has(kind)){
    return { type: "event", eventId };
  }

  return { type: "none" };
}

function noticeBadgeSvg(isPositive){
  return isPositive
    ? `<svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true" fill="currentColor"><path d="M12 20.2c-.24 0-.48-.08-.67-.24-1.55-1.36-2.75-2.34-3.72-3.14C4.73 14.43 3 12.98 3 10.16 3 7.92 4.74 6.2 6.93 6.2c1.33 0 2.61.64 3.42 1.66.81-1.02 2.09-1.66 3.42-1.66 2.19 0 3.93 1.72 3.93 3.96 0 2.82-1.73 4.27-4.61 6.66-.97.8-2.17 1.78-3.72 3.14-.19.16-.43.24-.67.24Z"/></svg>`
    : `<svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 8.2V12.8"/><circle cx="12" cy="16.2" r="1"/><path d="M10.44 4.52L3.54 16.46C3.18 17.09 3 17.4 3.03 17.66C3.05 17.89 3.17 18.1 3.35 18.26C3.55 18.42 3.91 18.42 4.64 18.42H19.36C20.09 18.42 20.45 18.42 20.65 18.26C20.83 18.1 20.95 17.89 20.97 17.66C21 17.4 20.82 17.09 20.46 16.46L13.56 4.52C13.2 3.89 13.02 3.58 12.78 3.47C12.58 3.38 12.42 3.38 12.22 3.47C11.98 3.58 11.8 3.89 10.44 4.52Z"/></svg>`;
}

function renderNoticeCard(notice){
  const kind = getNoticeKind(notice);
  const action = resolveNoticeAction(notice);
  const isPositive = isPositiveNotice(kind);
  const title = escapeHtml(getNoticeTitle(notice));
  const message = escapeHtml(getNoticeMessage(notice));
  const actionClass = action.type !== "none" ? " is-actionable" : "";
  const meta = getNoticeMetadata(notice);
  const eventId = escapeHtml(String(action.eventId || meta.event_id || meta.eventId || "").trim());
  const teamId = escapeHtml(String(action.teamId || meta.team_id || meta.teamId || "").trim());

  return `
    <div class="profile-notice-card${actionClass}" data-notice-id="${escapeHtml(notice.id ?? "")}" data-action-type="${escapeHtml(action.type)}" data-event-id="${eventId}" data-team-id="${teamId}">
      <button type="button" class="profile-notice-main" data-role="open">
        <span class="profile-notice-badge${isPositive ? " is-positive" : ""}">
          ${noticeBadgeSvg(isPositive)}
        </span>
        <span class="profile-notice-copy">
          <span class="profile-notice-title">${title}</span>
          ${message ? `<span class="profile-notice-message">${message}</span>` : ""}
        </span>
      </button>
      <button type="button" class="profile-notice-dismiss" data-role="dismiss" aria-label="Marcar como lida">
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
  `;
}

function renderPopoverHtml(notices){
  if(!notices.length){
    return `
      <div class="profile-notices-popover">
        <div class="profile-notices-head">
          <div class="profile-notices-head__title">Notificações</div>
          <div class="profile-notices-head__actions">
            <button class="profile-notices-action-btn" type="button" data-role="close" aria-label="Fechar">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
        <div class="profile-notices-empty">
          <div class="profile-notices-empty__icon">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M4 19h16"/>
              <path d="M9 19V9a3 3 0 0 1 6 0v10"/>
              <path d="M10 21h4"/>
            </svg>
          </div>
          <div class="profile-notices-empty__text">Sem notificações.</div>
          <button class="profile-notices-action-btn" type="button" data-role="close" aria-label="Fechar">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
    `;
  }

  return `
    <div class="profile-notices-popover">
      <div class="profile-notices-head">
        <div class="profile-notices-head__title">Notificações</div>
        <div class="profile-notices-head__actions">
          <button class="profile-notices-action-btn" type="button" data-role="clear" aria-label="Marcar todas como lidas">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M3 6h18"/>
              <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/>
              <path d="M6 6l1 14h10l1-14"/>
              <path d="M10 11v5M14 11v5"/>
            </svg>
          </button>
          <button class="profile-notices-action-btn" type="button" data-role="close" aria-label="Fechar">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
      <div class="profile-notices-list">
        ${notices.map(renderNoticeCard).join("")}
      </div>
    </div>
  `;
}

export function createProfileNotificationsController({
  buttonEl,
  onOpenTeamAction = null,
  onOpenEvent = null,
  onRenewHighlight = runHighlightUpgradeFlow,
} = {}){
  let userId = null;
  let isLoggedIn = false;
  let notices = [];
  let loading = false;
  let opening = false;
  let overlay = null;
  let shakeTimer = null;
  let shakeTimeout = null;

  function unreadCount(){
    return notices.length;
  }

  function updateButton(){
    if(!buttonEl) return;

    buttonEl.hidden = !isLoggedIn;
    buttonEl.classList.toggle("profile-notifications-button--loading", loading);

    if(!isLoggedIn){
      buttonEl.innerHTML = "";
      return;
    }

    const count = unreadCount();
    const badge = count > 0
      ? `<span class="profile-notifications-button__badge">${count > 9 ? "9+" : count}</span>`
      : "";

    buttonEl.innerHTML = `
      <span class="profile-notifications-button__spinner" aria-hidden="true"></span>
      <svg class="profile-notifications-button__icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 6 3 8H3c0-2 3-1 3-8"/>
        <path d="M10 19a2 2 0 0 0 4 0"/>
      </svg>
      ${badge}
    `;
  }

  function stopShakeTimer(){
    if(shakeTimer){
      clearInterval(shakeTimer);
      shakeTimer = null;
    }
    if(shakeTimeout){
      clearTimeout(shakeTimeout);
      shakeTimeout = null;
    }
  }

  function startShakeTimer(){
    stopShakeTimer();
    if(!isLoggedIn || loading || unreadCount() <= 0) return;

    shakeTimer = window.setInterval(()=>{
      if(!buttonEl || loading || unreadCount() <= 0 || opening) return;
      buttonEl.classList.add("is-shaking");
      shakeTimeout = window.setTimeout(()=>{
        buttonEl.classList.remove("is-shaking");
      }, 720);
    }, 15000);
  }

  function syncState(){
    updateButton();
    startShakeTimer();
  }

  async function refresh(){
    if(!isLoggedIn || !userId){
      notices = [];
      loading = false;
      syncState();
      return [];
    }

    loading = true;
    syncState();

    try{
      try{
        await supabase.rpc("ensure_my_highlight_expiry_notices");
      }catch(rpcError){
        console.warn("ensure_my_highlight_expiry_notices", rpcError);
      }

      const response = await supabase
        .from("user_notices")
        .select("id,kind,title,message,metadata,created_at,read_at")
        .eq("user_id", userId)
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(20);

      notices = Array.isArray(response.data)
        ? response.data.filter((notice) => !HIDDEN_EVENT_NOTICE_KINDS.has(getNoticeKind(notice)))
        : [];
    }catch(error){
      console.warn("profile notifications", error);
      notices = [];
    }finally{
      loading = false;
      syncState();
    }

    return notices;
  }

  async function refreshNow(){
    return refresh();
  }

  async function markNoticeRead(noticeId){
    if(!noticeId) return;
    try{
      await supabase
        .from("user_notices")
        .update({ read_at: new Date().toISOString() })
        .eq("id", noticeId);
    }catch(error){
      console.warn("markNoticeRead", error);
    }
    notices = notices.filter((notice) => String(notice.id) !== String(noticeId));
    syncState();
  }

  async function markAllRead(){
    if(!notices.length || !userId) return;

    const ids = notices.map((notice) => notice.id).filter((id) => id != null);
    if(!ids.length) return;

    try{
      await supabase
        .from("user_notices")
        .update({ read_at: new Date().toISOString() })
        .in("id", ids);
    }catch(error){
      console.warn("markAllRead", error);
    }

    notices = [];
    syncState();
  }

  function closeCurrentPopup(){
    if(overlay){
      closePopup(overlay);
      overlay = null;
    }
  }

  async function openNoticeAction(notice){
    const kind = getNoticeKind(notice);
    const action = resolveNoticeAction(notice);
    const metadata = getNoticeMetadata(notice);
    const eventId = String(action.eventId || metadata.event_id || "").trim();

    if(kind === "highlight_expiring_soon" && eventId){
      await onRenewHighlight?.(eventId);
      return;
    }

    if(action.type === "team"){
      onOpenTeamAction?.();
      return;
    }

    if(action.type === "event" && eventId){
      onOpenEvent?.(eventId);
    }
  }

  function rerenderPopover(){
    if(!overlay) return;

    const popup = overlay.querySelector(".app-popup");
    if(!popup) return;
    popup.innerHTML = renderPopoverHtml(notices);
    bindPopupEvents();
  }

  function bindPopupEvents(){
    if(!overlay) return;

    const popup = overlay.querySelector(".app-popup");
    if(!popup) return;

    popup.querySelectorAll("[data-role='close']").forEach((btn)=>{
      btn.addEventListener("click", ()=>{
        closeCurrentPopup();
      });
    });

    popup.querySelectorAll("[data-role='clear']").forEach((btn)=>{
      btn.addEventListener("click", async ()=>{
        await markAllRead();
        rerenderPopover();
      });
    });

    popup.querySelectorAll(".profile-notice-card").forEach((card)=>{
      const noticeId = card.getAttribute("data-notice-id");
      const actionType = card.getAttribute("data-action-type") || "none";
      const openBtn = card.querySelector('[data-role="open"]');
      const dismissBtn = card.querySelector('[data-role="dismiss"]');

      if(openBtn){
        openBtn.addEventListener("click", async ()=>{
          const notice = notices.find((item) => String(item.id) === String(noticeId));
          if(!notice) return;
          await markNoticeRead(noticeId);
          closeCurrentPopup();
          await openNoticeAction(notice);
        });
      }

      if(dismissBtn){
        dismissBtn.addEventListener("click", async (event)=>{
          event.preventDefault();
          event.stopPropagation();
          await markNoticeRead(noticeId);
          rerenderPopover();
        });
      }

      if(actionType === "none" && openBtn){
        openBtn.disabled = true;
        openBtn.setAttribute("aria-disabled", "true");
      }
    });
  }

  async function open(){
    if(opening || !isLoggedIn || !userId) return;
    opening = true;

    try{
      await refresh();

      const { overlay: createdOverlay, popup } = showPopup({
        title: "",
        html: renderPopoverHtml(notices),
        bottomSheet: false,
        closeOnBackdrop: true,
        compact: true,
        align: "left",
        bodyClass: "profile-notices-body",
        popupClass: "profile-notices-popup",
      });

      overlay = createdOverlay;
      overlay.classList.add("profile-notices-overlay");
      popup.classList.add("profile-notices-popup--inner");
      bindPopupEvents();
    }finally{
      opening = false;
    }
  }

  if(buttonEl){
    buttonEl.addEventListener("click", open);
  }

  const refreshListener = ()=>{
    if(isLoggedIn && userId && !opening){
      refreshNow().catch((error)=>{
        console.warn("profile-notices-refresh", error);
      });
    }
  };
  window.addEventListener("profile-notices-refresh", refreshListener);

  function setUser(nextUserId, nextIsLoggedIn){
    userId = nextUserId || null;
    isLoggedIn = Boolean(nextIsLoggedIn && userId);

    if(!isLoggedIn){
      notices = [];
      loading = false;
      closeCurrentPopup();
      syncState();
      return Promise.resolve([]);
    }

    return refresh();
  }

  syncState();

  return {
    setUser,
    refresh,
    destroy(){
      stopShakeTimer();
      closeCurrentPopup();
      window.removeEventListener("profile-notices-refresh", refreshListener);
      if(buttonEl){
        buttonEl.onclick = null;
      }
    }
  };
}
