function createOverlay({ bottomSheet = false, closeOnBackdrop = true } = {}) {
  const overlay = document.createElement("div");
  overlay.className = `app-popup-overlay${bottomSheet ? " bottom-sheet" : ""}`;

  if (closeOnBackdrop) {
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        overlay.remove();
      }
    });
  }

  return overlay;
}

function createPopupShell({
  title = "",
  body = "",
  actions = "",
  bottomSheet = false,
  align = "center",
  compact = false,
  bodyClass = "app-popup-text",
  popupClass = ""
} = {}) {
  const popup = document.createElement("div");
  popup.className = `app-popup${bottomSheet ? " bottom-sheet" : ""}${compact ? " compact" : ""}${popupClass ? ` ${popupClass}` : ""}`;
  const alignClass = align === "left" ? " app-popup-align-left" : "";
  popup.innerHTML = `
    ${title ? `<div class="app-popup-title${alignClass}">${title}</div>` : ""}
    ${body ? `<div class="${bodyClass}${alignClass}">${body}</div>` : ""}
    ${actions ? `<div class="app-popup-actions">${actions}</div>` : ""}
  `;
  popup.addEventListener("click", (event) => event.stopPropagation());
  return popup;
}

export function closePopup(overlay) {
  overlay?.remove();
}

export function showPopup({
  title = "",
  message = "",
  html = "",
  actions = "",
  bottomSheet = false,
  closeOnBackdrop = true,
  align = "center",
  compact = false,
  bodyClass = "app-popup-text",
  popupClass = ""
} = {}) {
  const overlay = createOverlay({ bottomSheet, closeOnBackdrop });
  const popup = createPopupShell({
    title,
    body: html || message,
    actions,
    bottomSheet,
    align,
    compact,
    bodyClass,
    popupClass
  });

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  return { overlay, popup };
}

export function showMessagePopup({
  title = "",
  message,
  buttonLabel = "OK",
  bottomSheet = false,
  closeOnBackdrop = true,
  compact = true,
  align = "center",
  bodyClass = "app-popup-text",
  popupClass = ""
}) {
  const { overlay } = showPopup({
    title,
    message,
    bottomSheet,
    closeOnBackdrop,
    compact,
    align,
    bodyClass,
    popupClass,
    actions: `<button class="app-popup-button" type="button">${buttonLabel}</button>`
  });

  overlay.querySelector(".app-popup-button")?.addEventListener("click", () => {
    closePopup(overlay);
  });

  return overlay;
}

export function showConfirmPopup({
  title = "",
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  bottomSheet = false,
  closeOnBackdrop = true,
  compact = true,
  align = "center",
  bodyClass = "app-popup-text",
  popupClass = "",
  onConfirm,
  onCancel
}) {
  const { overlay } = showPopup({
    title,
    message,
    bottomSheet,
    closeOnBackdrop,
    compact,
    align,
    bodyClass,
    popupClass,
    actions: `
      <button class="app-popup-button" type="button" data-role="confirm">${confirmLabel}</button>
      <button class="app-popup-button app-popup-secondary" type="button" data-role="cancel">${cancelLabel}</button>
    `
  });

  overlay.querySelector('[data-role="confirm"]')?.addEventListener("click", async () => {
    await onConfirm?.();
    closePopup(overlay);
  });

  overlay.querySelector('[data-role="cancel"]')?.addEventListener("click", async () => {
    await onCancel?.();
    closePopup(overlay);
  });

  return overlay;
}

function escapePopupHtml(text) {
  const el = document.createElement("div");
  el.textContent = text == null ? "" : String(text);
  return el.innerHTML;
}

/**
 * Painel de métricas da publicidade (admin) — visual tipo “dashboard”.
 */
export function showHomeAdStatsPopup({
  campaignName = "",
  uniqueViewers = 0,
  impressions = 0,
  clicks = 0,
  buttonLabel = "Fechar",
} = {}) {
  const fmt = (n) => new Intl.NumberFormat("pt-BR").format(Number(n) || 0);
  const nameHtml = escapePopupHtml(campaignName || "Campanha");
  const btnHtml = escapePopupHtml(buttonLabel);

  const iconUsers = `<svg class="home-ad-stats-metric__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
  const iconEye = `<svg class="home-ad-stats-metric__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const iconClick = `<svg class="home-ad-stats-metric__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

  const html = `
    <div class="home-ad-stats-dash">
      <header class="home-ad-stats-dash__head">
        <span class="home-ad-stats-dash__kicker">Métricas em tempo real</span>
        <h3 class="home-ad-stats-dash__name">${nameHtml}</h3>
      </header>
      <div class="home-ad-stats-dash__grid">
        <article class="home-ad-stats-metric home-ad-stats-metric--reach">
          <div class="home-ad-stats-metric__top">${iconUsers}</div>
          <div class="home-ad-stats-metric__value" data-metric="reach">${fmt(uniqueViewers)}</div>
          <div class="home-ad-stats-metric__label">Alcance</div>
          <p class="home-ad-stats-metric__hint">Pessoas distintas</p>
        </article>
        <article class="home-ad-stats-metric home-ad-stats-metric--views">
          <div class="home-ad-stats-metric__top">${iconEye}</div>
          <div class="home-ad-stats-metric__value" data-metric="impressions">${fmt(impressions)}</div>
          <div class="home-ad-stats-metric__label">Impressões</div>
          <p class="home-ad-stats-metric__hint">Total de exibições</p>
        </article>
        <article class="home-ad-stats-metric home-ad-stats-metric--clicks">
          <div class="home-ad-stats-metric__top">${iconClick}</div>
          <div class="home-ad-stats-metric__value" data-metric="clicks">${fmt(clicks)}</div>
          <div class="home-ad-stats-metric__label">Cliques</div>
          <p class="home-ad-stats-metric__hint">Aberturas do link</p>
        </article>
      </div>
    </div>
  `;

  const { overlay } = showPopup({
    title: "",
    html,
    bottomSheet: true,
    closeOnBackdrop: true,
    compact: true,
    align: "left",
    bodyClass: "home-ad-stats-dash-wrap",
    popupClass: "home-ad-stats-popup",
    actions: `<button class="app-popup-button" type="button">${btnHtml}</button>`,
  });

  overlay.querySelector(".app-popup-button")?.addEventListener("click", () => {
    closePopup(overlay);
  });

  return overlay;
}

