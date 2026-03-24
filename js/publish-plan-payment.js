/**
 * UI compartilhada: escolha de plano (7/15/30) + popup PIX.
 * Usada em publicar evento e em destacar evento existente (perfil).
 */
import { closePopup, showPopup as showAppPopup } from "./ui/popup.js";

export const PIX_KEY = "webpipapaypal@gmail.com";
export const PIX_RECEIVER_NAME = "Duck Creative Solutions";

function crc16(str) {
  let crc = 0xffff;
  for (let c = 0; c < str.length; c++) {
    crc ^= str.charCodeAt(c) << 8;
    for (let i = 0; i < 8; i++) {
      if ((crc & 0x8000) !== 0) crc = (crc << 1) ^ 0x1021;
      else crc <<= 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function buildPixPayload(key, value, txid) {
  const merchantName = PIX_RECEIVER_NAME;
  const merchantCity = "SAO PAULO";
  const amount = value.toFixed(2);
  const gui = "BR.GOV.BCB.PIX";
  const keyField = "01" + key.length.toString().padStart(2, "0") + key;
  const merchantAccountInfo = "00" + gui.length.toString().padStart(2, "0") + gui + keyField;
  const merchantAccount =
    "26" + merchantAccountInfo.length.toString().padStart(2, "0") + merchantAccountInfo;
  const txidClean = txid.replace(/[^A-Za-z0-9]/g, "");
  const txidField = "05" + txidClean.length.toString().padStart(2, "0") + txidClean;
  const additionalData = "62" + txidField.length.toString().padStart(2, "0") + txidField;
  let payload =
    "000201" +
    "010211" +
    merchantAccount +
    "52040000" +
    "5303986" +
    "54" + amount.length.toString().padStart(2, "0") + amount +
    "5802BR" +
    "59" + merchantName.length.toString().padStart(2, "0") + merchantName +
    "60" + merchantCity.length.toString().padStart(2, "0") + merchantCity +
    additionalData +
    "6304";
  const crc = crc16(payload);
  return payload + crc;
}

export function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value) || 0);
}

export function createPopupInfoBlock(label, value) {
  return `
    <div class="app-popup-info-block">
      <div class="app-popup-info-block-label">${label}</div>
      <div class="app-popup-info-block-value">${value}</div>
    </div>
  `;
}

export function getPlanBadgeClass(plan) {
  return `publish-plan-badge publish-plan-badge--${plan}`;
}

export function showAwaitingReviewPopup() {
  const { overlay } = showAppPopup({
    compact: true,
    title: "Pagamento enviado!",
    message: "Estamos aprovando seu evento, aguarde.",
    actions: `
      <button class="app-popup-button" type="button" data-role="close">Fechar</button>
    `,
  });

  overlay.querySelector('[data-role="close"]')?.addEventListener("click", () => {
    closePopup(overlay);
  });

  return overlay;
}

/**
 * @param {{ hideFreeOption?: boolean, title?: string, subtitle?: string, headerHtml?: string }} [opts]
 * hideFreeOption: fluxo "só destacar" (ex.: evento já criado no perfil)
 */
