const PREMIUM_PLAN_DAYS = {
  "7": 7,
  "15": 15,
  "30": 30,
};

export function normalizeHighlightPlan(planType) {
  return String(planType ?? "").trim().toLowerCase();
}

export function isHighlightPlan(planType) {
  const normalized = normalizeHighlightPlan(planType);
  return normalized === "7" || normalized === "15" || normalized === "30" || normalized === "highlight";
}

export function highlightPlanDays(planType) {
  const normalized = normalizeHighlightPlan(planType);
  return PREMIUM_PLAN_DAYS[normalized] ?? null;
}

export function isHighlightActive({
  planType,
  paymentStatus,
  highlightStartedAt,
  createdAt,
  eventDate,
  referenceTime = new Date(),
} = {}) {
  const normalizedPlan = normalizeHighlightPlan(planType);
  const normalizedStatus = normalizeHighlightPlan(paymentStatus);

  if (normalizedStatus === "awaiting_payment") {
    return true;
  }

  if (!isHighlightPlan(normalizedPlan)) {
    return false;
  }

  if (normalizedPlan === "highlight") {
    return normalizedStatus === "paid" || normalizedStatus === "approved";
  }

  if (normalizedStatus !== "paid" && normalizedStatus !== "approved") {
    return false;
  }

  if (eventDate) {
    const eventDay = new Date(eventDate);
    if (!Number.isNaN(eventDay.getTime())) {
      const today = new Date(referenceTime);
      if (!Number.isNaN(today.getTime())) {
        const eventOnly = new Date(eventDay.getFullYear(), eventDay.getMonth(), eventDay.getDate());
        const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        if (todayOnly > eventOnly) {
          return false;
        }
      }
    }
  }

  const baseRaw = highlightStartedAt || createdAt;
  if (!baseRaw) return false;

  const base = new Date(baseRaw);
  if (Number.isNaN(base.getTime())) return false;

  const days = highlightPlanDays(normalizedPlan);
  if (days == null) return false;

  const now = referenceTime instanceof Date ? referenceTime : new Date(referenceTime);
  if (Number.isNaN(now.getTime())) return false;

  const diffDays = Math.floor((now.getTime() - base.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays <= days;
}

export function isHighlightActiveEvent(event, options = {}) {
  if (!event) return false;

  return isHighlightActive({
    planType: event.plan_type,
    paymentStatus: event.payment_status,
    highlightStartedAt: event.highlight_started_at,
    createdAt: event.created_at,
    eventDate: event.date,
    referenceTime: options.referenceTime,
  });
}

export function highlightDisplayPriority(event, options = {}) {
  if (!event) return 0;

  if (!isHighlightActiveEvent(event, options)) {
    return 0;
  }

  const normalizedStatus = normalizeHighlightPlan(event.payment_status);
  if (normalizedStatus === "awaiting_payment") {
    return 2;
  }

  const normalizedPlan = normalizeHighlightPlan(event.plan_type);
  if (normalizedPlan === "30") return 3;
  if (normalizedPlan === "15") return 2;
  return 1;
}