function renderUsageMetricCard({
  accent,
  icon,
  value,
  label,
  hint,
}) {
  const accentStyle = accent || "#5EB8FF";
  return `
    <article class="home-ad-stats-metric" style="border-color:${accentStyle}33; --home-ad-metric-glow:${accentStyle}2e;">
      <div class="home-ad-stats-metric__top" style="color:${accentStyle}">
        ${icon}
      </div>
      <div class="home-ad-stats-metric__value">${value}</div>
      <div class="home-ad-stats-metric__label">${label}</div>
      <p class="home-ad-stats-metric__hint">${hint}</p>
    </article>
  `;
}

export function showUsageStatsPopup({
  dau = 0,
  mau = 0,
  newUsersWeek = 0,
  newUsersMonth = 0,
  eventsCreatedDay = 0,
  eventsCreatedMonth = 0,
  totalEventViews = 0,
  downloadButtonLabel = "Baixar PDF",
  buttonLabel = "Fechar",
  onDownloadSnapshot = null,
} = {}) {
  const fmt = (n) => new Intl.NumberFormat("pt-BR").format(Number(n) || 0);
  const downloadHtml = escapePopupHtml(downloadButtonLabel);
  const btnHtml = escapePopupHtml(buttonLabel);

  const iconUsers = `<svg class="home-ad-stats-metric__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
  const iconGroup = `<svg class="home-ad-stats-metric__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 20v-2a4 4 0 0 0-3-3.87"/><path d="M7 20v-2a4 4 0 0 1 4-4h2"/><circle cx="9" cy="8" r="3"/><circle cx="16" cy="9" r="2.5"/></svg>`;
  const iconCalendar = `<svg class="home-ad-stats-metric__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v3"/><path d="M16 2v3"/><rect x="3" y="4.5" width="18" height="16" rx="4"/><path d="M3 9h18"/></svg>`;
  const iconEvent = `<svg class="home-ad-stats-metric__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v3"/><path d="M16 2v3"/><rect x="3" y="4.5" width="18" height="16" rx="4"/><path d="M7 11h10"/><path d="M7 15h6"/></svg>`;
  const iconEye = `<svg class="home-ad-stats-metric__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;

  const html = `
    <div class="home-ad-stats-dash">
      <header class="home-ad-stats-dash__head">
        <span class="home-ad-stats-dash__kicker">Resumo do app</span>
        <h3 class="home-ad-stats-dash__name">Estatísticas</h3>
      </header>
      <div class="home-ad-stats-dash__grid home-ad-stats-dash__grid--usage">
        ${renderUsageMetricCard({
          accent: "#5EB8FF",
          icon: iconUsers,
          value: fmt(dau),
          label: "DAU",
          hint: "Usuários ativos hoje",
        })}
        ${renderUsageMetricCard({
          accent: "#C4B5FD",
          icon: iconGroup,
          value: fmt(mau),
          label: "MAU",
          hint: "Usuários ativos no mês",
        })}
        ${renderUsageMetricCard({
          accent: "#34D399",
          icon: iconCalendar,
          value: fmt(newUsersWeek),
          label: "Novos usuários",
          hint: "Na semana",
        })}
        ${renderUsageMetricCard({
          accent: "#22C55E",
          icon: iconCalendar,
          value: fmt(newUsersMonth),
          label: "Novos usuários",
          hint: "No mês",
        })}
        ${renderUsageMetricCard({
          accent: "#F59E0B",
          icon: iconEvent,
          value: fmt(eventsCreatedDay),
          label: "Eventos criados",
          hint: "Hoje",
        })}
        ${renderUsageMetricCard({
          accent: "#F97316",
          icon: iconEvent,
          value: fmt(eventsCreatedMonth),
          label: "Eventos criados",
          hint: "No mês",
        })}
        ${renderUsageMetricCard({
          accent: "#FB7185",
          icon: iconEye,
          value: fmt(totalEventViews),
          label: "Visualizações",
          hint: "Total de eventos",
        })}
      </div>
    </div>
  `;

  const { overlay } = showPopup({
    title: "",
    html,
    bottomSheet: true,
    closeOnBackdrop: true,
    compact: true,
    align: "left",
    bodyClass: "home-ad-stats-dash-wrap",
    popupClass: "home-ad-stats-popup home-usage-stats-popup",
    actions: `
      <button class="app-popup-button app-popup-secondary" type="button" data-role="download">${downloadHtml}</button>
      <button class="app-popup-button" type="button" data-role="close">${btnHtml}</button>
    `,
  });

  overlay.querySelector('[data-role="close"]')?.addEventListener("click", () => {
    closePopup(overlay);
  });

  overlay.querySelector('[data-role="download"]')?.addEventListener("click", () => {
    onDownloadSnapshot?.();
  });

  return overlay;
}