export function showPlanPickerPopup(opts = {}) {
  const hideFree = opts.hideFreeOption === true;
  const title = opts.title || "ESCOLHA COMO DIVULGAR SEU EVENTO";
  const subtitle = opts.subtitle || "";
  const headerHtml = opts.headerHtml || "";
  const popupTitle = headerHtml ? "" : title;

  return new Promise((resolve) => {
    const { overlay } = showAppPopup({
      title: popupTitle,
      compact: false,
      closeOnBackdrop: false,
      popupClass: "publish-plan-popup",
      bodyClass: "app-popup-body",
      html: `
        ${headerHtml ? `<div class="publish-plan-header">${headerHtml}</div>` : ""}
        <div class="publish-popup-stack">
          ${subtitle ? `<div class="publish-popup-intro">${subtitle}</div>` : ""}
          <div class="publish-plan-slider" id="plan-slider">
            <button class="publish-plan-card" type="button" data-plan="7">
              <img src="/assets/plans/plan-7.jpg" alt="Plano destaque 7 dias">
            </button>
            <button class="publish-plan-card" type="button" data-plan="15">
              <img src="/assets/plans/plan-15.jpg" alt="Plano destaque 15 dias">
            </button>
            <button class="publish-plan-card" type="button" data-plan="30">
              <img src="/assets/plans/plan-30.jpg" alt="Plano destaque 30 dias">
            </button>
          </div>
        </div>
      `,
      actions: hideFree
        ? `
        <button class="app-popup-button" type="button" id="plan-highlight">Destacar evento</button>
      `
        : `
        <button class="app-popup-button" type="button" id="plan-highlight">Destacar evento</button>
        <button class="app-popup-button app-popup-secondary" type="button" id="plan-free">Publicar gratuitamente</button>
      `,
    });

    let selectedPlan = "7";
    let hasExplicitSelection = false;
    let resolved = false;
    const finish = (value) => {
      if (resolved) return;
      resolved = true;
      closePopup(overlay);
      resolve(value);
    };

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        finish("cancel");
      }
    });

    const highlightBtn = overlay.querySelector("#plan-highlight");
    const slider = overlay.querySelector("#plan-slider");
    const planCards = overlay.querySelectorAll(".publish-plan-card");

    function getClosestCardToCenter() {
      if (!slider || !planCards.length) return null;
      const sliderRect = slider.getBoundingClientRect();
      const sliderCenter = sliderRect.left + sliderRect.width / 2;
      let closestCard = null;
      let closestDistance = Number.POSITIVE_INFINITY;
      planCards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        const cardCenter = rect.left + rect.width / 2;
        const distance = Math.abs(sliderCenter - cardCenter);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestCard = card;
        }
      });
      return closestCard;
    }

    function syncActiveCard() {
      const activeCard = getClosestCardToCenter();
      if (!activeCard) return;
      planCards.forEach((item) => item.classList.remove("is-active"));
      activeCard.classList.add("is-active");
      if (!hasExplicitSelection) {
        selectedPlan = activeCard.dataset.plan || "7";
      }
    }

    function centerCard(card, smooth = true) {
      if (!slider || !card) return;
      const target = card.offsetLeft - (slider.clientWidth - card.clientWidth) / 2;
      slider.scrollTo({
        left: Math.max(0, target),
        behavior: smooth ? "smooth" : "auto",
      });
    }

    let scrollTimer = null;
    slider?.addEventListener("scroll", () => {
      syncActiveCard();
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(syncActiveCard, 80);
    });

    planCards.forEach((card) => {
      card.addEventListener("click", () => {
        selectedPlan = card.dataset.plan || null;
        hasExplicitSelection = true;
        planCards.forEach((item) => item.classList.remove("is-selected"));
        card.classList.add("is-selected");
        centerCard(card);
        syncActiveCard();
      });
    });

    highlightBtn?.addEventListener("click", () => {
      if (!selectedPlan) return;
      finish(selectedPlan);
    });

    if (!hideFree) {
      overlay.querySelector("#plan-free")?.addEventListener("click", () => {
        finish("free");
      });
    }

    const firstCard = planCards[0];
    if (firstCard) {
      requestAnimationFrame(() => {
        centerCard(firstCard, false);
        syncActiveCard();
      });
    }
  });
}

/**
 * @returns {Promise<{ status: "paid" | "closed" }>} Resolves quando o utilizador
 * confirma o PIX ("paid") ou fecha o popup ("closed"). Necessário para o perfil
 * atualizar a lista só depois do upgrade na base.
 */
export function showPixPaymentPopup({ plan, paymentReference, paymentAmount, onPaid }) {
  return new Promise((resolve, reject) => {
  const pixPayload = buildPixPayload(PIX_KEY, paymentAmount, paymentReference);
    const { overlay } = showAppPopup({
      title: "CONFIRME SEU PLANO E REALIZE O PAGAMENTO",
      compact: false,
      closeOnBackdrop: false,
      popupClass: "publish-payment-popup",
      bodyClass: "app-popup-body",
    html: `
      <div class="publish-payment-stack">
        <div class="publish-payment-summary">
          <div class="publish-payment-label">Plano selecionado</div>
          <div class="${getPlanBadgeClass(plan)}">Destaque ${plan} dias</div>
          <div class="publish-payment-value">Valor: ${formatCurrency(paymentAmount)}</div>
        </div>

        <div class="publish-qr-frame publish-qr-frame--${plan}">
          <img
            class="publish-qr-image"
            src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=0&data=${encodeURIComponent(pixPayload)}"
            alt="QR Code PIX"
          >
        </div>

        <div class="publish-payment-meta-grid">
          ${createPopupInfoBlock("Recebedor", PIX_RECEIVER_NAME)}
          ${createPopupInfoBlock("Referência do pagamento", paymentReference)}
        </div>
      </div>
      `,
      // layout compacto premium: o popup fica mais largo para caber os chips em 1 linha
      actions: `
      <button class="app-popup-button" type="button" data-role="copy">Copiar chave PIX</button>
      <button class="app-popup-button app-popup-button-light" type="button" data-role="paid">Já paguei o PIX</button>
      <button class="app-popup-button app-popup-secondary" type="button" data-role="close">Fechar</button>
    `,
  });

  const copyBtn = overlay.querySelector('[data-role="copy"]');
  const paidBtn = overlay.querySelector('[data-role="paid"]');

  function settle(status) {
    closePopup(overlay);
    resolve({ status });
  }

  copyBtn?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(pixPayload);
    copyBtn.textContent = "PIX copia e cola copiado";
  });

  paidBtn?.addEventListener("click", async () => {
    if (paidBtn.dataset.processing === "1") return;
    paidBtn.dataset.processing = "1";
    paidBtn.disabled = true;
    paidBtn.textContent = "Processando...";

    try {
      await onPaid?.();
      settle("paid");
    } catch (err) {
      paidBtn.dataset.processing = "0";
      paidBtn.disabled = false;
      paidBtn.textContent = "Já paguei o PIX";
      reject(err);
    }
  });

  overlay.querySelector('[data-role="close"]')?.addEventListener("click", () => {
    settle("closed");
  });
  });
}
