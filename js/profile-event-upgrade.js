/**
 * Fluxo "Destacar" no perfil: mesmo modal de planos + PIX da publicação,
 * mas atualiza evento existente (grátis → awaiting_payment + plano).
 */
import { supabase } from "./supabase.js";
import {
  findAwaitingPaymentForEvent,
  getPlanPrice,
  upgradeFreeEventToAwaitingPayment,
} from "./services/publish.js";
import {
  showAwaitingReviewPopup,
  showPixPaymentPopup,
  showPlanPickerPopup,
} from "./publish-plan-payment.js?v=4";

export async function runHighlightUpgradeFlow(eventId) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    alert("Faça login para destacar o evento.");
    return;
  }

  const plan = await showPlanPickerPopup({
    hideFreeOption: true,
    headerHtml: `
      <div class="publish-plan-header__title">
        <span class="publish-plan-header__title--light">Destaque </span>
        <span class="publish-plan-header__title--accent">seu evento</span>
      </div>
      <div class="publish-plan-header__line"></div>
      <div class="publish-plan-header__subtitle">Escolha seu plano de destaque.</div>
    `,
  });
  if (plan === "cancel" || plan === "free") return;

  const paymentReference = "EVT-" + Date.now();
  const priceValue = getPlanPrice(plan);

  let existingForEvent = null;
  try {
    existingForEvent = await findAwaitingPaymentForEvent({
      userId: user.id,
      eventId,
    });
  } catch (e) {
    console.error(e);
  }

  if (existingForEvent) {
    const amount = getPlanPrice(existingForEvent.plan_type);
    await showPixPaymentPopup({
      plan: existingForEvent.plan_type,
      paymentReference: existingForEvent.payment_reference,
      paymentAmount: amount,
      onPaid: async () => {
        showAwaitingReviewPopup();
      },
    });
    return;
  }

  await showPixPaymentPopup({
    plan,
    paymentReference,
    paymentAmount: priceValue,
    onPaid: async () => {
      await upgradeFreeEventToAwaitingPayment({
        eventId,
        plan,
        paymentReference,
        paymentAmount: priceValue,
      });

      supabase
        .channel(`payment-watch-${eventId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "events",
            filter: `id=eq.${eventId}`,
          },
          (payload) => {
            if (payload.new.payment_status === "paid") {
              alert("Pagamento confirmado! Seu evento já pode aparecer em destaque no app.");
            }
          }
        )
        .subscribe();

      showAwaitingReviewPopup();
    },
  });
}
